import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Listing, SourceLocation } from '../shared/model';
import { neutralProfile } from '../shared/model';
import { currentOfficialGeography } from '../shared/official-geography';
import { evaluate } from '../shared/matcher';
import { decide, reconcile } from '../shared/state';
import { parseListing } from '../worker/parsers';
import { enrichOfficialGeography, geographyUrl, parseOfficialGeography } from '../worker/official-geography';

const point: SourceLocation = {lat:53.22172,lon:6.578996,provenance:'source',precision:'unknown'};
const at='2026-11-12T12:00:00Z';
const polygon = {type:'Polygon',coordinates:[[[6.57,53.21],[6.59,53.21],[6.59,53.23],[6.57,53.23],[6.57,53.21]]]};
function response() {
  // Synthetic geometry for deterministic containment tests; names/codes match the
  // independently verified public Petrus lookup, not an imported API observation.
  return {type:'FeatureCollection',numberReturned:1,features:[{type:'Feature',geometry:structuredClone(polygon),properties:{bu_code:'BU00140400',bu_naam:'Gorechtbuurt',wk_code:'WK001404',wk_naam:'Oud-Oost',gm_code:'GM0014',gm_naam:'Groningen',jaar:2026,water:'NEE'}}]};
}
function listing(key='gruno:01853'): Listing {
  const html=readFileSync(new URL('./fixtures/gruno.html',import.meta.url),'utf8');
  return {...parseListing('gruno',html,'https://example.invalid/property',at),key,location:{...point}};
}
const known=()=>parseOfficialGeography(response(),point,at);
const offline={at,pause:async()=>{}};

