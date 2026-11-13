import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neutralProfile, type Home, type Listing } from '../shared/model';
import { reconcile } from '../shared/state';
import { currentAddress, houseNumberAddress } from '../shared/address';
import { parseGeocoding } from '../worker/geocoding';
import { listingPresentation } from '../shared/listing-presentation';
import { cartoStyleUrl, closeMapDetail, mapCollection, mapFeatures, mapStatus, newMapSession, openMapDetail, samePointGroups } from '../src/map-model';

const listing: Listing = {key:'gruno:map-fixture',externalId:'map-fixture',source:'gruno',url:'https://example.invalid',title:'Synthetic fixture 1',city:'Groningen',type:'kamer',area:20,bedrooms:1,available:true,moveIn:null,description:'Synthetic unit fixture',photos:[],incomeMin:null,observedAt:'2026-11-13T00:00:00Z',rent:{base:70000,headline:80000,serviceAggregate:10000,service:null,energy:null,knownMonthly:80000,comparison:'base+aggregate',utilities:'Onbekend',complete:false,note:''}};
const home = (key:string,decision:Home['decision']='new',patch:Partial<Listing>={}):Home => ({...reconcile([],[{...listing,...patch,key}],neutralProfile).homes[0],decision});
const point={lat:53.22,lon:6.57,provenance:'source' as const,precision:'unknown' as const};

test('map includes currently eligible New and every favourite, never dismissed or stale eligible flags',()=>{
  const homes=[home('match'),home('fav','favourite',{available:false}),home('dismissed','dismissed'),home('unknown','new',{available:null}),home('expensive','new')];
  const selected=mapCollection(homes,{...neutralProfile,maxBudget:75000});
  assert.deepEqual(selected.map(h=>h.listing.key),['fav']);
  assert.deepEqual(mapCollection(homes,neutralProfile).map(h=>h.listing.key),['match','fav','expensive']);
  assert.equal(selected[0].evaluation.eligible,false);
});
test('favourites have explicit changed availability and profile status, distinct from matches',()=>{
  const favourite=mapCollection([home('fav','favourite',{available:false})],neutralProfile)[0];
  assert.equal(mapStatus(favourite,false),'Favoriet · Niet beschikbaar · Past nu niet bij profiel');
  const unknown=mapCollection([home('fav','favourite',{available:null})],neutralProfile)[0];assert.match(mapStatus(unknown,false),/Beschikbaarheid onbekend/);
  assert.match(mapStatus(home('match'),true),/^Nieuwe match · Beschikbaar in voorbeeld/);
});
test('only validated points enter GeoJSON; missing homes stay selectable, no centre guesses or private feature facts',()=>{
  const homes=mapCollection([home('known','new',{location:point}),home('missing'),home('invalid','favourite',{location:{...point,lat:NaN}})],neutralProfile);
  const data=mapFeatures(homes);
  assert.equal(homes.length,3);assert.equal(data.features.length,1);assert.deepEqual(data.features[0].geometry.coordinates,[6.57,53.22]);
  assert.deepEqual(data.features[0].properties,{key:'known',favourite:false});assert.doesNotMatch(JSON.stringify(data),/Synthetic fixture|budget|income|description/);
});
test('identical coordinate homes retain separate linked keys for clustering, with no jitter or lost favourites',()=>{
  const homes=[home('one','new',{location:point}),home('two','favourite',{location:point}),home('three','new',{location:{...point,lon:6.58}})];
  assert.deepEqual(samePointGroups(homes),[['one','two'],['three']]);
  const data=mapFeatures(homes);assert.equal(data.features.length,3);assert.deepEqual(data.features[0].geometry,data.features[1].geometry);assert.equal(data.features[1].properties?.favourite,true);
});
test('house-number consensus groups unit advertisements without merging keys, titles, favourites or exact input identities',()=>{
  const homes=['Synthetic fixture 12 (kamer 1)','Synthetic fixture 12--8a'].map((title,i)=>{
    const h=home(`unit-${i}`,i?'favourite':'new',{title,city:null});
    h.listing.addressEvidence=houseNumberAddress(h.listing);
    h.listing.geocoding=parseGeocoding({response:{numFound:1,start:0,numFoundExact:true,docs:[{bron:'BAG',type:'adres',straatnaam:'Synthetic fixture',woonplaatsnaam:'Groningen',huisnummer:12,postcode:'9712AB',nummeraanduiding_id:'0014200000000001',adresseerbaarobject_id:'0014010000000001',centroide_ll:'POINT(6.57 53.22)'}]}},currentAddress(h.listing)!,'2026-11-13T12:00:00Z');
    return h;
  });
  assert.deepEqual(samePointGroups(homes),[['unit-0','unit-1']]);assert.equal(mapFeatures(homes).features.length,2);
  assert.notEqual(homes[0].listing.geocoding?.inputKey,homes[1].listing.geocoding?.inputKey);
  assert.equal(homes[1].decision,'favourite');assert.equal(homes[1].listing.title,'Synthetic fixture 12--8a');assert.equal(homes[0].listing.city,null);
  assert.equal(listingPresentation(homes[0].listing).locationCaveat,'Locatie op huisnummerniveau; toevoeging niet bepaald');
});
test('safe public key configuration uses the managed CARTO dark style, with no fallback or arbitrary URL',()=>{
  for(const value of [undefined,null,'',' ','short','https://elsewhere.invalid/','token&profile=private','token\nprivate'])assert.equal(cartoStyleUrl(value),null);
  const url=new URL(cartoStyleUrl('synthetic-test-key')!);assert.equal(url.origin,'https://basemaps.cartocdn.com');assert.equal(url.pathname,'/gl/dark-matter-gl-style/style.json');assert.deepEqual([...url.searchParams.keys()],['key']);assert.equal(url.searchParams.get('key'),'synthetic-test-key');
  assert.ok(cartoStyleUrl('synthetic.jwt.token'));

});
test('temporary map dossier preserves camera, selected key, list mode and scroll; reset creates clean owner state',()=>{
  const initial={...newMapSession(),selectedKey:'one',camera:{center:[6.57,53.22] as [number,number],zoom:15,bearing:12,pitch:0},mode:'list' as const,listScroll:412.5};
  const detail=openMapDetail(initial,'two');assert.equal(detail.detailKey,'two');assert.equal(detail.selectedKey,'two');
  const back=closeMapDetail(detail);assert.deepEqual(back,{...initial,selectedKey:'two'});assert.equal(back.camera,initial.camera);assert.equal(initial.detailKey,null);
  assert.deepEqual(newMapSession(),{selectedKey:null,camera:null,mode:'map',listScroll:0,detailKey:null});assert.notEqual(newMapSession(),newMapSession());
});
