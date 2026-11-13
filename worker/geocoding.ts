import type { AddressEvidence, GeocodingResult, Home, Listing, Profile } from '../shared/model';
import { addressKey, canonicalAddressKey, currentAddress, houseNumberAddress, normalizeAddressText, validBagNumberId, validBagObjectId } from '../shared/address';
import { effectiveLocation, validCandidateIds, validCoordinates } from '../shared/location';
import { evaluate } from '../shared/matcher';

const endpoint = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
const day = 86_400_000;
const fields = 'id,bron,type,weergavenaam,straatnaam,woonplaatsnaam,huisnummer,huisletter,huisnummertoevoeging,postcode,nummeraanduiding_id,adresseerbaarobject_id,centroide_ll,score';
export const quotedSolrPhrase = (value: string) => `"${value.replace(/["\\]/g,'\\$&')}"`;
export function geocodingUrl(address: AddressEvidence) {
  if (!addressKey(address)) throw new Error('Complete address evidence required');
  const url = new URL(endpoint);
  // PDOK documents OR as the default operator. Fielded AND clauses bound the
  // candidate set; independent exact component/complete-set checks below remain.
  // https://github.com/PDOK/locatieserver/wiki/API-Locatieserver#22-gebruik-van-de-solr-q-parameter
  const representative = address.lookupMode === 'house-number-v2';
  const clauses = [`straatnaam:${quotedSolrPhrase(representative ? normalizeAddressText(address.street) : address.street)}`,`huisnummer:${address.houseNumber}`,`woonplaatsnaam:${quotedSolrPhrase(representative ? normalizeAddressText(address.city) : address.city)}`];
  if (!address.lookupMode) {
    if (address.letter) clauses.push(`huisletter:${quotedSolrPhrase(address.letter)}`);
    if (address.addition) clauses.push(`huisnummertoevoeging:${quotedSolrPhrase(address.addition)}`);
    if (address.postcode) clauses.push(`postcode:${quotedSolrPhrase(address.postcode.replace(/\s/g,'').toUpperCase())}`);
  }
  url.search = new URLSearchParams({q:clauses.join(' AND '),fq:'type:adres AND bron:BAG',rows:'50',start:'0',fl:fields}).toString();
  return url.href;
}
function empty(address: AddressEvidence, at: string, status: GeocodingResult['status']): GeocodingResult {
  return {provider:'pdok-bag',inputKey:addressKey(address)!,status,bagId:null,objectId:null,point:null,retrievedAt:at,lastAttemptAt:at,lastAttemptStatus:['error','invalid-response'].includes(status) ? 'error' : 'ok'};
}
export function parseGeocoding(body: unknown, address: AddressEvidence, at: string): GeocodingResult {
  const invalid = empty(address,at,'invalid-response'), data = (body as any)?.response;
  if (!addressKey(address) || !data || !Number.isSafeInteger(data.numFound) || data.numFound < 0 || !Number.isSafeInteger(data.start) || typeof data.numFoundExact !== 'boolean' || !Array.isArray(data.docs)) return invalid;
  const representative = address.lookupMode === 'house-number-v2';
  if (data.start !== 0 || data.docs.length > 50 || data.docs.length > data.numFound || (!representative && (!data.numFoundExact || data.numFound > 50 || data.docs.length !== data.numFound)) || (representative && data.numFound > 0 && data.docs.length === 0)) return empty(address,at,'incomplete');
  const matches: GeocodingResult[] = [];
  const baseMatches: GeocodingResult[] = [];
  const registeredBaseIds = new Set<string>();
  for (const doc of data.docs) {
    if (!doc || doc.bron !== 'BAG' || doc.type !== 'adres' || typeof doc.straatnaam !== 'string' || typeof doc.woonplaatsnaam !== 'string' || !Number.isSafeInteger(doc.huisnummer) || doc.huisnummer < 1 || !validBagNumberId(doc.nummeraanduiding_id) || !validBagObjectId(doc.adresseerbaarobject_id) || (doc.postcode !== undefined && (typeof doc.postcode !== 'string' || !/^[1-9]\d{3}\s?[A-Za-z]{2}$/.test(doc.postcode))) || (doc.huisletter !== undefined && (typeof doc.huisletter !== 'string' || !/^[A-Za-z]?$/.test(doc.huisletter))) || (doc.huisnummertoevoeging !== undefined && (typeof doc.huisnummertoevoeging !== 'string' || !/^[\p{L}\d]{0,10}$/u.test(doc.huisnummertoevoeging)))) return invalid;
    const wkt = typeof doc.centroide_ll === 'string' && doc.centroide_ll.match(/^POINT\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)$/);
    if (!wkt || !validCoordinates(Number(wkt[2]),Number(wkt[1]))) return invalid;
    const same = (a: string,b: string) => normalizeAddressText(a) === normalizeAddressText(b);
    if (!doc.huisletter && !doc.huisnummertoevoeging) registeredBaseIds.add(doc.nummeraanduiding_id);
    if (same(doc.straatnaam,address.street) && same(doc.woonplaatsnaam,address.city) && doc.huisnummer === address.houseNumber) baseMatches.push({...empty(address,at,'matched'),bagId:doc.nummeraanduiding_id,objectId:doc.adresseerbaarobject_id,point:{lon:Number(wkt[1]),lat:Number(wkt[2])}});
    if (!same(doc.straatnaam,address.street) || !same(doc.woonplaatsnaam,address.city) || doc.huisnummer !== address.houseNumber || !same(doc.huisletter ?? '',address.letter) || !same(doc.huisnummertoevoeging ?? '',address.addition) || (address.postcode && (doc.postcode === undefined || doc.postcode.replace(/\s/g,'').toUpperCase() !== address.postcode.replace(/\s/g,'').toUpperCase()))) continue;
    matches.push({...empty(address,at,'matched'),bagId:doc.nummeraanduiding_id,objectId:doc.adresseerbaarobject_id,point:{lon:Number(wkt[1]),lat:Number(wkt[2])}});
  }
  const identities = new Map(matches.map(value=>[JSON.stringify([value.bagId,value.objectId,value.point]),value]));
  if (representative) {
    if (!baseMatches.length) return empty(address,at,'no-match');
    // Stable representative among returned exact base-address candidates, not a
    // score-ranked unit, average, entrance or assertion of a shared building.
    baseMatches.sort((a,b)=>Number(registeredBaseIds.has(b.bagId!))-Number(registeredBaseIds.has(a.bagId!)) || a.bagId!.localeCompare(b.bagId!) || a.objectId!.localeCompare(b.objectId!));
    const selected=baseMatches[0];
    if (baseMatches.some(v=>v.bagId===selected.bagId && v.objectId===selected.objectId && JSON.stringify(v.point)!==JSON.stringify(selected.point))) return empty(address,at,'ambiguous');
    return {...empty(address,at,'matched'),precision:'house-number',resolution:'representative',candidateIds:[{bagId:selected.bagId!,objectId:selected.objectId!}],point:selected.point};
  }
  if (address.lookupMode && (!address.exactComponents || identities.size !== 1)) {
    if (!baseMatches.length) return empty(address,at,'no-match');
    if (new Set(baseMatches.map(value=>JSON.stringify(value.point))).size !== 1) return empty(address,at,'ambiguous');
    const candidateIds = [...new Map(baseMatches.map(v=>[`${v.bagId}:${v.objectId}`,{bagId:v.bagId!,objectId:v.objectId!}])).values()].sort((a,b)=>a.bagId.localeCompare(b.bagId)||a.objectId.localeCompare(b.objectId));
    return {...empty(address,at,'matched'),precision:'house-number',candidateIds,point:baseMatches[0].point};
  }
  return identities.size === 1 ? [...identities.values()][0] : empty(address,at,identities.size ? 'ambiguous' : 'no-match');
}

