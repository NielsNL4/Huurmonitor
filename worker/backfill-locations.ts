/** Explicit admin maintenance only. Never imports the ingestion/delivery entrypoint. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isDeepStrictEqual } from 'node:util';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import type { Home, Listing, Profile } from '../shared/model';
import { addressKey, canonicalAddressKey, currentAddress, houseNumberAddress } from '../shared/address';
import { effectiveLocation } from '../shared/location';
import { currentOfficialGeography } from '../shared/official-geography';
import { evaluate } from '../shared/matcher';
import { enrichGeocoding, geocodingUrl, readPDOKJson } from './geocoding';
import { enrichOfficialGeography, geographyUrl } from './official-geography';

const metadata = ['addressEvidence','geocoding','officialGeography'] as const;
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve,ms));
export function businessState(home: Home) {
  const value = structuredClone(home);
  for (const field of metadata) delete value.listing[field];
  return value;
}
export function assertMetadataOnly(before: Home, after: Home) {
  if (!isDeepStrictEqual(businessState(before),businessState(after))) throw new Error('Nonmetadata change rejected');
}
export function composeHome(original: Home, enriched: Listing): Home {
  const next = structuredClone(original);
  for (const field of metadata) {
    if (Object.hasOwn(enriched,field)) (next.listing as any)[field] = structuredClone(enriched[field]);
  }
  assertMetadataOnly(original,next);
  return next;
}

/** One shared serial reader across both providers and every batch. No transport retries. */
export function boundedReader(options: {read?: typeof readPDOKJson; clock?: ()=>number; pause?: typeof pause; used?: number; cap?: number; cache?: boolean} = {}) {
  const clock = options.clock ?? Date.now, wait = options.pause ?? pause;
  let used = options.used ?? 0, stopped: null | 'service' | 'cap' | 'parse' = null;
  let last = clock();
  const blocked = new Set<string>();
  const responses = new Map<string,unknown>(); let cacheHits = 0;
  const read = async (url: string) => {
    if (options.cache && responses.has(url)) { cacheHits++; return responses.get(url); }
    if (stopped || used >= (options.cap ?? 300)) {
      stopped ??= 'cap'; blocked.add(url); throw new Error('Provider budget stopped');
    }
    await wait(Math.max(0,2000-(clock()-last)));
    last = clock(); used++;
    try { const response = await (options.read ?? readPDOKJson)(url);if(options.cache) responses.set(url,response);return response; }
    catch { stopped = 'service'; throw new Error('Provider transport stopped'); }
  };
  return {read,blocked, stopParse:()=>{ stopped = 'parse'; }, get used(){return used;}, get stopped(){return stopped;}, get cacheHits(){return cacheHits;}};
}

export function fallbackTargets(homes: Home[], limit=29) {
  const unresolved = homes.map((h,i)=>!effectiveLocation(h.listing) ? i : -1).filter(i=>i>=0);
  if (unresolved.length > limit) throw new Error('Target inventory exceeds authorized unresolved bound');
  return unresolved.map(index=>({index,address:houseNumberAddress(homes[index].listing,'house-number-v2')}));
}

export function casUrl(base: string, owner: string, key: string, old: Home) {
  const url = new URL(`${base.replace(/\/$/,'')}/rest/v1/homes`);
  url.search = new URLSearchParams({owner_id:`eq.${owner}`,key:`eq.${key}`,data:`eq.${JSON.stringify(old)}`,select:'key'}).toString();
  return url.href;
}
export async function writeMetadata(db: SupabaseClient, base: string, owner: string, key: string, old: Home, next: Home) {
  assertMetadataOnly(old,next);
  if (isDeepStrictEqual(old,next)) return 'unchanged';
  if (casUrl(base,owner,key,old).length > 28_000) return 'oversize';
  try {
    const {data,error,status} = await db.from('homes').update({data:next}).eq('owner_id',owner).eq('key',key).eq('data',JSON.stringify(old)).select('key');
    if (!error) return data?.length === 1 ? 'applied' : data?.length === 0 ? 'conflict' : 'uncertain';
    if (status === 414 || /uri|url|request.{0,10}(large|long)/i.test(error.message)) return 'oversize';
  } catch { /* An uncertain response is resolved by readback, never retried. */ }
  try {
    const {data,error} = await db.from('homes').select('data').eq('owner_id',owner).eq('key',key).single();
    if (!error && isDeepStrictEqual(data?.data,next)) return 'confirmedByReadback';
    if (!error && isDeepStrictEqual(data?.data,old)) return 'writeError';
  } catch { /* Report uncertainty without leaking response bodies. */ }
  return 'uncertain';
}

