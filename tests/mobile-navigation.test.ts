import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveMatches, mobileScreenKey, openDossier } from '../src/mobile-navigation';
import { neutralProfile, type Listing } from '../shared/model';
import { evaluate } from '../shared/matcher';
import { decide, reconcile } from '../shared/state';

const listing: Listing = { key:'gruno:ui-fixture',externalId:'ui-fixture',source:'gruno',url:'https://example.invalid',title:'Voorbeeldstraat 1',city:'Groningen',neighbourhood:'Binnenstad',type:'kamer',area:20,bedrooms:1,available:true,moveIn:null,description:'Local unit fixture',photos:[],incomeMin:120000,observedAt:'2026-11-11T00:00:00Z',rent:{base:70000,headline:80000,serviceAggregate:10000,service:null,energy:null,knownMonthly:80000,comparison:'base+aggregate',utilities:'Onbekend',complete:false,note:''} };
test('dossier captures each real collection origin and exact reading position',()=>{
  for(const origin of ['favourite','dismissed'] as const){
    const selection=openDossier(listing.key,origin,412.5);
    assert.deepEqual(selection,{key:listing.key,origin,scrollTop:412.5});
    assert.equal(mobileScreenKey(origin,undefined,selection),`dossier:${listing.key}`);
    assert.equal(mobileScreenKey(selection.origin,listing.key,null),`view:${origin}`);
  }
  assert.equal(openDossier('a','favourite',-5).scrollTop,0);
  assert.equal(openDossier('a','dismissed',NaN).scrollTop,0);
});
test('only a changed property key resets New; collection selection is not reading identity',()=>{
  assert.notEqual(mobileScreenKey('new','a',null),mobileScreenKey('new','b',null));
  assert.equal(mobileScreenKey('favourite','a',null),mobileScreenKey('favourite','b',null));
  assert.equal(mobileScreenKey('dismissed','a',null),mobileScreenKey('dismissed',undefined,null));
  assert.equal(mobileScreenKey('new',undefined,null),'new:empty');
});
test('archive filters current real evaluations, not a personal dismissal reason',()=>{
  const profile={...neutralProfile,maxBudget:75000,minArea:30,checkIncome:true,income:100000};
  const home=reconcile([],[listing],profile).homes[0];
  for(const filter of ['budget','area','income'] as const)assert.equal(archiveMatches(home,'',filter),true);
  assert.equal(archiveMatches(home,' BINNENSTAD ','all'),true);
  assert.equal(archiveMatches(home,'voorbeeldstraat','all'),true);
  assert.equal(archiveMatches(home,'fictieve notitie','all'),false);
  const current={...home,evaluation:evaluate(listing,neutralProfile)};
  for(const filter of ['budget','area','income'] as const)assert.equal(archiveMatches(current,'',filter),false);
});
test('collection actions retain homes and real dismissal history; restore never bypasses matching',()=>{
  const home=reconcile([],[listing],neutralProfile).homes[0];
  const favourite=decide(home,'favourite','2026-11-12T00:00:00Z',neutralProfile);
  const removed=decide(favourite,'new','2026-11-12T01:00:00Z',neutralProfile);
  assert.equal(removed.listing.key,listing.key);
  assert.equal(removed.decision,'new');
  const dismissed=decide(home,'dismissed','2026-11-12T02:00:00Z',neutralProfile);
  const restored=decide(dismissed,'new','2026-11-12T03:00:00Z',neutralProfile);
  assert.equal(restored.dismissal?.at,'2026-11-12T02:00:00Z');
  assert.equal(evaluate(restored.listing,{...neutralProfile,minArea:50}).eligible,false);
});