/** Fixed PDOK origin/routes only, no redirects, streamed size cap and total timeout.
 * Separate from source readers: source robots policy is not a geocoder contract. */
export async function readPDOKJson(url: string): Promise<unknown> {
  const target = new URL(url);
  if (target.origin !== 'https://api.pdok.nl' || ![new URL(endpoint).pathname,'/cbs/wijken-en-buurten-2026/ogc/v1/collections/buurten/items'].includes(target.pathname) || target.username || target.password || target.hash) throw new Error('Invalid PDOK endpoint');
  const response = await fetch(url,{headers:{Accept:'application/geo+json, application/json','User-Agent':'Huurmonitor-personal/0.1'},redirect:'error',signal:AbortSignal.timeout(15_000)});
  if (!response.ok || !/\b(?:geo\+)?json\b/i.test(response.headers.get('content-type') ?? '') || !response.body) { await response.body?.cancel(); throw new Error('PDOK response unavailable'); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new Error('PDOK response too large');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function usable(value: GeocodingResult | null | undefined, key: string, now: number): value is GeocodingResult {
  if (!value || value.provider !== 'pdok-bag' || typeof value.inputKey !== 'string' || canonicalAddressKey(value.inputKey) !== key || !['matched','no-match','ambiguous','incomplete','invalid-response','error'].includes(value.status) || !['ok','error'].includes(value.lastAttemptStatus)) return false;
  const retrieved = Date.parse(value.retrievedAt), attempted = Date.parse(value.lastAttemptAt);
  if (!Number.isFinite(retrieved) || !Number.isFinite(attempted) || retrieved > now || attempted > now || attempted < retrieved) return false;
  return value.status === 'matched' ? (!key.startsWith('["house-number-v2",') || (value.resolution === 'representative' && value.precision === 'house-number' && value.candidateIds?.length === 1)) && (value.precision === 'house-number' ? value.bagId === null && value.objectId === null && validCandidateIds(value.candidateIds) : validBagNumberId(value.bagId) && validBagObjectId(value.objectId)) && !!value.point && validCoordinates(value.point.lat,value.point.lon) : value.point === null && value.bagId === null && value.objectId === null;
}
function fresh(value: GeocodingResult, now: number) {
  return value.lastAttemptStatus === 'error' ? now-Date.parse(value.lastAttemptAt) < day : now-Date.parse(value.retrievedAt) < (value.status === 'matched' ? 30 : 7)*day;
}
interface Options { at?: string; read?: (url: string)=>Promise<unknown>; clock?: ()=>number; pause?: (ms: number)=>Promise<void>; deadline?: number }
export async function enrichGeocoding(listings: Listing[], stored: Listing[], options: Options = {}) {
  const at = options.at ?? new Date().toISOString(), now = Date.parse(at), clock = options.clock ?? Date.now;
  const deadline = options.deadline ?? clock()+120_000, read = options.read ?? readPDOKJson;
  const pause = options.pause ?? (ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const cache = new Map<string,GeocodingResult>(), resolved = new Map<string,GeocodingResult>();
  const representativeCache = new Map<string,GeocodingResult>();
  const stats = {queries:0,cacheHits:0,duplicates:0,missingAddress:0,sourcePoints:0,deferred:0,refreshFailures:0,matched:0,'no-match':0,ambiguous:0,incomplete:0,'invalid-response':0,error:0};
  for (const listing of [...stored,...listings]) {
    const key = addressKey(currentAddress(listing)), value = listing.geocoding;
    if (!key || !usable(value,key,now)) continue;
    const old = cache.get(key);
    if (!old || (value.status === 'matched' && old.status !== 'matched') || ((value.status === 'matched') === (old.status === 'matched') && Date.parse(value.lastAttemptAt)>Date.parse(old.lastAttemptAt))) cache.set(key,value);
    if (currentAddress(listing)?.lookupMode === 'house-number-v2' && fresh(value,now)) representativeCache.set(geocodingUrl(currentAddress(listing)!),value);
  }
  let stopped = false;
  const enriched: Listing[] = [];
  for (const listing of listings) {
    const address = currentAddress(listing), key = addressKey(address);
    const base = {...listing,addressEvidence:address};
    if (!address || !key) { stats.missingAddress++; enriched.push({...base,geocoding:null}); continue; }
    const cached = cache.get(key);
    if (effectiveLocation({...listing,geocoding:null})?.provenance === 'source') { stats.sourcePoints++; enriched.push({...base,geocoding:cached ?? null}); continue; }
    let value = resolved.get(key);
    if (value) stats.duplicates++;
    else if (cached && fresh(cached,now)) { stats.cacheHits++; value = cached; }
    else if (address.lookupMode === 'house-number-v2' && representativeCache.has(geocodingUrl(address))) { stats.cacheHits++; value={...representativeCache.get(geocodingUrl(address))!,inputKey:key}; }
    else {
      if (stopped || stats.queries >= 10 || clock()+17_000 > deadline) { stats.deferred++; enriched.push({...base,geocoding:cached ?? null}); continue; }
      try {
        if (stats.queries) await pause(2000);
        if (clock()+15_000 > deadline) { stats.deferred++; enriched.push({...base,geocoding:cached ?? null}); continue; }
        stats.queries++;
        value = parseGeocoding(await read(geocodingUrl(address)),address,at);
      } catch { stopped = true; value = empty(address,at,'error'); }
      if (value.lastAttemptStatus === 'error') {
        stats.refreshFailures++;
        if (cached?.status === 'matched') value = {...cached,lastAttemptAt:at,lastAttemptStatus:'error'};
      }
    }
    resolved.set(key,value);
    if (address.lookupMode === 'house-number-v2') representativeCache.set(geocodingUrl(address),value);
    stats[value.status]++;
    enriched.push({...base,geocoding:structuredClone(value)});
  }
  return {listings:enriched,stats};
}

/** Incoming observations win; cached enrichment must not fabricate observations. */
export function enrichmentQueue(stored: Home[], incoming: Listing[], profile: Profile): Listing[] {
  const homes = new Map(stored.map(home=>[home.listing.key,home]));
  const merged = new Map(stored.map(home=>[home.listing.key,home.listing]));
  for (const listing of incoming) merged.set(listing.key,listing);
  // Worker-only preparation: browsers merely consume persisted metadata. Never
  // spread old observations over fresh facts or downgrade source/legacy points.
  const prepared = [...merged.values()].map(listing=>{
    if (effectiveLocation({...listing,geocoding:null})?.provenance === 'source') return listing;
    const previous = homes.get(listing.key)?.listing;
    if (previous?.addressEvidence?.lookupMode && effectiveLocation(previous)) {
      const fallback = houseNumberAddress(listing,previous.addressEvidence.lookupMode);
      if (fallback && addressKey(fallback) === addressKey(currentAddress(previous))) return {...listing,addressEvidence:fallback};
    }
    if (effectiveLocation(listing)) return listing;
    // Keep an existing exact input/cache unless a known negative or unsupported
    // input needs the explicitly approved representative mode.
    const exact = currentAddress(listing);
    if (exact && !exact.lookupMode && !previous?.addressEvidence?.lookupMode && previous?.geocoding?.status !== 'no-match') return listing;
    const fallback = houseNumberAddress(listing,'house-number-v2');
    return fallback ? {...listing,addressEvidence:fallback} : listing;
  });
  const priority = (listing: Listing) => homes.get(listing.key)?.decision === 'favourite' || ((homes.get(listing.key)?.decision ?? 'new') === 'new' && evaluate(listing,profile).eligible) ? 0 : 1;
  return prepared.sort((a,b)=>priority(a)-priority(b));
}
