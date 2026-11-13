import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addressKey, canonicalAddressKey, currentAddress, houseNumberAddress, titleAddress } from '../shared/address';
import { effectiveLocation } from '../shared/location';
import { neutralProfile, type AddressEvidence, type Listing } from '../shared/model';
import { cbsAttributionFor, currentOfficialGeography, geographyKey } from '../shared/official-geography';
import { decide, reconcile } from '../shared/state';
import { evaluate } from '../shared/matcher';
import { enrichmentQueue, enrichGeocoding, geocodingUrl, quotedSolrPhrase, parseGeocoding, readPDOKJson } from '../worker/geocoding';
import { enrichOfficialGeography, parseOfficialGeography } from '../worker/official-geography';
import { parseListing } from '../worker/parsers';

const at = '2026-11-13T12:00:00Z', past = '2026-10-01T12:00:00Z';
const address = (): AddressEvidence => ({basis:'source-title',street:'Voorbeeldstraat',houseNumber:12,letter:'',addition:'',city:'Groningen'});
const doc = () => ({id:'address',bron:'BAG',type:'adres',straatnaam:'Voorbeeldstraat',woonplaatsnaam:'Groningen',huisnummer:12,postcode:'9712AB',nummeraanduiding_id:'0014200000000001',adresseerbaarobject_id:'0014010000000001',centroide_ll:'POINT(6.578996 53.22172)',score:99});
const response = (docs: any[] = [doc()]) => ({response:{numFound:docs.length,start:0,numFoundExact:true,docs}});
function listing(key='gruno:fixture'): Listing {
  const html = readFileSync(new URL('./fixtures/gruno.html',import.meta.url),'utf8');
  const value = parseListing('gruno',html,'https://example.invalid/property',at);
  return {...value,key,title:'Voorbeeldstraat 12',city:'Groningen',location:null,addressEvidence:null};
}
const offline = {at,clock:()=>0,pause:async()=>{}};
const matched = (when=at) => parseGeocoding(response(),address(),when);
const polygonResponse = () => ({type:'FeatureCollection',numberReturned:1,features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[6.57,53.21],[6.59,53.21],[6.59,53.23],[6.57,53.23],[6.57,53.21]]]},properties:{bu_code:'BU00140400',bu_naam:'Fixturebuurt',wk_code:'WK001404',wk_naam:'Fixturewijk',gm_code:'GM0014',gm_naam:'Groningen',jaar:2026,water:'NEE'}}]});