test('PDOK request pins 2026 buurt collection and sends only longitude/latitude, with limit 2', () => {
  const url=new URL(geographyUrl(point));
  assert.equal(url.origin,'https://api.pdok.nl');assert.equal(url.pathname,'/cbs/wijken-en-buurten-2026/ogc/v1/collections/buurten/items');
  assert.deepEqual([...url.searchParams.keys()].sort(),['f','filter','filter-lang','limit']);
  assert.equal(url.searchParams.get('filter'),'S_INTERSECTS(geometry,POINT(6.578996 53.22172))');assert.equal(url.searchParams.get('limit'),'2');assert.equal(url.searchParams.get('filter-lang'),'cql2-text');
  assert.throws(()=>geographyUrl({...point,lon:Infinity}));
});
test('One validated containing nonwater feature supplies distinct buurt/wijk and municipality', () => {
  const value=known();assert.equal(value.status,'known');assert.equal(value.year,2026);assert.equal(value.version,'0');assert.equal(value.buurt?.name,'Gorechtbuurt');assert.equal(value.wijk?.name,'Oud-Oost');assert.equal(value.municipality?.code,'GM0014');assert.deepEqual(value.input,point);assert.equal(value.retrievedAt,at);
  const other=response();Object.assign(other.features[0].properties,{bu_code:'BU03630000',wk_code:'WK036300',gm_code:'GM0363',gm_naam:'Amsterdam'});assert.equal(parseOfficialGeography(other,point,at).status,'known'); // Validate hierarchy, never force Groningen.
  const multi:any=response();multi.features[0].geometry={type:'MultiPolygon',coordinates:[polygon.coordinates]};assert.equal(parseOfficialGeography(multi,point,at).status,'known');
  // Observed PDOK wire schema: exact string year and finite 3D positions (altitude ignored).
  const wire:any=response();wire.features[0].properties.jaar='2026';wire.features[0].geometry.coordinates=polygon.coordinates.map(ring=>ring.map(position=>[...position,0]));assert.equal(parseOfficialGeography(wire,point,at).status,'known');
});
test('Zero, multiple, boundary and water matches remain unknown with honest statuses', () => {
  const zero:any=response();zero.features=[];zero.numberReturned=0;assert.equal(parseOfficialGeography(zero,point,at).status,'no-match');
  const multiple=response();multiple.features.push(structuredClone(multiple.features[0]));multiple.numberReturned=2;assert.equal(parseOfficialGeography(multiple,point,at).status,'ambiguous');
  const next:any=response();next.links=[{rel:'next',href:'https://example.invalid'}];assert.equal(parseOfficialGeography(next,point,at).status,'ambiguous');
  assert.equal(parseOfficialGeography(response(),{...point,lon:6.57},at).status,'ambiguous');
  const water=response();water.features[0].properties.water='JA';const result=parseOfficialGeography(water,point,at);assert.equal(result.status,'water');assert.equal(result.buurt,null);assert.equal(result.wijk,null);
});
test('Malformed, wrong-year, inconsistent municipality, foreign geometry/CRS and holes are rejected', () => {
  const cases:any[]=[null,{}, {...response(),numberReturned:'1'}, {...response(),links:{}}, {...response(),links:[null]}, {...response(),crs:{type:'name',properties:{name:'EPSG:28992'}}}];
  for(const patch of [{jaar:2025},{jaar:'2025'},{jaar:'2026x'},{wk_code:'WK001405'},{gm_code:'GM0363'},{bu_code:123},{bu_naam:''},{gm_naam:null},{water:'unknown'}]){const value=response();Object.assign(value.features[0].properties,patch);cases.push(value);}
  const foreign:any=response();foreign.features[0].geometry.coordinates=[[[1,1],[2,1],[2,2],[1,2],[1,1]]];cases.push(foreign);
  const bad:any=response();bad.features[0].geometry.coordinates[0][0]=['6.57',53.21];cases.push(bad);
  const badAltitude:any=response();badAltitude.features[0].geometry.coordinates[0][0]=[6.57,53.21,'0'];cases.push(badAltitude);
  const hole:any=response();hole.features[0].geometry.coordinates.push([[6.575,53.215],[6.585,53.215],[6.585,53.225],[6.575,53.225],[6.575,53.215]]);cases.push(hole);
  for(const value of cases)assert.equal(parseOfficialGeography(value,point,at).status,'invalid-response');
});
test('Persistent same-point/year cache reused across listings; unique new points queried serially once', async () => {
  const stored={...listing('old'),officialGeography:known()};let reads=0;
  const cached=await enrichOfficialGeography([listing('new-a'),listing('new-b')],[stored],{...offline,read:async()=>{reads++;return response();}});
  assert.equal(reads,0);assert.equal(cached.stats.cacheHits,1);assert.equal(cached.stats.duplicatePoints,1);assert.equal(cached.stats.known,2);
  const pauses:number[]=[],newPoint={...listing('new-c'),location:{...point,lon:6.58}};
  const fresh=await enrichOfficialGeography([listing('a'),listing('b'),newPoint],[],{at,read:async()=>{reads++;return response();},pause:async ms=>{pauses.push(ms);}});
  assert.equal(reads,2);assert.equal(fresh.stats.queries,2);assert.equal(fresh.stats.duplicatePoints,1);assert.deepEqual(pauses,[2000]);
});
test('Coordinate or dataset changes invalidate cache and displayed names; absent source points never query', async () => {
  const previous={...listing(),officialGeography:known()};const changed={...previous,location:{...point,lon:6.58}};let reads=0;
  assert.equal(currentOfficialGeography(changed),null);
  const wrongYear={...previous,officialGeography:{...known(),year:2025 as any}};assert.equal(currentOfficialGeography(wrongYear),null);
  const wrongVersion={...previous,officialGeography:{...known(),version:'1' as any}};assert.equal(currentOfficialGeography(wrongVersion),null);
  const result=await enrichOfficialGeography([changed,wrongYear],[previous],{...offline,read:async()=>{reads++;return response();}});assert.equal(reads,1);assert.equal(result.listings[0].officialGeography?.input.lon,6.58);
  const noPoint={...previous,location:null};const absent=await enrichOfficialGeography([noPoint],[],{...offline,read:async()=>{throw Error('must not read');}});assert.equal(absent.stats.queries,0);assert.equal(absent.listings[0].officialGeography,null);assert.equal(currentOfficialGeography(noPoint),null);
});
test('Failure retains expired valid same-point cache, backs off for a day and stops the pass', async () => {
  const past='2026-10-01T12:00:00Z',stored={...listing(),officialGeography:parseOfficialGeography(response(),point,past)};let reads=0;
  const other={...listing('other'),location:{...point,lon:6.58}};
  const failed=await enrichOfficialGeography([listing(),other],[stored],{...offline,read:async()=>{reads++;throw Error('timeout');}});
  assert.equal(reads,1);assert.equal(failed.stats.deferred,1);assert.equal(failed.listings[0].officialGeography?.status,'known');assert.equal(failed.listings[0].officialGeography?.retrievedAt,past);assert.equal(failed.listings[0].officialGeography?.lastAttemptStatus,'error');assert.equal(failed.listings[1].officialGeography,null);
  const retry=await enrichOfficialGeography([failed.listings[0]],[],{...offline,at:'2026-11-12T18:00:00Z',read:async()=>{throw Error('must back off');}});assert.equal(retry.stats.queries,0);assert.equal(retry.stats.cacheHits,1);
  const malformed=await enrichOfficialGeography([listing()],[stored],{...offline,read:async()=>({})});assert.equal(malformed.listings[0].officialGeography?.status,'known');assert.equal(malformed.listings[0].officialGeography?.lastAttemptStatus,'error');
});
test('Negative cache has seven-day TTL; errors one day; changed-point failures never inherit old names', async () => {
  const noMatch=parseOfficialGeography({type:'FeatureCollection',features:[],numberReturned:0},point,at),negative={...listing(),officialGeography:noMatch};
  const cached=await enrichOfficialGeography([listing()],[negative],{...offline,at:'2026-11-18T12:00:00Z',read:async()=>{throw Error('not expected');}});assert.equal(cached.stats.queries,0);
  const expired=await enrichOfficialGeography([listing()],[negative],{...offline,at:'2026-11-19T12:00:00Z',read:async()=>response()});assert.equal(expired.stats.queries,1);assert.equal(expired.stats.known,1);
  const changed={...listing(),location:{...point,lon:6.58}};
  const failure=await enrichOfficialGeography([changed],[{...listing(),officialGeography:known()}],{...offline,read:async()=>{throw Error('offline');}});assert.equal(failure.listings[0].officialGeography?.status,'error');assert.equal(failure.listings[0].officialGeography?.buurt,null);
});
test('Only geography changes: source neighbourhood, financial/availability facts, evaluation and decisions stay semantic', async () => {
  const original=listing(),before=structuredClone(original),enriched=(await enrichOfficialGeography([original],[],{...offline,read:async()=>response()})).listings[0];
  const {officialGeography,...rest}=enriched;assert.deepEqual(rest,before);assert.deepEqual(original,before);assert.deepEqual(evaluate(enriched,neutralProfile),evaluate(original,neutralProfile));
  for(const decision of ['dismissed','favourite'] as const){const old=decide(reconcile([],[original],neutralProfile).homes[0],decision,at,neutralProfile);const result=reconcile([old],[enriched],neutralProfile);assert.equal(result.events.length,0);assert.equal(result.homes[0].decision,decision);assert.equal(result.homes[0].revision,old.revision);assert.equal(result.homes[0].listing.neighbourhood,before.neighbourhood);}
});
