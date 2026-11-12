import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDate, discover, parseListing } from '../worker/parsers';
import { allowedSources } from '../worker/sources';
import type { Source } from '../shared/model';
import { neutralProfile } from '../shared/model';
import { reconcile } from '../shared/state';
import { coverageSignature } from '../shared/rent';
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');
const parse = (s: Source, name = s as string) => parseListing(s, fixture(name), s === 'maxx' ? 'https://maxxhuren.nl/objects/ads/view/id-24500/' : `https://example.invalid/${name}`, '2026-11-11T00:00:00Z');
test('mandatory_costs_not_doubled: Gruno advance is already in headline', () => {
  const l = parse('gruno'); assert.equal(l.rent.knownMonthly, 80500); assert.equal(l.rent.serviceAggregate, 7500); assert.equal(l.rent.base, null); assert.equal(l.bedrooms, 1); assert.equal(l.area, 19.94); assert.equal(l.available, true);
});
test('explicit neighbourhood, advertiser versus landlord, property type and move-in facts',()=>{
 const gruno=parse('gruno');assert.equal(gruno.neighbourhood,'Oosterparkwijk');assert.equal(gruno.advertiser,'Gruno Verhuur');assert.equal(gruno.landlord,null);assert.equal(gruno.type,'kamer');assert.equal(gruno.moveInDate,'2026-12-01');assert.match(gruno.moveIn!,/^01-12-2026/);
 const solide=parse('solide');assert.equal(solide.neighbourhood,null);assert.equal(solide.advertiser,'Solide Verhuur');assert.equal(solide.landlord,null);assert.equal(solide.moveInDate,'2026-12-01');
 assert.equal(calendarDate('per direct'),null);assert.equal(calendarDate('in overleg'),null);assert.equal(calendarDate('1 december 2026'),'2026-12-01');assert.equal(calendarDate('31-02-2026'),null);assert.equal(calendarDate('01/02/2026'),null);
 const minimal='<div class="object_details"><table class="object_table_details"><tr><td>Adres</td><td>Fixture, Groningen</td></tr></table></div><div id="tabs-2"><table class="feautures"><tr><td>Referentienummer</td><td>fixture</td></tr><tr><td>Aangeboden sinds</td><td>11-11-2026</td></tr><tr><td>Verhuurder</td><td>Stichting Voorbeeld</td></tr></table></div><div id="tabs-3"><div class="description textblock">Een woning in Groningen. Contact: fixture@example.invalid, 0501234567.</div></div>';
 const listing=parseListing('gruno',minimal,'https://example.invalid','now');assert.equal(listing.moveIn,null);assert.equal(listing.moveInDate,null);assert.equal(listing.type,null);assert.equal(listing.neighbourhood,null);assert.equal(listing.landlord,'Stichting Voorbeeld');assert.doesNotMatch(listing.description,/@|0501234567/);
});
test('mandatory_costs_not_doubled: Solide aggregate is not extra', () => {
  for (const [name, total] of [['solide', 78475], ['solide-donders', 95106], ['solide-vondel', 150110]] as const) assert.equal(parse('solide', name).rent.knownMonthly, total);
  assert.match(parse('solide', 'solide-vondel').rent.utilities, /niet inbegrepen/);
});
test('Maxx reconstructed cost/availability regressions', () => {
  assert.equal(parse('maxx').rent.knownMonthly, 73065);
  const rented = parse('maxx', 'maxx-rented'); assert.equal(rented.available, false); assert.equal(rented.rent.knownMonthly, null); assert.equal(rented.bedrooms, null);
  assert.equal(parseListing('maxx', fixture('maxx-rented').replace('Vismarkt 90','Schilderswijk 0'), 'https://maxxhuren.nl/objects/ads/view/id-24396/', 'old').available, false);
});
test('live Maxx Webflow markup exposes explicit facts without deriving bedrooms from rooms',()=>{
 const l=parse('maxx','maxx-live');assert.equal(l.available,true);assert.equal(l.rent.base,68065);assert.equal(l.rent.serviceAggregate,5000);assert.equal(l.rent.knownMonthly,73065);assert.equal(l.area,21);assert.equal(l.bedrooms,null);assert.equal(l.type,'kamer');assert.equal(l.neighbourhood,'Korrewegwijk');assert.equal(l.advertiser,'Maxx Aanhuurmakelaars');assert.equal(l.landlord,null);assert.equal(l.moveIn,'Per direct beschikbaar');assert.equal(l.moveInDate,null);
 const unavailable=parseListing('maxx',fixture('maxx-live').replace('Per direct een prachtige','Deze woonruimte is al verhuurd. Per direct een prachtige'),'https://maxxhuren.nl/objects/ads/view/id-24500/','now');assert.equal(unavailable.available,false);
});
test('confirmed structured Solide listing with empty bio preserves inactive observation and unknown facts',()=>{
 const listing=parse('solide','solide-empty-description');assert.equal(listing.available,false);assert.equal(listing.description,'Beschrijving niet vermeld door de bron.');assert.equal(listing.type,null);assert.equal(listing.bedrooms,null);assert.equal(listing.moveIn,null);assert.equal(listing.rent.knownMonthly,null);
 assert.throws(()=>parseListing('solide','<h1>Unrecognized page</h1><div class="unit-description"></div>','https://example.invalid','now'),/detailstructuur niet herkend/);
});
test('missing fields stay unknown and broken detail is rejected', () => {
  const l = parse('solide'); assert.equal(l.bedrooms, null); assert.equal(l.incomeMin, null); assert.equal(l.type, 'studio');
  assert.throws(() => parseListing('gruno', '<body>Blocked</body>', 'https://example.invalid', 'old'));
});
test('source discovery is bounded to real detail links, allowlist defaults off', () => {
  assert.deepEqual(allowedSources(), []); assert.throws(() => allowedSources('other'));
  assert.deepEqual(discover('maxx', '<a class="object" href="/objects/ads/view/id-24500/">Home</a>'), ['https://maxxhuren.nl/objects/ads/view/id-24500/']);
  assert.deepEqual(discover('solide', '<div class="search-result"><a href="https://solideverhuur.nl/huurwoningen/groningen/29-hardewikerstraat-9712gr/">Home</a></div>'), ['https://solideverhuur.nl/huurwoningen/groningen/29-hardewikerstraat-9712gr/']);
});
test('lower Gruno headline with internet or electricity excluded is not a comparable drop', () => {
  const original = parse('gruno'), initial = reconcile([], [original], neutralProfile);
  assert.deepEqual(original.rent.coverage, { gas: 'included', water: 'included', electricity: 'included', internet: 'included' });
  for (const [fixtureName, component] of [['gruno-internet-excluded', 'internet'], ['gruno-electricity-excluded', 'electricity']] as const) {
    const changed = parse('gruno', fixtureName);
    assert.equal(changed.rent.coverage![component], 'excluded');
    assert.equal(changed.rent.knownMonthly, 78500);
    assert.notEqual(coverageSignature(original.rent), coverageSignature(changed.rent));
    assert.match(changed.rent.note, new RegExp(`${component === 'electricity' ? 'elektriciteit' : component} niet inbegrepen`));
    assert.equal(reconcile(initial.homes, [changed], neutralProfile).events.length, 0);
  }
  const sameCoverage = parseListing('gruno', fixture('gruno').replaceAll('805', '785'), original.url, 'new');
  assert.equal(reconcile(initial.homes, [sameCoverage], neutralProfile).events.length, 1);
});
test('missing or contradictory component facts block comparison rather than guessing coverage', () => {
  const unknown = parseListing('gruno', fixture('gruno').replaceAll('internet', 'overige voorzieningen'), 'https://example.invalid', 'old');
  assert.equal(unknown.rent.coverage!.internet, 'unknown'); assert.equal(coverageSignature(unknown.rent), null);
  const conflict = parseListing('gruno', fixture('gruno').replace('</body>', '<div></div></body>').replace('De waarborgsom', 'Internet is niet inbegrepen. De waarborgsom'), 'https://example.invalid', 'old');
  assert.equal(conflict.rent.coverage!.internet, 'conflict'); assert.equal(coverageSignature(conflict.rent), null);
});