const fallback = (title='Voorbeeldstraat 12 (kamer 2)',city:string|null='Groningen') => {
  const value={...listing(),title,city,addressEvidence:null};
  return {...value,addressEvidence:houseNumberAddress(value)};
};
test('JSONB object-key reordering reproduces the old identity bug; old fallback keys and nested evidence hydrate without lookup',async()=>{
  const jsonbRoundtrip = (value:any):any => Array.isArray(value) ? value.map(jsonbRoundtrip) : value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort((a,b)=>a.length-b.length||a.localeCompare(b)).map(k=>[k,jsonbRoundtrip(value[k])])) : value;
  const originalEvidence={...address(),basis:'source-markup' as const,letter:'A',addition:'2',postcode:'9712 AB'};
  const original={...listing(),title:'Voorbeeldstraat 12 A 2',addressEvidence:originalEvidence};
  const a=houseNumberAddress(original)!;
  const oldKey = (v:AddressEvidence) => JSON.stringify(['house-number-v1',normalize(v.street),v.houseNumber,normalize(v.letter),normalize(v.addition),normalize(v.city),v.postcode?.replace(/\s/g,'').toUpperCase()??'',v.exactComponents,v.cityBasis,v.sourceBinding]);
  const old=oldKey(a),roundtrippedEvidence=jsonbRoundtrip(a);
  assert.notEqual(oldKey(roundtrippedEvidence),old,'old raw object serialization breaks after JSONB reordering');
  assert.equal(addressKey(roundtrippedEvidence),addressKey(a));assert.equal(canonicalAddressKey(old),addressKey(a));
  const withAddress={...original,addressEvidence:a};
  const g={...parseGeocoding(response(),a,at),inputKey:old};
  assert.equal(g.precision,'house-number');
  const point={...effectiveLocation({...withAddress,geocoding:g})!,inputKey:old};
  const official=parseOfficialGeography(polygonResponse(),point,at);
  const stored:Listing=jsonbRoundtrip({...withAddress,geocoding:g,officialGeography:official}),before=structuredClone(stored);
  assert.ok(currentAddress(stored));assert.ok(effectiveLocation(stored));assert.equal(currentOfficialGeography(stored)?.status,'known');
  assert.equal(geographyKey(official.input),geographyKey(effectiveLocation(stored)));
  const queued=enrichmentQueue(reconcile([],[stored],neutralProfile).homes,[original],neutralProfile);
  let reads=0;const read=async()=>{reads++;throw Error('persisted validated cache must be reused');};
  const geo=await enrichGeocoding(queued,[stored],{...offline,read});
  const cbs=await enrichOfficialGeography(geo.listings,[stored],{...offline,read});
  assert.equal(reads,0);assert.equal(geo.stats.cacheHits,1);assert.equal(cbs.stats.cacheHits,1);assert.equal(currentOfficialGeography(cbs.listings[0])?.status,'known');assert.deepEqual(stored,before);
  for(const patch of [{source:'maxx' as const},{title:'Voorbeeldstraat 13 A 2'},{city:null},{addressEvidence:{...stored.addressEvidence!,houseNumber:13}},{addressEvidence:{...stored.addressEvidence!,sourceBinding:{...stored.addressEvidence!.sourceBinding!,evidence:{...originalEvidence,postcode:'9712ZZ'}}}}]) assert.equal(effectiveLocation({...stored,...patch}),null);
  const changed=structuredClone(stored);changed.officialGeography!.input={...point,candidateIds:[{bagId:'0014200000000002',objectId:'0014010000000002'}]} as any;
  assert.equal(currentOfficialGeography(changed),null);
  const malformed=JSON.parse(old);malformed.push('unrecognized');assert.equal(canonicalAddressKey(JSON.stringify(malformed)),null);
  assert.equal(canonicalAddressKey(addressKey(address())!),addressKey(address()));
  assert.equal(effectiveLocation({...listing(),geocoding:matched()})?.precision,'address');
});
const normalize=(value:string)=>value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('nl-NL');
const representative = (title='Voorbeeldstraat 12--8a') => {
  const l={...listing(),title,city:null,addressEvidence:null};return {...l,addressEvidence:houseNumberAddress(l,'house-number-v2')};
};
test('v2 cuts unit syntax while preserving numeric street names, original facts and JSONB identity',()=>{
  for(const [title,street,n] of [['Turfsingel 92-B-2','Turfsingel',92],['Nieuweweg 38--8a','Nieuweweg',38],['Hofstraat 13-b s1','Hofstraat',13],['Voorbeeldstraat 12 (19)','Voorbeeldstraat',12],['Voorbeeldstraat 12 s2','Voorbeeldstraat',12],['1e Voorbeeldstraat 12-B-2','1e Voorbeeldstraat',12],['Plein 1945 12--8a','Plein 1945',12]] as const){
    const l=representative(title),a=currentAddress(l)!;assert.equal(a.street,street);assert.equal(a.houseNumber,n);assert.equal(l.title,title);assert.equal(l.city,null);assert.equal(a.cityBasis,'user-scope');
    const reverse=(v:any):any=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).reverse().map(k=>[k,reverse(v[k])])):v;
    assert.equal(addressKey(reverse(a)),addressKey(a));assert.equal(canonicalAddressKey(addressKey(a)!),addressKey(a));assert.ok(currentAddress(reverse(l)));
  }
  assert.equal(representative('Schilderswijk 0').addressEvidence,null);assert.equal(representative('Korrewegwijk').addressEvidence,null);
});
test('v2 prefers registered base then stable BAG-ID order; different points and truncated first pages are representative-only',()=>{
  const a=currentAddress(representative())!,base=doc(),unit={...doc(),huisletter:'A',nummeraanduiding_id:'0014200000000000',adresseerbaarobject_id:'0014010000000002',centroide_ll:'POINT(6.58 53.22)'};
  const g=parseGeocoding(response([unit,base]),a,at);assert.equal(g.resolution,'representative');assert.equal(g.precision,'house-number');assert.equal(g.bagId,null);assert.equal(g.candidateIds?.[0].bagId,base.nummeraanduiding_id);assert.deepEqual(g.point,{lat:53.22172,lon:6.578996});
  const other={...base,huisletter:'B'};const ranked=parseGeocoding(response([other,unit]),a,at);assert.equal(ranked.candidateIds?.[0].bagId,unit.nummeraanduiding_id);assert.deepEqual(parseGeocoding(response([unit,other]),a,at),ranked);
  const partial={response:{numFound:500,start:0,numFoundExact:false,docs:[other,unit]}};
  assert.equal(parseGeocoding(partial,a,at).status,'matched');assert.equal(parseGeocoding(partial,address(),at).status,'incomplete');assert.equal(parseGeocoding(partial,currentAddress(fallback())!,at).status,'incomplete');
  assert.equal(parseGeocoding({response:{...partial.response,start:50}},a,at).status,'incomplete');
  assert.equal(parseGeocoding(response([{...unit,straatnaam:'Other'}]),a,at).status,'no-match');assert.equal(parseGeocoding(response([{...unit,nummeraanduiding_id:'bad'}]),a,at).status,'invalid-response');
  assert.equal(parseGeocoding(response([other,unit]),currentAddress(fallback())!,at).status,'ambiguous');
});
test('v2 bypasses v1 negative caches, shares representative points across unit identities and preserves v1 positives',async()=>{
  const first=representative(),second=representative('Voorbeeldstraat 12-B-2');let calls=0;
  const old={...fallback(),geocoding:parseGeocoding(response([]),currentAddress(fallback())!,at)};
  const result=await enrichGeocoding([first,second],[old],{...offline,read:async()=>{calls++;return response();}});
  assert.equal(calls,1);for(const l of result.listings){assert.equal(l.geocoding?.resolution,'representative');assert.equal(effectiveLocation(l)?.precision,'house-number');}
  assert.notEqual(result.listings[0].geocoding?.inputKey,result.listings[1].geocoding?.inputKey);assert.deepEqual(result.listings[0].geocoding?.point,result.listings[1].geocoding?.point);
  const cached=await enrichGeocoding([{...second,key:'future'}],result.listings,{...offline,read:async()=>{throw Error('persisted group should reuse');}});assert.equal(cached.stats.queries,0);assert.ok(effectiveLocation(cached.listings[0]));
  const v1={...old,geocoding:parseGeocoding(response(),currentAddress(old)!,at)},homes=reconcile([],[v1],neutralProfile).homes;
  assert.equal(enrichmentQueue(homes,[{...v1,addressEvidence:null,geocoding:null}],neutralProfile)[0].addressEvidence?.lookupMode,'house-number-v1');
});
test('approved house-number extraction keeps raw units and user-city context separate from source/matcher facts',()=>{
  for(const suffix of [' (kamer 2)','-A','-6','--8a','-BG','-b s1']) {
    const l=fallback(`Voorbeeldstraat 12${suffix}`,null),a=currentAddress(l)!;
    assert.equal(a.street,'Voorbeeldstraat');assert.equal(a.houseNumber,12);assert.equal(a.city,'Groningen');assert.equal(a.cityBasis,'user-scope');assert.equal(l.city,null);assert.equal(l.title,`Voorbeeldstraat 12${suffix}`);
    assert.notEqual(addressKey(a),addressKey(address()));
  }
  for(const [title,street] of [['1e Voorbeeldstraat 12-BG','1e Voorbeeldstraat'],['Plein 1945 12-BG','Plein 1945']]) {const a=houseNumberAddress({...listing(),title,addressEvidence:null})!;assert.equal(a.street,street);assert.equal(a.houseNumber,12);}
  for(const title of ['Schilderswijk 0','Voorbeeldstraat','Korrewegwijk','Voorbeeldstraat 12/14','Voorbeeldstraat 12 – 14','Kamer in Voorbeeldstraat 12']) assert.equal(houseNumberAddress({...listing(),title,addressEvidence:null}),null,title);
  assert.equal(houseNumberAddress({...listing(),city:'Assen'}),null);
  const changed=houseNumberAddress({...listing(),title:'Voorbeeldstraat 13 (kamer 2)',addressEvidence:address()})!;
  assert.equal(changed.houseNumber,13);assert.deepEqual(changed.sourceBinding?.evidence,address());
  assert.equal(addressKey(address()),JSON.stringify(['voorbeeldstraat',12,'','','groningen','']));
});
test('fallback requests base fields only, accepts coordinate consensus without nominating a unit and prefers safe exact suffix',()=>{
  const l=fallback(),a=currentAddress(l)!,url=new URL(geocodingUrl(a));
  assert.equal(url.searchParams.get('q'),'straatnaam:"Voorbeeldstraat" AND huisnummer:12 AND woonplaatsnaam:"Groningen"');
  const docs=[{...doc(),huisletter:'A'},{...doc(),huisletter:'B',nummeraanduiding_id:'0014200000000002',adresseerbaarobject_id:'0014010000000002'}];
  const result=parseGeocoding(response(docs),a,at);
  assert.equal(result.status,'matched');assert.equal(result.precision,'house-number');assert.equal(result.bagId,null);assert.equal(result.objectId,null);assert.equal(result.candidateIds?.length,2);
  assert.equal(effectiveLocation({...l,geocoding:result})?.precision,'house-number');
  const divergent=[docs[0],{...docs[1],centroide_ll:'POINT(6.58 53.22)'}];
  assert.equal(parseGeocoding(response(divergent),a,at).status,'ambiguous');
  const exact=currentAddress(fallback('Voorbeeldstraat 12-A'))!;
  const preferred=parseGeocoding(response(divergent),exact,at);assert.equal(preferred.bagId,doc().nummeraanduiding_id);assert.equal(preferred.precision,undefined);
  assert.equal(parseGeocoding({response:{...response(docs).response,numFound:51}},a,at).status,'incomplete');
  assert.equal(parseGeocoding(response([{...docs[0],huisnummer:'12'}]),a,at).status,'invalid-response');
  // An unparsed unit label must not silently select the unsuffixed BAG address.
  assert.equal(parseGeocoding(response(),a,at).precision,'house-number');
});
test('fallback binding rejects stale title/city/source/evidence and keeps old negatives in the exact-only mode',async()=>{
  const l=fallback(),a=currentAddress(l)!,g=parseGeocoding(response(),a,at),located={...l,geocoding:g};
  assert.ok(effectiveLocation(located));
  for(const patch of [{title:'Voorbeeldstraat 12 (kamer 3)'},{city:null},{source:'maxx' as const},{addressEvidence:{...a,houseNumber:13}}]) assert.equal(effectiveLocation({...located,...patch}),null);
  const source={lat:53,lon:6,provenance:'source' as const,precision:'unknown' as const};assert.deepEqual(effectiveLocation({...located,location:source}),source);
  const oldNegative=parseGeocoding(response([]),address(),at);let calls=0;
  const result=await enrichGeocoding([{...l,geocoding:oldNegative}],[],{...offline,read:async()=>{calls++;return response();}});
  assert.equal(calls,1);assert.equal(result.listings[0].geocoding?.status,'matched');
  const p={...neutralProfile,includeUnknown:true},original=decide(reconcile([],[l],p).homes[0],'dismissed',at,p);
  const updated=reconcile([original],[located],p);assert.equal(updated.events.length,0);assert.equal(updated.homes[0].decision,'dismissed');assert.equal(updated.homes[0].revision,original.revision);
});
test('coordinate-only CBS work cache rebinds valid results for separate fallback identities and preserves current checks',async()=>{
  const first=fallback(),second=fallback('Voorbeeldstraat 12--8a');
  const list=[first,second].map(l=>({...l,geocoding:parseGeocoding(response(),currentAddress(l)!,at)}));
  let reads=0;const result=await enrichOfficialGeography(list,[],{...offline,coordinateCache:true,read:async()=>{reads++;return polygonResponse();}});
  assert.equal(reads,1);assert.equal(result.stats.duplicatePoints,1);
  assert.notDeepEqual(result.listings[0].officialGeography?.input,result.listings[1].officialGeography?.input);
  for(const l of result.listings) {assert.equal(currentOfficialGeography(l)?.status,'known');assert.match(cbsAttributionFor(l),/huisnummerniveau; toevoeging niet bepaald/);}
  assert.equal(currentOfficialGeography({...result.listings[0],title:'Changed'}),null);
  const cached=await enrichOfficialGeography([list[1]],[result.listings[0]],{...offline,coordinateCache:true,read:async()=>{throw Error('must reuse');}});
  assert.equal(cached.stats.cacheHits,1);assert.equal(currentOfficialGeography(cached.listings[0])?.status,'known');
});
test('normal worker observations reuse same-bound house-number cache, prepare new unit titles, and retain source/legacy exact precedence',async()=>{
  const fresh={...listing(),title:'Voorbeeldstraat 12 (19)',addressEvidence:null};
  const prepared={...fresh,addressEvidence:houseNumberAddress(fresh)};
  const enriched={...prepared,geocoding:parseGeocoding(response(),currentAddress(prepared)!,at)};
  const stored=decide(reconcile([],[enriched],neutralProfile).homes[0],'dismissed',at,neutralProfile),before=structuredClone(stored);
  const queued=enrichmentQueue([stored],[{...fresh,observedAt:'2026-11-13T12:01:00Z'}],neutralProfile);
  assert.equal(addressKey(currentAddress(queued[0])),addressKey(currentAddress(enriched)));
  let reads=0;
  const result=await enrichGeocoding(queued,[stored.listing],{...offline,read:async()=>{reads++;throw Error('same input must reuse cache');}});
  assert.equal(reads,0);assert.equal(result.stats.cacheHits,1);assert.deepEqual(effectiveLocation(result.listings[0]),effectiveLocation(enriched));
  assert.equal(result.listings[0].observedAt,'2026-11-13T12:01:00Z'); // Fresh observation, never stale stored facts.
  const updated=reconcile([stored],result.listings,neutralProfile);
  assert.equal(updated.events.length,0);assert.equal(updated.homes[0].decision,'dismissed');assert.equal(updated.homes[0].revision,stored.revision);assert.deepEqual(stored,before);
  const unknownCity={...fresh,key:'future',title:'Voorbeeldstraat 12-6',city:null};
  const future=enrichmentQueue([],[unknownCity],neutralProfile)[0];
  assert.equal(future.addressEvidence?.lookupMode,'house-number-v2');assert.equal(future.city,null);assert.equal(future.title,unknownCity.title);
  const changed=enrichmentQueue([stored],[{...fresh,title:'Voorbeeldstraat 13 (19)'}],neutralProfile)[0];
  assert.notEqual(addressKey(currentAddress(changed)),addressKey(currentAddress(enriched)));assert.equal(effectiveLocation(changed),null);
  const changedEvidence=enrichmentQueue([stored],[{...fresh,addressEvidence:{...address(),houseNumber:14,basis:'source-markup'}}],neutralProfile)[0];assert.notEqual(addressKey(currentAddress(changedEvidence)),addressKey(currentAddress(enriched)));
  const exact={...listing('exact'),geocoding:matched()},source={...fresh,key:'source',location:{lat:53,lon:6,provenance:'source' as const,precision:'unknown' as const}};
  const retained=enrichmentQueue(reconcile([],[exact],neutralProfile).homes,[exact,source],neutralProfile);
  assert.equal(retained.find(l=>l.key==='exact')?.addressEvidence?.lookupMode,undefined);assert.deepEqual(effectiveLocation(retained.find(l=>l.key==='exact')!),effectiveLocation(exact));
  assert.equal(retained.find(l=>l.key==='source')?.addressEvidence,null);assert.deepEqual(effectiveLocation(retained.find(l=>l.key==='source')!),source.location);
  assert.deepEqual(Object.fromEntries(Object.entries(result.listings[0]).filter(([key])=>!['addressEvidence','geocoding','officialGeography','observedAt'].includes(key))),Object.fromEntries(Object.entries(fresh).filter(([key])=>!['addressEvidence','geocoding','officialGeography','observedAt'].includes(key))));
});

