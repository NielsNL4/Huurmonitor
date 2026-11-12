import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseGrunoLocation } from '../worker/gruno-location';
import { parseListing } from '../worker/parsers';
import { mapLinks } from '../shared/location';
import { PropertyMap } from '../src/PropertyMap';
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.html`,import.meta.url),'utf8');
const point = {lat:53.22172,lon:6.578996,provenance:'source' as const,precision:'unknown' as const};
const script = (listing: string) => `<script>window.MAP_POC_CONFIG = { listing: {${listing}}, other: {lat:1,lng:2} };</script>`;

test('Gruno published map config is parsed as static source coordinates, without changing other facts', () => {
  assert.deepEqual(parseGrunoLocation(fixture('gruno-location')),point);
  const url='https://www.grunoverhuur.nl/woningaanbod/huur/groningen/petrus-campersingel/145-a';
  const original=parseListing('gruno',fixture('gruno'),url,'fixture');
  const enriched=parseListing('gruno',fixture('gruno')+fixture('gruno-location'),url,'fixture');
  assert.deepEqual(enriched.location,point);
  const {location:a,...oldFacts}=original, {location:b,...newFacts}=enriched;
  assert.deepEqual(newFacts,oldFacts);
});
test('Gruno map ignores arbitrary coordinates, strings, comments and external script content', () => {
  for(const html of ['<div data-lat="53" data-lng="6"></div>','<script>const place={lat:53,lng:6};</script>',script('title:"lat:53,lng:6"'),'<script>// window.MAP_POC_CONFIG = {listing:{lat:53,lng:6}};\n</script>',`<script>const text='window.MAP_POC_CONFIG = {listing:{lat:53,lng:6}};';</script>`,'<script src="/external.js">window.MAP_POC_CONFIG={listing:{lat:53,lng:6}};</script>']) assert.equal(parseGrunoLocation(html),null);
  assert.equal(parseGrunoLocation('<script>window.MAP_POC_CONFIG = { other:{lat:53,lng:6},listing:{title:"missing"}};</script>'),null);
  assert.deepEqual(parseGrunoLocation(script(`title:'Quoted \\' title } lat:0,lng:0',lat:53.22172,lng:6.578996`)),point);
});
test('Gruno map rejects invalid, nonliteral and conflicting values without executing scripts', () => {
  for(const fields of ['lat:91,lng:6','lat:53,lng:-181','lat:NaN,lng:6','lat:Infinity,lng:6','lat:1e999,lng:6','lat:"53",lng:6','lat:53','lng:6','lat:null,lng:6','lat:53,lng:6,lat:54','lat:53,lng:6,lng:7','lat:(globalThis.MAP_EXECUTED=true),lng:6','lat:50+3,lng:6','...other,lat:53,lng:6']) assert.equal(parseGrunoLocation(script(fields)),null,fields);
  assert.equal(parseGrunoLocation(script('lat:53,lng:6')+script('lat:54,lng:7')),null);
  assert.equal(parseGrunoLocation('<script>window.MAP_POC_CONFIG={listing:{lat:53,lng:6},listing:{lat:54,lng:7}};</script>'),null);
  assert.equal('MAP_EXECUTED' in globalThis,false);
});
test('OSM bbox is lon/lat, marker is lat/lon; old observations and invalid points stay unknown', () => {
  const links=mapLinks(point)!;
  const embed=new URL(links.embed), larger=new URL(links.larger);
  assert.equal(embed.origin,'https://www.openstreetmap.org');
  assert.equal(embed.pathname,'/export/embed.html');
  assert.equal(embed.searchParams.get('bbox'),'6.570996,53.21672,6.586996,53.22672');
  assert.equal(embed.searchParams.get('marker'),'53.22172,6.578996');
  assert.equal(larger.searchParams.get('mlat'),'53.22172');assert.equal(larger.searchParams.get('mlon'),'6.578996');
  for(const location of [undefined,null,{...point,lat:NaN},{...point,lon:181}]) assert.equal(mapLinks(location),null);
  const edge=new URL(mapLinks({...point,lat:90,lon:180})!.embed).searchParams.get('bbox')!.split(',').map(Number);
  assert.ok(edge[2]<=180&&edge[3]<=90);
});
test('Map initial markup automatically embeds valid source points; legacy observations show honest missing location', () => {
  const listing=parseListing('gruno',fixture('gruno'),'https://example.invalid/property','fixture');
  delete listing.location;
  const old=renderToStaticMarkup(createElement(PropertyMap,{listing}));
  assert.match(old,/Locatie op kaart niet beschikbaar/);assert.doesNotMatch(old,/<iframe|Kaart laden|openstreetmap/);
  const initial=renderToStaticMarkup(createElement(PropertyMap,{listing:{...listing,location:point}}));
  assert.match(initial,/<iframe/);assert.match(initial,/src="https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/);assert.match(initial,/referrerPolicy="no-referrer"/i);assert.match(initial,/title="Locatie volgens de bron:/);assert.doesNotMatch(initial,/Kaart laden|<button/);assert.match(initial,/laadt automatisch/);assert.match(initial,/IP-adres/);assert.match(initial,/niet je zoekprofiel/);assert.match(initial,/Locatie volgens de bron/);
});