async function assertIdle() {
  const run = promisify(execFile);
  const {stdout:runs} = await run('gh',['run','list','--workflow','monitor.yml','--limit','100','--json','status']);
  if (JSON.parse(runs).some((r: {status:string})=>['queued','in_progress','waiting','pending','requested'].includes(r.status))) {
    console.log(JSON.stringify({phase:'blocked',reason:'active-monitor'}));throw new Error('Active monitor workflow');
  }
  const {stdout:processes} = await run('ps',['-eo','pid=,args=']);
  if (processes.split('\n').some(line=>/\b(?:tsx|node|npm|bun)\b/.test(line) && /(?:worker\/index\.[tj]s|npm (?:run )?worker)\b/.test(line))) {
    console.log(JSON.stringify({phase:'blocked',reason:'active-local-worker'}));throw new Error('Active local worker');
  }
}
type Row = {key: string; data: Home; [key: string]: unknown};
async function readAll(db: SupabaseClient, owner: string, table: string, order: string) {
  const rows: any[] = []; let after: string | undefined;
  for (;;) {
    let query = db.from(table).select('*').eq('owner_id',owner).order(order).limit(100);
    if (after !== undefined) query = query.gt(order,after);
    const {data,error} = await query;
    if (error || !data) throw new Error('Snapshot read failed');
    rows.push(...data);
    if (data.length < 100) return rows;
    after = data.at(-1)![order];
  }
}
async function snapshot(db: SupabaseClient, owner: string) {
  const [homes,profiles,runs,events,outbox] = await Promise.all([
    readAll(db,owner,'homes','key'),readAll(db,owner,'profiles','owner_id'),
    readAll(db,owner,'source_runs','source'),readAll(db,owner,'events','id'),readAll(db,owner,'outbox','id'),
  ]);
  if (profiles.length !== 1) throw new Error('Owner profile missing');
  return {homes:homes as Row[],profiles,runs,events,outbox};
}
export function coverage(homes: Home[], profile: Profile) {
  const collection = homes.filter(h=>h.decision === 'favourite' || (h.decision === 'new' && evaluate(h.listing,profile).eligible));
  const count = (items: Home[]) => ({total:items.length,located:items.filter(h=>effectiveLocation(h.listing)).length,cbsKnown:items.filter(h=>currentOfficialGeography(h.listing)?.status === 'known').length});
  const failures: Record<string,number> = {}, collectionFailures: Record<string,number> = {}, bySource: Record<string,unknown> = {};
  for (const home of homes) {
    const l = home.listing;
    if (!effectiveLocation(l)) {
      const reason = !currentAddress(l) ? (!l.city ? 'absentCity' : /(?:kamer|studio|appartement|\d\s*[-/–]\s*\d|\([^)]*\))/i.test(l.title) ? 'ambiguousOrSuffix' : 'absentOrUnsupportedAddress') : typeof l.geocoding?.inputKey === 'string' && canonicalAddressKey(l.geocoding.inputKey) === addressKey(currentAddress(l)) ? l.geocoding.status : 'deferred';
      failures[reason] = (failures[reason] ?? 0)+1;
      if (collection.includes(home)) collectionFailures[reason] = (collectionFailures[reason] ?? 0)+1;
    }
  }
  for (const source of new Set(homes.map(h=>h.listing.source))) bySource[source] = count(homes.filter(h=>h.listing.source === source));
  return {all:count(homes),collection:count(collection),favourites:count(homes.filter(h=>h.decision === 'favourite')),newMatches:count(collection.filter(h=>h.decision === 'new')),sourcePoints:homes.filter(h=>effectiveLocation(h.listing)?.provenance === 'source').length,bagPoints:homes.filter(h=>effectiveLocation(h.listing)?.provenance === 'pdok-bag').length,houseNumberPoints:homes.filter(h=>effectiveLocation(h.listing)?.precision === 'house-number').length,failures,collectionFailures,bySource};
}

