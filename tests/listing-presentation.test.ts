import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listingPresentation } from '../shared/listing-presentation';
import { priceDisplay } from '../shared/price-display';
import { addressKey, currentAddress, sourceAddress } from '../shared/address';
import { effectiveLocation } from '../shared/location';
import type { Listing, Source } from '../shared/model';
import { parseListing } from '../worker/parsers';
import { digestHtml, digestText } from '../worker/email-renderer';

function listing(source: Source = 'gruno') {
  const html = readFileSync(new URL(`./fixtures/${source}.html`,import.meta.url),'utf8');
  return parseListing(source,html,source==='maxx'?'https://example.invalid/id-123/':'https://example.invalid','2026-11-13T12:00:00Z');
}
function located(): Listing {
  const l=listing(), point={lat:53.22,lon:6.57,provenance:'source' as const,precision:'unknown' as const};
  return {...l,location:point,officialGeography:{provider:'pdok-cbs',year:2026,version:'0',input:point,status:'known',retrievedAt:'2026-11-13T12:00:00Z',lastAttemptAt:'2026-11-13T12:00:00Z',lastAttemptStatus:'ok',buurt:{code:'BU00140400',name:'Fixturebuurt'},wijk:{code:'WK001404',name:'Fixturewijk'},municipality:{code:'GM0014',name:'Groningen'}}};
}
test('one canonical Listing supplies validated district, separate buurt/source wording and identical price semantics',()=>{
  for(const source of ['gruno','solide','maxx'] as const){
    const l={...located(),source,neighbourhood:'Informele omgeving'},before=structuredClone(l),p=listingPresentation(l);
    assert.equal(p.district,'Fixturewijk');assert.equal(p.buurt,'Fixturebuurt');
    assert.equal(p.headerLocation,'Fixturewijk (CBS 2026)');
    assert.deepEqual(p.locationFacts,[{label:'Wijk (CBS 2026)',value:'Fixturewijk'},{label:'Buurt (CBS 2026)',value:'Fixturebuurt'},{label:'Omgeving volgens advertentie',value:'Informele omgeving'}]);
    assert.match(p.attribution!,/2026.*broncoördinaten/);assert.deepEqual(p.price,priceDisplay(l));
    const events=[{id:'fixture',key:l.key,revision:1,reason:'Fixture',listing:l}];
    for(const body of [digestText(events),digestHtml(events)]){
      assert.match(body,/Fixturewijk/);assert.match(body,/Fixturebuurt/);assert.match(body,/Informele omgeving/);
      assert.ok(body.includes(p.price.label));assert.ok(body.includes(p.price.caveat));assert.doesNotMatch(body,/Wijk volgens advertentie/);
    }
    assert.deepEqual(l,before);
    for(const rent of [{...l.rent,knownMonthly:null},{...l.rent,knownMonthly:null,headlineConflict:true}]) assert.deepEqual(listingPresentation({...l,rent}).price,priceDisplay({...l,rent}));
  }
});
test('stale, absent and malformed geography give one unresolved detail fact, never an unknown header or source-as-CBS',()=>{
  const l=located();
  for(const value of [{...l,officialGeography:null},{...l,location:null},{...l,location:{...l.location!,lat:53.23}},{...l,officialGeography:{...l.officialGeography!,year:2025} as any}]){
    const p=listingPresentation({...value,neighbourhood:null});
    assert.equal(p.district,null);assert.equal(p.buurt,null);assert.equal(p.headerLocation,null);assert.equal(p.attribution,null);
    assert.deepEqual(p.locationFacts,[{label:'Wijk',value:'Wijk nog niet bepaald'}]);
  }
  const raw=listingPresentation({...l,officialGeography:null,neighbourhood:' Advertentiewoorden '});
  assert.equal(raw.district,null);assert.equal(raw.advertLocation,'Advertentiewoorden');assert.match(raw.headerLocation!,/^Omgeving volgens advertentie:/);
  assert.equal(listingPresentation({...l,neighbourhood:'   '}).locationFacts.length,2);
});
test('BAG and source provenance stay distinct; retained same-input failed recheck is disclosed',()=>{
  const l=located(),key=addressKey(currentAddress(l))!;
  const derived:Listing={...l,location:null,geocoding:{provider:'pdok-bag',status:'matched',inputKey:key,bagId:'0014200000000001',objectId:'0014010000000001',point:{lat:53.22,lon:6.57},retrievedAt:'2026-11-13T12:00:00Z',lastAttemptAt:'2026-11-13T12:00:00Z',lastAttemptStatus:'ok'}};
  derived.officialGeography={...l.officialGeography!,input:effectiveLocation(derived)!,lastAttemptStatus:'error'};
  const p=listingPresentation(derived);assert.match(p.attribution!,/PDOK\/BAG-adreslocatie/);assert.match(p.refreshNote!,/hercontrole mislukt/);
  assert.equal(listingPresentation({...derived,addressEvidence:{...derived.addressEvidence!,houseNumber:999}}).district,null);
});
test('explicit whole address preserves letter, addition and postcode without cleaning ambiguous source wording',()=>{
  const a=sourceAddress('Voorbeeldstraat 12 A 2, 9712 AB Groningen','Groningen');
  assert.deepEqual(a,{basis:'source-markup',street:'Voorbeeldstraat',houseNumber:12,letter:'A',addition:'2',city:'Groningen',postcode:'9712 AB'});
  assert.equal(sourceAddress('Voorbeeldstraat 12, 9712AB Groningen',null)?.city,'Groningen');
  assert.equal(sourceAddress('Voorbeeldstraat 12','Groningen')?.houseNumber,12);
  for(const raw of ['Voorbeeldstraat 12 (kamer 2), 9712AB Groningen','Voorbeeldstraat 12-14, 9712AB Groningen','Voorbeeldstraat 12 2, 9712AB Groningen','Voorbeeldstraat 12, 9712AB Assen','Voorbeeldstraat 12, ongeldige postcode Groningen']) assert.equal(sourceAddress(raw,'Groningen'),null,raw);
  assert.equal(sourceAddress('Voorbeeldstraat 12',null),null);
});
