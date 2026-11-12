import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {ingest} from '../worker/sources';import {inventoryUrl,parseInventory} from '../worker/inventory';import {ReadFailure,robotsPolicy} from '../worker/http';
import {sourceUrls} from '../worker/parsers';import {reconcile} from '../shared/state';import {neutralProfile} from '../shared/model';
const fixture=(name:string)=>readFileSync(new URL(`./fixtures/${name}.html`,import.meta.url),'utf8');
const first=sourceUrls.gruno,second=first+'?moveunavailablelistingstothebottom=true&skip=10',detail=(n:string)=>`https://www.grunoverhuur.nl/woningaanbod/huur/groningen/fixture/${n}`;
const html=(id:string)=>fixture('gruno').replaceAll('01853',id);
const noPause=async()=>{};
test('full inventory follows actual pagination to termination and dedups query variants',async()=>{
 const calls:string[]=[];
 const result=await ingest(['gruno'],'now',{full:true,pause:noPause,read:async url=>{calls.push(url);if(url.endsWith('/robots.txt'))return 'User-agent: *\nDisallow:';if(url===first)return fixture('gruno-inventory-1');if(url===second)return fixture('gruno-inventory-2');return html(url.endsWith('/1')?'1':'2');}});
 const run=result.runs[0];assert.equal(run.coverage,'complete');assert.equal(run.stats!.inventoryPages,2);assert.equal(run.stats!.detailsDiscovered,2);assert.equal(run.stats!.detailsRead,2);assert.equal(result.listings.length,2);assert.equal(calls.filter(url=>url===detail('1')).length,1);
});
test('external IDs dedup aliases and loops/unsafe pagination cannot claim completeness',async()=>{
 const page=fixture('gruno-inventory-1').replace('2 objecten','1 objecten').replace('skip=10','skip=0');
 const result=await ingest(['gruno'],'now',{full:true,pause:noPause,read:async url=>url.endsWith('/robots.txt')?'User-agent: *\nDisallow:':url.includes('/woningaanbod/groningen')?page:html('same')});
 assert.equal(result.runs[0].coverage,'partial');assert.match(result.runs[0].message,/Circulaire/);
 assert.equal(inventoryUrl('gruno','https://other.invalid/woningaanbod/groningen?skip=10'),null);
 assert.equal(inventoryUrl('solide','https://solideverhuur.nl/huurwoningen/%city%/page/2/'),null);
 const aliases=fixture('gruno-inventory-2').replace('</article>','</article><article class="objectcontainer"><a class="sys-property-link" href="/woningaanbod/huur/groningen/fixture/alias">alias</a></article>').replace('<ul class="pagination">','<ul class="not-pagination">');
 const dedup=await ingest(['gruno'],'now',{full:true,pause:noPause,read:async url=>url.endsWith('/robots.txt')?'User-agent: *\nDisallow:':url===first?aliases:html('same')});assert.equal(dedup.listings.length,1);assert.equal(dedup.runs[0].stats!.detailsRead,2);
});
test('detail denial stops the source, retaining successful observations and previous homes',async()=>{
 const calls:string[]=[];const index=fixture('gruno-inventory-2').replace('<ul class="pagination">','<ul class="not-pagination">').replace('</article>',`</article><article class="objectcontainer"><a class="sys-property-link" href="${detail('3')}">Blocked</a></article><article class="objectcontainer"><a class="sys-property-link" href="${detail('4')}">Never read</a></article>`).replace('2 objecten','3 objecten');
 const result=await ingest(['gruno'],'now',{full:true,pause:noPause,read:async url=>{calls.push(url);if(url.endsWith('/robots.txt'))return 'User-agent: *\nDisallow:';if(url===first)return index;if(url===detail('3'))throw new ReadFailure('blocked',403);return html('kept');}});
 assert.equal(result.listings.length,1);assert.equal(result.runs[0].coverage,'blocked');assert.equal(calls.includes(detail('4')),false);
 const old={...result.listings[0],key:'gruno:old',externalId:'old'};const initial=reconcile([],[old],neutralProfile).homes;
 const next=reconcile(initial,result.listings,neutralProfile);assert.equal(next.homes.find(h=>h.listing.key===old.key)!.listing.available,true);
});
test('caps and individual parse failures report partial coverage without losing valid details',async()=>{
 const reader=async(url:string)=>url.endsWith('/robots.txt')?'User-agent: *\nDisallow:':url===first?fixture('gruno-inventory-1'):url===second?fixture('gruno-inventory-2'):url===detail('1')?'<html>unrecognized detail</html>':html('2');
 const partial=await ingest(['gruno'],'now',{full:true,pause:noPause,read:reader});assert.equal(partial.runs[0].coverage,'partial');assert.equal(partial.runs[0].stats!.parseFailures,1);assert.equal(partial.listings.length,1);
 const cap=await ingest(['gruno'],'now',{full:true,maxPages:1,pause:noPause,read:reader});assert.equal(cap.runs[0].coverage,'partial');assert.match(cap.runs[0].message,/Paginering niet voltooid/);
});
test('Solide uses real nav links, ignores Yoast placeholder, excludes other cities; Maxx rented body wins',async()=>{
 const page=parseInventory('solide','<link rel="next" href="/huurwoningen/%city%/page/2/"><div class="search-result"><a href="/huurwoningen/groningen/fixture/">item</a></div><div class="search-result"><a href="/huurwoningen/assen/fixture/">other city</a></div><nav id="nav-pagination"><a href="/huurwoningen/page/2/">2</a></nav>',sourceUrls.solide);
 assert.equal(page.details.length,1);assert.equal(page.excluded,1);assert.equal(page.unsupportedPagination,false);assert.deepEqual(page.pages,['https://solideverhuur.nl/huurwoningen/page/2/']);
 const result=await ingest(['maxx'],'now',{full:true,pause:noPause,read:async url=>url.endsWith('/robots.txt')?'User-agent: *\nDisallow:':url===sourceUrls.maxx?'<span class="aantal-woonruimtes">1</span><div id="filter-results-container"><a class="object" href="/objects/ads/view/id-24102/"><span class="plaatsnaam-object">Groningen</span><span class="type-woonruimte-object">Appartement</span></a></div>':fixture('maxx-rented')});
 assert.equal(result.runs.find(r=>r.source==='maxx')!.stats!.unavailable,1);assert.equal(result.listings[0].available,false);
});
test('robots longest rules and specific groups enforced; no disallowed detail requested',async()=>{
 const p=robotsPolicy('User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*?ReturnUrl=\nUser-agent: OtherBot\nDisallow: /');
 assert.equal(p.allowed('https://example.invalid/private/a'),false);assert.equal(p.allowed('https://example.invalid/private/public/a'),true);assert.equal(p.allowed('https://example.invalid/x?ReturnUrl=abc'),false);
 const calls:string[]=[];const result=await ingest(['gruno'],'now',{full:true,pause:noPause,read:async url=>{calls.push(url);return 'User-agent: Huurmonitor-personal\nDisallow: /';}});
 assert.equal(result.runs[0].coverage,'blocked');assert.equal(calls.length,1);
});