async function main() {
  if (!process.argv.includes('--write')) throw new Error('Explicit --write required');
  const base = process.env.SUPABASE_URL, secret = process.env.SUPABASE_SERVICE_ROLE_KEY, owner = process.env.OWNER_USER_ID;
  if (!base || !secret || !owner) throw new Error('Admin configuration required');
  await assertIdle();
  const db = createClient(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const before = await snapshot(db,owner), profile = before.profiles[0].config as Profile;
  console.log(JSON.stringify({phase:'before',coverage:coverage(before.homes.map(r=>r.data),profile)}));
  const prior = Number(process.argv.find(v=>v.startsWith('--prior-requests='))?.split('=')[1] ?? 0);
  const fallback = process.argv.includes('--house-number-fallback'), cap = fallback ? 100 : 300;
  if (!Number.isSafeInteger(prior) || prior < 0 || prior > cap) throw new Error('Invalid prior request count');
  const provider = boundedReader({used:prior,cap,cache:fallback});
  let listings = before.homes.map(r=>r.data.listing);
  const targets = fallback ? fallbackTargets(before.homes.map(r=>r.data)) : null;
  const indices = targets ? targets.filter(t=>t.address).map(t=>t.index) : listings.map((_,i)=>i);
  if (targets) {
    for (const t of targets) if (t.address) listings[t.index] = {...listings[t.index],addressEvidence:t.address};
    console.log(JSON.stringify({phase:'targets',unresolved:targets.length,supported:indices.length,cap}));
  }
  const pipeline: Record<string,number> = {};
  // Finite inventory traversal, not a status poll or a second scan. Each batch has
  // at most ten addresses and shares its two-minute deadline across both APIs.
  for (let start=0; start<indices.length && !provider.stopped; start+=10) {
    const batchIndices=indices.slice(start,start+10),batch=batchIndices.map(i=>listings[i]), deadline = Date.now()+120_000;
    const geo = await enrichGeocoding(batch,listings,{read:provider.read,deadline,pause:async()=>{}});
    // A cap-blocked request was not attempted; do not manufacture a service error.
    geo.listings = geo.listings.map((l,i)=>{
      const address = currentAddress(l);
      return address && provider.blocked.has(geocodingUrl(address)) ? {...l,geocoding:batch[i].geocoding ?? null} : l;
    });
    if (geo.stats['invalid-response']) provider.stopParse();
    const cbs = await enrichOfficialGeography(geo.listings,listings,{read:provider.read,deadline,pause:async()=>{},shouldStop:()=>!!provider.stopped,coordinateCache:fallback});
    cbs.listings = cbs.listings.map((l,i)=>{
      const point = effectiveLocation(l);
      return point && provider.blocked.has(geographyUrl(point)) ? {...l,officialGeography:geo.listings[i].officialGeography ?? null} : l;
    });
    if (cbs.stats['invalid-response']) provider.stopParse();
    for (const [name,stats] of [['bag',geo.stats],['cbs',cbs.stats]] as const) for (const [key,value] of Object.entries(stats)) pipeline[`${name}.${key}`] = (pipeline[`${name}.${key}`] ?? 0)+value;
    batchIndices.forEach((index,i)=>{listings[index]=cbs.listings[i];});
  }
  // Parse failures fail closed before any persistence; transport/cap stops retain
  // earlier validated finite work, with honest remaining coverage.
  const next = before.homes.map((row,i)=>indices.includes(i) ? composeHome(row.data,listings[i]) : row.data);
  await assertIdle();
  const writes: Record<string,number> = {};
  const expected = new Map(before.homes.map(row=>[row.key,row.data]));
  for (const i of indices) {
    if (provider.stopped === 'parse') break;
    const row = before.homes[i], result = await writeMetadata(db,base,owner,row.key,row.data,next[i]);
    writes[result] = (writes[result] ?? 0)+1;
    if (result === 'applied' || result === 'confirmedByReadback') expected.set(row.key,next[i]);
    if (result === 'uncertain') break;
  }
  const after = await snapshot(db,owner);
  const invariants = {
    business:isDeepStrictEqual(before.homes.map(r=>({...r,data:businessState(r.data)})),after.homes.map(r=>({...r,data:businessState(r.data)}))),
    profiles:isDeepStrictEqual(before.profiles,after.profiles),runs:isDeepStrictEqual(before.runs,after.runs),
    events:isDeepStrictEqual(before.events,after.events),outbox:isDeepStrictEqual(before.outbox,after.outbox),
    previouslyLocatedUntouched:!fallback || before.homes.filter(r=>effectiveLocation(r.data.listing)).every(row=>isDeepStrictEqual(row,after.homes.find(r=>r.key===row.key))),
  };
  const exactExpectedHomes = after.homes.length === expected.size && after.homes.every(row=>isDeepStrictEqual(row.data,expected.get(row.key)));
  console.log(JSON.stringify({phase:'after',coverage:coverage(after.homes.map(r=>r.data),after.profiles[0].config),requests:provider.used,responseCacheHits:provider.cacheHits,stop:provider.stopped,pipeline,writes,invariants,exactExpectedHomes,concurrentExternalChangesUnknown:!exactExpectedHomes || Object.values(invariants).some(v=>!v)}));
  if (Object.values(invariants).some(v=>!v) || !exactExpectedHomes || writes.uncertain || provider.stopped === 'parse') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(()=>{
  console.error(JSON.stringify({phase:'failed',message:'Maintenance stopped; no raw errors or private data logged. Verify readback before another invocation.'})); process.exitCode=1;
});
