import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeHome, assertMetadataOnly, businessState, boundedReader, writeMetadata, casUrl, coverage, fallbackTargets } from '../worker/backfill-locations';
import { enrichGeocoding } from '../worker/geocoding';
import { neutralProfile, type Home } from '../shared/model';
import { currentAddress } from '../shared/address';

function home(): Home {
  return {
    listing:{key:'fixture',source:'gruno',title:'Voorbeeldstraat 12',city:'Groningen',location:null,observedAt:'2026-11-13',unknownFact:{keep:true}},
    decision:'dismissed',revision:9,evaluation:{eligible:false,verdict:'fail',criteria:[]},reason:'original',
    dismissal:{listing:{title:'old',unknownFact:1},evaluation:null,profile:{privateFact:true},at:'before'},
    decisionContext:{listing:{unknownFact:2},profile:{privateFact:true}},unknownHome:{keep:true},
  } as unknown as Home;
}
function mockDb(response: any, readback?: Home) {
  const calls: any[] = [];
  const query: any = {
    update(value: any){calls.push(['update',value]);return query;},
    eq(key: string,value: unknown){calls.push(['eq',key,value]);return query;},
    select(value: string){calls.push(['select',value]);return query;},
    single:async()=>({data:{data:readback},error:null}),
    then(resolve: any,reject: any){return Promise.resolve(response).then(resolve,reject);},
  };
  return {db:{from(table: string){calls.push(['from',table]);return query;}} as any,calls};
}
test('composition preserves unknown properties, decisions, dismissal/profile snapshots and observation metadata',()=>{
  const old = home(), next = composeHome(old,{...old.listing,addressEvidence:currentAddress(old.listing),geocoding:null,officialGeography:null,observedAt:'WRONG'});
  assert.deepEqual(businessState(next),businessState(old));
  assert.equal(next.listing.observedAt,old.listing.observedAt);
  assert.deepEqual(next.dismissal,old.dismissal); assert.deepEqual(next.decisionContext,old.decisionContext);
  assert.equal(old.listing.addressEvidence,undefined);
});
test('allowlist rejects edits outside exactly three top-level listing metadata fields',()=>{
  for (const mutate of [
    (h:any)=>h.decision='new',(h:any)=>h.listing.location={lat:53,lon:6},
    (h:any)=>h.revision++,(h:any)=>h.unknownHome.keep=false,
    (h:any)=>h.dismissal.listing.geocoding=null,(h:any)=>h.decisionContext.profile.privateFact=false,
  ]) {const old=home(), next=structuredClone(old);mutate(next);assert.throws(()=>assertMetadataOnly(old,next));}
});
test('full-row CAS conflict skips without fallback or altering unknown business fields',async()=>{
  const old=home(), next=composeHome(old,{...old.listing,geocoding:null});
  const {db,calls}=mockDb({data:[],error:null});
  assert.equal(await writeMetadata(db,'https://example.invalid','owner','fixture',old,next),'conflict');
  assert.deepEqual(calls.filter(c=>c[0]==='eq'),[['eq','owner_id','owner'],['eq','key','fixture'],['eq','data',JSON.stringify(old)]]);
  assert.equal(calls.filter(c=>c[0]==='update').length,1);
  assert.deepEqual(calls.find(c=>c[0]==='update')[1],{data:next});
});
test('oversized CAS URL and HTTP URI limit skip with no weaker predicate, RPC or retry',async()=>{
  const old=home();old.listing.description='é'.repeat(20_000);
  const next=composeHome(old,{...old.listing,geocoding:null}), first=mockDb({data:[],error:null});
  assert.ok(casUrl('https://example.invalid','owner','fixture',old).length>28_000);
  assert.equal(await writeMetadata(first.db,'https://example.invalid','owner','fixture',old,next),'oversize');
  assert.equal(first.calls.length,0);
  const small=home(), second=mockDb({error:{message:'URI too long'},status:414});
  assert.equal(await writeMetadata(second.db,'https://example.invalid','owner','fixture',small,composeHome(small,{...small.listing,geocoding:null})),'oversize');
  assert.equal(second.calls.filter(c=>c[0]==='update').length,1);
});
test('uncertain HTTP result reads back before any retry and confirms exact data only',async()=>{
  const old=home(), next=composeHome(old,{...old.listing,geocoding:null});
  for (const [readback,expected] of [[next,'confirmedByReadback'],[old,'writeError'],[{...next,revision:99},'uncertain']] as const) {
    const {db,calls}=mockDb({error:{message:'transport error'},status:0},readback);
    assert.equal(await writeMetadata(db,'https://example.invalid','owner','fixture',old,next),expected);
    assert.equal(calls.filter(c=>c[0]==='update').length,1);
  }
  const unchanged=mockDb(null);assert.equal(await writeMetadata(unchanged.db,'https://example.invalid','owner','fixture',old,old),'unchanged');assert.equal(unchanged.calls.length,0);
});
test('shared reader enforces >=2s across providers/batches and global request cap',async()=>{
  let now=0; const times:number[]=[], waits:number[]=[];
  const reader=boundedReader({cap:3,clock:()=>now,pause:async ms=>{waits.push(ms);now+=ms;},read:async()=>{times.push(now);now+=250;return {};}});
  await reader.read('bag'); await reader.read('cbs');await reader.read('next-batch');
  await assert.rejects(reader.read('blocked'));
  assert.deepEqual(times,[2000,4000,6000]);assert.deepEqual(waits,[2000,1750,1750]);
  assert.equal(reader.used,3);assert.equal(reader.stopped,'cap');assert.equal(reader.blocked.has('blocked'),true);
});
test('transport and parse stops prevent all later provider requests, without retry',async()=>{
  let calls=0;
  const reader=boundedReader({pause:async()=>{},read:async()=>{calls++;throw Error('429 / timeout / 5xx');}});
  await assert.rejects(reader.read('first'));await assert.rejects(reader.read('second'));
  assert.equal(calls,1);assert.equal(reader.stopped,'service');
  const parsed=boundedReader({pause:async()=>{},read:async()=>{calls++;return {};}});parsed.stopParse();await assert.rejects(parsed.read('never'));assert.equal(calls,1);
});
test('remaining ambiguous suffixes/ranges and unconfirmed cities stay unresolved',()=>{
  for (const title of ['Voorbeeldstraat 12 (kamer)','Voorbeeldstraat 12-14','Kamer Voorbeeldstraat 12','Voorbeeldstraat 12/14']) {
    const h=home();h.listing.title=title;assert.equal(currentAddress(h.listing),null);
    assert.equal(coverage([h],neutralProfile).all.located,0);
  }
  const h=home();h.listing.city=null;assert.equal(currentAddress(h.listing),null);
  assert.equal(coverage([h],neutralProfile).failures.absentCity,1);
});
test('fallback targeting leaves all 113 previously located complete homes untouched and rejects wider inventory',()=>{
  const located=Array.from({length:113},()=>{const h=home();h.listing.location={lat:53,lon:6,provenance:'source',precision:'unknown'};return h;});
  const unresolved=Array.from({length:29},()=>{const h=home();h.listing.title='Voorbeeldstraat 12 (kamer 2)';return h;});
  const homes=[...located,...unresolved],before=structuredClone(homes),targets=fallbackTargets(homes);
  assert.equal(targets.length,29);assert.ok(targets.every(t=>t.index>=113 && t.address?.lookupMode==='house-number-v2'));
  assert.deepEqual(homes,before);assert.throws(()=>fallbackTargets([...homes,home()]),/bound/);
  for(const target of targets) assert.deepEqual(businessState(composeHome(homes[target.index],{...homes[target.index].listing,addressEvidence:target.address})),businessState(homes[target.index]));
});
test('shared response cache deduplicates different unit inputs without copying their source-bound result keys; cap includes prior requests',async()=>{
  const homes=['Voorbeeldstraat 12 (kamer 1)','Voorbeeldstraat 12--8a'].map(title=>{const h=home();h.listing.title=title;return h;});
  const targets=fallbackTargets(homes),list=targets.map(t=>({...homes[t.index].listing,addressEvidence:t.address}));
  let reads=0;
  const reader=boundedReader({cap:100,used:99,cache:true,pause:async()=>{},read:async()=>{reads++;return {response:{numFound:0,start:0,numFoundExact:true,docs:[]}};}});
  const enriched=await enrichGeocoding(list,[],{read:reader.read,pause:async()=>{}});
  assert.equal(reads,1);assert.equal(reader.used,100);assert.equal(reader.cacheHits+enriched.stats.cacheHits,1);
  assert.notEqual(enriched.listings[0].geocoding?.inputKey,enriched.listings[1].geocoding?.inputKey);
  await assert.rejects(reader.read('uncached'));assert.equal(reader.stopped,'cap');assert.equal(reads,1);
});
