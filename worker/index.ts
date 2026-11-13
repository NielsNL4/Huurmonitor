import { createClient } from '@supabase/supabase-js';
import { reconcile } from '../shared/state';
import type { Home, Profile } from '../shared/model';
import { allowedSources, ingest } from './sources';
import { deliverNextDigest } from './delivery';
import { enrichOfficialGeography } from './official-geography';
import { enrichGeocoding, enrichmentQueue, readPDOKJson } from './geocoding';

async function main() {
  if (process.env.ENABLE_MONITORING !== 'true') { console.log('Monitoring disabled. No sources, database or email contacted.'); return; }
  const sources = allowedSources(process.env.SOURCE_ALLOWLIST);
  if (!sources.length) { console.log('SOURCE_ALLOWLIST empty. No external effects. Review source access first.'); return; }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_USER_ID } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OWNER_USER_ID) throw new Error('Explicit Supabase admin configuration and OWNER_USER_ID required');
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from('profiles').select('config,version').eq('owner_id', OWNER_USER_ID).single();
  if (profileError) throw profileError;
  const { data: rows, error: readError } = await db.from('homes').select('data').eq('owner_id', OWNER_USER_ID);
  if (readError) throw readError;
  const full = process.env.SCAN_MODE === 'full';
  if (process.env.SCAN_MODE && !['full','bounded'].includes(process.env.SCAN_MODE)) throw new Error('SCAN_MODE must be full or bounded');
  const { listings, runs } = await ingest(sources, new Date().toISOString(), { full });
  const stored = rows.map(r => r.data as Home), storedListings = stored.map(home=>home.listing);
  const deadline = Date.now()+120_000;
  // One serial PDOK lane across both enrichers; no extra source reads. Preserve
  // a two-second gap even at the address/CBS boundary, sharing the pass deadline.
  let lastRead = 0, pdokStopped = false;
  const read = async (url: string) => {
    const wait = 2000-(Date.now()-lastRead);
    if (wait > 0) await new Promise(resolve=>setTimeout(resolve,wait));
    if (Date.now()+15_000 > deadline) throw new Error('PDOK pass deadline');
    try { return await readPDOKJson(url); } catch { pdokStopped = true; throw new Error('PDOK unavailable'); } finally { lastRead = Date.now(); }
  };
  const geocoding = await enrichGeocoding(enrichmentQueue(stored,listings,profile.config as Profile),storedListings,{deadline,read});
  const geography = await enrichOfficialGeography(geocoding.listings,storedListings,{deadline,read,shouldStop:()=>pdokStopped});
  const { homes, events } = reconcile(stored, geography.listings, profile.config as Profile);
  const { error: persistError } = await db.rpc('apply_batch', { p_owner: OWNER_USER_ID, p_expected: profile.version, p_homes: homes, p_events: events, p_runs: runs });
  if (persistError) throw new Error('Database apply_batch failed; import not confirmed; existing data must be retained.'); // Never print database response/profile contents.
  const oldKeys=new Set(rows.map(r=>(r.data as Home).listing.key));
  const changes=sources.map(source=>{
    const observed=new Set(listings.filter(l=>l.source===source).map(l=>l.key));
    return { source, inserted:[...observed].filter(key=>!oldKeys.has(key)).length, updated:[...observed].filter(key=>oldKeys.has(key)).length, preserved:rows.filter(r=>(r.data as Home).listing.source===source && !observed.has((r.data as Home).listing.key)).length };
  });
  console.log(JSON.stringify({ mode: full ? 'full' : 'bounded', sources: runs, changes, geocoding: geocoding.stats, geography: geography.stats, homes: homes.length, events: events.length, email: process.env.ENABLE_EMAIL === 'true' ? 'enabled' : 'disabled', committed: true }));
  if (process.env.ENABLE_EMAIL !== 'true' || !profile.config.emailEnabled) return;
  await deliverNextDigest(db, OWNER_USER_ID, process.env);
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Worker failed; details suppressed. No successful import claimed.'); process.exitCode = 1; });