test('whole title parsing preserves exact suffixes and requires a confirmed city, never ranges or marketing', () => {
  assert.deepEqual(titleAddress('Voorbeeldstraat 12','Groningen'),address());
  assert.equal(titleAddress('Voorbeeldstraat 12-A','Groningen')?.letter,'A');
  assert.equal(titleAddress('Voorbeeldstraat 12 A 2','Groningen')?.addition,'2');
  assert.ok(titleAddress('Voorbeeldstraat 12, Groningen','Groningen'));
  for (const title of ['Voorbeeldstraat','Voorbeeldstraat 12-14','Voorbeeldstraat 12/14','Voorbeeldstraat 12–14','Voorbeeldstraat 12 14','Voorbeeldstraat 12-1','Kamer Voorbeeldstraat 12','Voorbeeldstraat 12 (kamer)','Voorbeeldstraat 12, Assen']) assert.equal(titleAddress(title,'Groningen'),null,title);
  assert.equal(titleAddress('Voorbeeldstraat 12',null),null);
  assert.equal(addressKey({...address(),houseNumber:0}),null);
  assert.equal(addressKey({...address(),postcode:'garbage'}),null);
  assert.equal(addressKey({...address(),street:' VOORBEELDSTRAAT ',city:' groningen '}),addressKey(address()));
});
test('active source parser attaches only additive title evidence and preserves missing address facts', () => {
  const html=readFileSync(new URL('./fixtures/solide.html',import.meta.url),'utf8');
  const parsed=parseListing('solide',html,'https://example.invalid/property',at);
  assert.equal(parsed.addressEvidence?.street,'Hardewikerstraat');assert.equal(parsed.addressEvidence?.houseNumber,29);assert.equal(parsed.addressEvidence?.basis,'source-markup');assert.equal(parsed.addressEvidence?.postcode,'9712GR');
  const range=parseListing('solide',html.replace('Hardewikerstraat 29','Hardewikerstraat 29-31'),'https://example.invalid/property',at);
  assert.equal(range.addressEvidence,null);assert.equal(range.city,parsed.city);assert.equal(range.neighbourhood,parsed.neighbourhood);
});
test('PDOK URL pins documented filter, fields, complete-set limit, and no profile data', () => {
  const url=new URL(geocodingUrl(address()));
  assert.equal(url.origin,'https://api.pdok.nl');assert.equal(url.pathname,'/bzk/locatieserver/search/v3_1/free');
  assert.equal(url.searchParams.get('fq'),'type:adres AND bron:BAG');assert.equal(url.searchParams.get('rows'),'50');assert.equal(url.searchParams.get('start'),'0');assert.equal(url.searchParams.get('q'),'straatnaam:"Voorbeeldstraat" AND huisnummer:12 AND woonplaatsnaam:"Groningen"');
  assert.deepEqual([...url.searchParams.keys()].sort(),['fl','fq','q','rows','start']);assert.match(url.searchParams.get('fl')!,/nummeraanduiding_id,adresseerbaarobject_id,centroide_ll,score/);
  assert.throws(()=>geocodingUrl({...address(),city:''}));
});
test('fielded AND query preserves multiword phrases, suffix and postcode; Lucene quotes/backslashes are escaped',()=>{
  const value={...address(),street:'Burgemeester Voorbeeldstraat',city:'Den Haag',letter:'A',addition:'2',postcode:'9712 ab'};
  const q=new URL(geocodingUrl(value)).searchParams.get('q');
  assert.equal(q,'straatnaam:"Burgemeester Voorbeeldstraat" AND huisnummer:12 AND woonplaatsnaam:"Den Haag" AND huisletter:"A" AND huisnummertoevoeging:"2" AND postcode:"9712AB"');
  assert.equal(quotedSolrPhrase('a"b\\c'),'"a\\"b\\\\c"');
  assert.throws(()=>geocodingUrl({...address(),street:'a" OR *:*'}));
  assert.throws(()=>geocodingUrl({...address(),city:'a\\b'}));
});
test('exact component matching ignores score and requires unsuffixed candidate for unsuffixed input', () => {
  const suffix={...doc(),huisletter:'A',score:1000};
  assert.equal(parseGeocoding(response([suffix]),address(),at).status,'no-match');
  assert.equal(parseGeocoding(response([suffix,doc()]),address(),at).status,'matched');
  assert.equal(parseGeocoding(response([suffix]),{...address(),letter:'a'},at).status,'matched');
  assert.equal(parseGeocoding(response([{...suffix,huisnummertoevoeging:'2'}]),{...address(),letter:'A',addition:'2'},at).status,'matched');
  for (const patch of [{street:'Other'},{city:'Assen'},{houseNumber:13},{postcode:'9712ZZ'},{addition:'2'}]) assert.equal(parseGeocoding(response(),{...address(),...patch},at).status,'no-match');
  assert.equal(parseGeocoding(response(),{...address(),postcode:'9712 ab'},at).status,'matched');
  const result=matched();assert.deepEqual(result.point,{lon:6.578996,lat:53.22172});assert.equal(result.bagId,doc().nummeraanduiding_id);assert.equal(result.inputKey,addressKey(address()));assert.equal('docs' in result,false);
});
test('synthetic PDOK omitted-postcode candidate is valid; a supplied input postcode still requires exact evidence',()=>{
  // Synthetic regression for the observed PDOK field omission, not a saved advertisement.
  const {postcode:omitted,...withoutPostcode}=doc();
  assert.equal(parseGeocoding(response([withoutPostcode]),address(),at).status,'matched');
  assert.equal(parseGeocoding(response([withoutPostcode]),{...address(),postcode:omitted},at).status,'no-match');
  assert.equal(parseGeocoding(response(),{...address(),postcode:'9712ZZ'},at).status,'no-match');
  const other={...withoutPostcode,huisletter:'A',nummeraanduiding_id:'0014200000000002'};
  assert.equal(parseGeocoding(response([other,doc()]),{...address(),postcode:omitted},at).status,'matched');
  for(const postcode of [null,12345,'','invalid','0000AA']) assert.equal(parseGeocoding(response([{...doc(),postcode}]),address(),at).status,'invalid-response');
});
test('house-number consensus accepts omitted postcodes but still rejects distinct candidate points',()=>{
  const a=currentAddress(fallback())!;
  const {postcode:omitted,...withoutPostcode}=doc();
  const other={...doc(),huisletter:'A',nummeraanduiding_id:'0014200000000002',adresseerbaarobject_id:'0014010000000002'};
  const consensus=parseGeocoding(response([withoutPostcode,other]),a,at);
  assert.equal(consensus.status,'matched');assert.equal(consensus.precision,'house-number');assert.equal(consensus.candidateIds?.length,2);assert.equal(consensus.bagId,null);
  assert.equal(parseGeocoding(response([withoutPostcode,{...other,centroide_ll:'POINT(6.58 53.22)'}]),a,at).status,'ambiguous');
  assert.equal(Object.hasOwn(withoutPostcode,'postcode'),false);assert.equal(a.postcode,undefined);
});
test('complete exact envelope and one identical BAG identity required, never first-ranked partial match', () => {
  for (const patch of [{numFoundExact:false},{start:1},{numFound:51},{numFound:2}]) assert.equal(parseGeocoding({response:{...response().response,...patch}},address(),at).status,'incomplete');
  assert.equal(parseGeocoding(response([doc(),doc()]),address(),at).status,'matched');
  assert.equal(parseGeocoding(response([doc(),{...doc(),nummeraanduiding_id:'0014200000000002'}]),address(),at).status,'ambiguous');
  assert.equal(parseGeocoding(response([doc(),{...doc(),centroide_ll:'POINT(6.58 53.22)'}]),address(),at).status,'ambiguous');
  assert.equal(parseGeocoding(response([]),address(),at).status,'no-match');
  for (const body of [null,{}, {response:{...response().response,numFound:'1'}},{response:{...response().response,numFoundExact:undefined}}]) assert.equal(parseGeocoding(body,address(),at).status,'invalid-response');
});
test('malformed candidate components, BAG IDs and nonfinite or reversed-invalid WKT are rejected', () => {
  for (const patch of [{bron:'other'},{type:'woonplaats'},{straatnaam:null},{huisnummer:'12'},{huisletter:null},{huisnummertoevoeging:1},{postcode:'bad'},{nummeraanduiding_id:142},{adresseerbaarobject_id:'bad'},{centroide_ll:'POINT(6 Infinity)'},{centroide_ll:'POINT(53 190)'},{centroide_ll:'POINT(6 91)'},{centroide_ll:'POINT(6 53 0)'}]) assert.equal(parseGeocoding(response([{...doc(),...patch}]),address(),at).status,'invalid-response',JSON.stringify(patch));
});
test('source-first effective point rejects stale current title/city/suffix/postcode and invalid cached identities', () => {
  const value={...listing(),geocoding:matched()};assert.equal(effectiveLocation(value)?.provenance,'pdok-bag');
  const source={lat:53,lon:6,provenance:'source' as const,precision:'unknown' as const};
  assert.deepEqual(effectiveLocation({...value,location:source}),source);
  assert.equal(effectiveLocation({...value,location:{...source,lat:NaN}})?.provenance,'pdok-bag');
  for (const patch of [{title:'Voorbeeldstraat 13'},{title:'Voorbeeldstraat 12 A'},{city:'Assen'},{city:null},{addressEvidence:{...address(),basis:'source-markup' as const,postcode:'9712AB'}}]) assert.equal(effectiveLocation({...value,addressEvidence:address(),...patch}),null);
  assert.equal(currentAddress({...value,addressEvidence:address(),title:'Voorbeeldstraat 13'})?.houseNumber,13);
  for (const patch of [{provider:'other'},{status:'error'},{bagId:'bad'},{objectId:null},{point:{lat:Infinity,lon:6}}]) assert.equal(effectiveLocation({...value,geocoding:{...matched(),...patch} as any}),null);
});
test('persisted cache reuse and same-input dedup make one serial lookup per address', async () => {
  let reads=0;const pauses:number[]=[];
  const result=await enrichGeocoding([listing('a'),listing('b'),{...listing('c'),title:'Andereweg 20'}],[],{...offline,read:async()=>{reads++;return response();},pause:async ms=>{pauses.push(ms);}});
  assert.equal(reads,2);assert.deepEqual(pauses,[2000]);assert.equal(result.stats.duplicates,1);assert.equal(result.stats.matched,2);
  const cached=await enrichGeocoding([listing('new')],result.listings,{...offline,read:async()=>{throw Error('must not read');}});
  assert.equal(cached.stats.queries,0);assert.equal(cached.stats.cacheHits,1);assert.equal(cached.listings[0].geocoding?.status,'matched');
});
test('positive 30-day, negative 7-day, error 1-day TTLs; expired positives retain honest attempt errors', async () => {
  const stored={...listing(),geocoding:matched(past)};
  const failed=await enrichGeocoding([listing()],[stored],{...offline,read:async()=>{throw Error('private transport detail');}});
  const value=failed.listings[0].geocoding!;assert.equal(value.status,'matched');assert.equal(value.retrievedAt,past);assert.equal(value.lastAttemptAt,at);assert.equal(value.lastAttemptStatus,'error');assert.equal('error' in value,false);
  const malformed=await enrichGeocoding([listing()],[stored],{...offline,read:async()=>({})});assert.equal(malformed.listings[0].geocoding?.status,'matched');assert.equal(malformed.listings[0].geocoding?.lastAttemptStatus,'error');
  const backoff=await enrichGeocoding(failed.listings,[],{...offline,at:'2026-11-14T00:00:00Z',read:async()=>{throw Error('no');}});assert.equal(backoff.stats.queries,0);
  const cases = [{result:matched(),before:'2026-12-12T12:00:00Z',expiry:'2026-12-13T12:00:00Z'},{result:parseGeocoding(response([]),address(),at),before:'2026-11-19T12:00:00Z',expiry:'2026-11-20T12:00:00Z'},{result:parseGeocoding({},address(),at),before:'2026-11-14T00:00:00Z',expiry:'2026-11-14T12:00:00Z'}];
  for (const item of cases) {
    const cached=[{...listing(),geocoding:item.result}];
    assert.equal((await enrichGeocoding([listing()],cached,{...offline,at:item.before,read:async()=>response()})).stats.queries,0);
    assert.equal((await enrichGeocoding([listing()],cached,{...offline,at:item.expiry,read:async()=>response()})).stats.queries,1);
  }
});
test('transport circuit and ten-query cap leave unattempted inputs pending, without cooldown', async () => {
  const many=Array.from({length:12},(_,i)=>({...listing(String(i)),title:`Voorbeeldstraat ${i+1}`}));
  const capped=await enrichGeocoding(many,[],{...offline,read:async()=>response([])});
  assert.equal(capped.stats.queries,10);assert.equal(capped.stats.deferred,2);assert.equal(capped.listings[10].geocoding,null);
  for (const error of ['429','503','timeout']) {
    const stopped=await enrichGeocoding(many,[],{...offline,read:async()=>{throw Error(error);}});
    assert.equal(stopped.stats.queries,1);assert.equal(stopped.stats.deferred,11);assert.equal(stopped.listings[0].geocoding?.status,'error');assert.equal(stopped.listings[1].geocoding,null);
  }
  const deferred=await enrichGeocoding(many,[],{...offline,deadline:16_000,read:async()=>{throw Error('no time');}});assert.equal(deferred.stats.queries,0);assert.equal(deferred.stats.deferred,12);
  let clock=0;
  const timed=await enrichGeocoding(many,[],{...offline,clock:()=>clock,deadline:20_000,read:async()=>{clock=10_000;return response([]);}});assert.equal(timed.stats.queries,1);assert.equal(timed.listings[1].geocoding,null);
});
test('changed input invalidates old result even when circuit/deadline defers; source points never geocode', async () => {
  const stored={...listing(),geocoding:matched()};
  const changed={...stored,title:'Voorbeeldstraat 13'};
  const result=await enrichGeocoding([changed],[stored],{...offline,deadline:0,read:async()=>{throw Error('no');}});assert.equal(result.listings[0].geocoding,null);
  const failure=await enrichGeocoding([changed],[stored],{...offline,read:async()=>{throw Error('no');}});assert.equal(failure.listings[0].geocoding?.status,'error');assert.equal(failure.listings[0].geocoding?.point,null);
  const source=await enrichGeocoding([{...listing(),location:{lat:53,lon:6,provenance:'source',precision:'unknown'}},{...listing('incomplete'),title:'Voorbeeldstraat'}],[],{...offline,read:async()=>{throw Error('no');}});assert.equal(source.stats.queries,0);assert.equal(source.stats.sourcePoints,1);assert.equal(source.stats.missingAddress,1);
});
test('CBS uses effective points and identity-bound cache, preserving old source keys and truthful provenance', async () => {
  const value={...listing(),geocoding:matched()}, point=effectiveLocation(value)!;
  const known=parseOfficialGeography(polygonResponse(),point,at), withCBS={...value,officialGeography:known};
  assert.equal(currentOfficialGeography(withCBS)?.status,'known');assert.match(cbsAttributionFor(withCBS),/PDOK\/BAG-adreslocatie/);
  const cached=await enrichOfficialGeography([value],[withCBS],{...offline,read:async()=>{throw Error('cached');}});assert.equal(cached.stats.queries,0);
  assert.equal(currentOfficialGeography({...withCBS,title:'Voorbeeldstraat 13'}),null);
  const otherBag={...withCBS,geocoding:{...matched(),bagId:'0014200000000002'}};assert.equal(currentOfficialGeography(otherBag),null);
  const source={lat:point.lat,lon:point.lon,provenance:'source' as const,precision:'unknown' as const};
  assert.equal(geographyKey(source),`2026:0:${point.lon},${point.lat}`);assert.notEqual(geographyKey(source),geographyKey(point));
  assert.equal(currentOfficialGeography({...withCBS,location:source}),null);
  const legacy={...listing(),location:source,officialGeography:parseOfficialGeography(polygonResponse(),source,at)};assert.equal(currentOfficialGeography(legacy)?.status,'known');assert.match(cbsAttributionFor(legacy),/broncoördinaten/);
  const stopped=await enrichOfficialGeography([value],[],{...offline,shouldStop:()=>true,read:async()=>{throw Error('no');}});assert.equal(stopped.stats.queries,0);assert.equal(stopped.listings[0].officialGeography,null);
});
test('merge prioritizes eligible New and favourites, preserves unobserved facts and all geo-only state semantics', async () => {
  const original=listing(), old=reconcile([],[original],neutralProfile).homes[0];
  const favourite=decide({...old,listing:listing('favourite')},'favourite',at,neutralProfile);
  const dismissed=decide({...old,listing:listing('dismissed')},'dismissed',at,neutralProfile);
  const observed={...original,observedAt:'new observation',description:'New source description'};
  const queue=enrichmentQueue([dismissed,old,favourite],[observed],neutralProfile);
  assert.deepEqual(queue.map(l=>l.key),[old.listing.key,'favourite','dismissed']);assert.equal(queue[0],observed);assert.equal(queue[2].observedAt,at);
  const geocoded=(await enrichGeocoding(queue,[],{...offline,read:async()=>response()})).listings;
  for (const decision of ['new','dismissed','favourite'] as const) {
    const before=decide(old,decision,at,neutralProfile), enriched={...original,addressEvidence:address(),geocoding:matched()};
    const result=reconcile([before],[enriched],neutralProfile);
    assert.equal(result.events.length,0);assert.equal(result.homes[0].revision,before.revision);assert.equal(result.homes[0].decision,decision);assert.deepEqual(evaluate(enriched,neutralProfile),evaluate(original,neutralProfile));assert.deepEqual(result.homes[0].dismissal,before.dismissal);
  }
  const final=reconcile([dismissed,old,favourite],geocoded,neutralProfile);assert.equal(final.events.length,0);assert.equal(final.homes.find(h=>h.listing.key==='dismissed')?.listing.observedAt,at);assert.equal(final.homes.find(h=>h.listing.key==='dismissed')?.listing.neighbourhood,original.neighbourhood);
});
test('fixed-origin reader rejects arbitrary endpoints without HTTP', async () => {
  for (const url of ['https://example.invalid/','http://api.pdok.nl/bzk/locatieserver/search/v3_1/free','https://api.pdok.nl/other','https://user:password@api.pdok.nl/bzk/locatieserver/search/v3_1/free']) await assert.rejects(readPDOKJson(url),/Invalid PDOK endpoint/);
});
test('PDOK reader uses no redirects and a timeout, enforces streamed byte cap and JSON without network', async () => {
  const url=geocodingUrl(address());let cancelled=false;
  const fetchMock=mock.method(globalThis,'fetch',async (_url: unknown, options: RequestInit)=>{
    assert.equal(options.redirect,'error');assert.ok(options.signal);
    return new Response(JSON.stringify(response()),{headers:{'content-type':'application/json'}});
  });
  try {
    assert.deepEqual(await readPDOKJson(url),response());
    fetchMock.mock.mockImplementation(async()=>new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1_000_001));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}}));
    await assert.rejects(readPDOKJson(url),/too large/);assert.equal(cancelled,true);
    fetchMock.mock.mockImplementation(async()=>new Response('{}',{status:429,headers:{'content-type':'application/json'}}));await assert.rejects(readPDOKJson(url),/unavailable/);
    fetchMock.mock.mockImplementation(async()=>new Response('<html>',{headers:{'content-type':'text/html'}}));await assert.rejects(readPDOKJson(url),/unavailable/);
  } finally { fetchMock.mock.restore(); }
});
