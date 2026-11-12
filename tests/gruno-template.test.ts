import {test} from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{parseListing}from'../worker/parsers';import{priceDisplay}from'../shared/price-display';import{evaluate}from'../shared/matcher';import{neutralProfile}from'../shared/model';import{decide,reconcile}from'../shared/state';
const fixture=(name:string)=>readFileSync(new URL(`./fixtures/${name}.html`,import.meta.url),'utf8');
const parse=(html:string)=>parseListing('gruno',html,'https://www.grunoverhuur.nl/woningaanbod/huur/groningen/fixture/1','fixture');
function page({price='€ 805,- per maand',hero='€805,00 /mnd',body='Kamer te huur.',extra='',photos=''}={}){
 return `<div class="object_header"><div class="object_details"><h1 class="object_title">Marketingtitel</h1><div class="object_price">${hero}</div><table class="object_table_details"><tr><td>Adres:</td><td>Fixture 1, Groningen</td></tr></table></div>${photos}</div><div id="tabs-2"><table class="feautures"><tr><td>Referentienummer</td><td>0007</td></tr><tr><td>Huurprijs</td><td>${price}</td></tr><tr><td>Status</td><td>Nieuw in verhuur</td></tr>${extra}</table></div><div class="short_description">NIET DE VOLLEDIGE BIO</div><div id="tabs-3"><div class="description textblock">${body}</div></div><table><tr><td>Huurprijs</td><td>€9999,-</td></tr><tr><td>Servicekosten</td><td>€999,-</td></tr></table><div class="object_price">€9999,-</div>`;
}
test('Gruno actual Petrus/Jozef template: included advance counted once, unknown base, Schildersbuurt',()=>{
 const petrus=parse(fixture('gruno'));assert.equal(petrus.externalId,'01853');assert.equal(petrus.rent.headline,80500);assert.equal(petrus.rent.knownMonthly,80500);assert.equal(petrus.rent.serviceAggregate,7500);assert.equal(petrus.rent.base,null);assert.equal(petrus.area,19.94);assert.equal(petrus.bedrooms,1);assert.equal(petrus.neighbourhood,'Oosterparkwijk');assert.equal(petrus.moveInDate,'2026-12-01');assert.doesNotMatch(petrus.description,/NIET DE VOLLEDIGE/);
 const jozef=parse(fixture('gruno-jozef'));assert.equal(jozef.rent.knownMonthly,126500);assert.equal(jozef.rent.serviceAggregate,20000);assert.equal(jozef.rent.base,null);assert.equal(jozef.neighbourhood,'Schildersbuurt');assert.equal(jozef.advertiser,'Gruno Verhuur');assert.equal(jozef.landlord,null);
});
test('Gruno documented currency punctuation and equivalent row/summary amounts',()=>{
 for(const [price,hero,amount]of [['€ 1.140,- per maand','€1.140,00 /mnd',114000],['€ 1\u00a0140,50 per maand','€1.140,50 /mnd',114050],['EUR 637,62 per maand','€637,62 /mnd',63762]]as const){const l=parse(page({price,hero}));assert.equal(l.rent.headline,amount);assert.equal(l.rent.knownMonthly,null);assert.equal(l.rent.base,null);assert.ok(l.rent.headlineText?.includes(price.replace(/\u00a0/g,' ')));}
 const included=parse(page({price:'€1.140,- per maand',hero:'€1.140,- /mnd',extra:'<tr><td>Servicekosten</td><td>€175,-</td></tr>',body:'Huurprijs en borg:<br>De huurprijs bedraagt €1140,- inclusief een voorschot van €175,- voor gas, water, elektra en internet.'}));assert.equal(included.rent.knownMonthly,114000);
});
test('Gruno advertised fallback is honest when financial evidence is absent or exclusive/unspecified',()=>{
 for(const body of ['Geen financiële beschrijving verstrekt.','Huurprijs en borg:<br>De huur van de kamer bedraagt €650,- exclusief per maand. De waarborgsom bedraagt één maand huur.']){
  const l=parse(page({price:'€650,- per maand',hero:'€650,- /mnd',body}));assert.equal(l.rent.headline,65000);assert.equal(l.rent.knownMonthly,null);assert.equal(l.rent.base,null);assert.deepEqual(priceDisplay(l),{amount:65000,label:'Geadverteerde huurprijs',caveat:'kostenbasis niet bevestigd',advertisedFallback:true});
 }
});
test('Gruno actual affected retained 01838 price discrepancy does not get silently resolved',()=>{
 // Retained public observation: headline 637.62, body room-2 quote 637.32. Wrapper is synthetic, not fetched/imported data.
 const l=parse(page({price:'€637,62 per maand',hero:'€637,62 /mnd',body:'Huurprijs en borg:<br>De huurprijs voor kamer 2 bedraagt €637,32 per maand, exclusief nutsvoorzieningen.'}));assert.equal(l.rent.headline,63762);assert.equal(l.rent.knownMonthly,null);assert.match(l.rent.note,/ander huurbedrag/);assert.equal(priceDisplay(l).amount,63762);
});
test('Gruno scoped rows ignore footer data; conflicting duplicate rows/summary stay unknown',()=>{
 const identical=parse(page({extra:'<tr><td>Huurprijs</td><td>€ 805,- per maand</td></tr>'}));assert.equal(identical.rent.headline,80500);assert.equal(identical.rent.serviceAggregate,null);assert.equal(identical.externalId,'0007');
 for(const html of [page({hero:'€900,- /mnd'}),page({extra:'<tr><td>Huurprijs</td><td>€900,- per maand</td></tr>'})]){const l=parse(html);assert.equal(l.rent.headline,null);assert.equal(l.rent.knownMonthly,null);assert.equal(l.rent.headlineConflict,true);assert.equal(priceDisplay(l).amount,null);}
 assert.throws(()=>parse(page().replace('<td>0007</td>','<td></td>')),/scoped identity/);
});
test('Gruno base is explicit only; aggregate service added once when supported',()=>{
 const l=parse(page({price:'€775,- per maand',hero:'€775,- /mnd',extra:'<tr><td>Kale huurprijs</td><td>€700,-</td></tr><tr><td>Servicekosten</td><td>€75,-</td></tr>',body:'Huurprijs en borg:<br>De kale huurprijs bedraagt €700,- per maand.'}));assert.equal(l.rent.base,70000);assert.equal(l.rent.knownMonthly,77500);assert.equal(l.rent.energy,null);assert.equal(l.rent.service,null);
});
test('Gruno full description/status/photo/date fields remain scoped and preserve uncertainty',()=>{
 const l=parse(page({extra:'<tr><td>Woonoppervlakte</td><td>19,94 m²</td></tr><tr><td>Aantal kamers</td><td>3 (waarvan 1 slaapkamer)</td></tr><tr><td>Aanvaarding</td><td>01-01-2027</td></tr><tr><td>Aangeboden sinds</td><td>12-11-2026</td></tr>',body:'Locatie:<br>Gelegen in de Schildersbuurt.<br>Beschikbaarheid:<br>Per 01-12-2026 beschikbaar. Deze woning is reeds verhuurd.<br>Contact: fixture@example.invalid 0501234567.',photos:'<img class="object_image" data-original="https://example.invalid/1.jpg"><img class="object_image" data-original="https://example.invalid/1.jpg"><img class="object_image" data-original="https://example.invalid/2.jpg">'}));assert.equal(l.available,false);assert.equal(l.bedrooms,1);assert.equal(l.area,19.94);assert.equal(l.neighbourhood,'Schildersbuurt');assert.equal(l.moveInDate,null);assert.match(l.moveIn!,/01-12-2026/);assert.match(l.moveIn!,/01-01-2027/);assert.doesNotMatch(l.description,/@|0501234567|NIET DE VOLLEDIGE/);assert.deepEqual(l.photos,['https://example.invalid/1.jpg','https://example.invalid/2.jpg']);
 const fallback=parse(page()+'<div id="object-photos"><a href="https://example.invalid/source.jpg">foto</a></div>');assert.deepEqual(fallback.photos,['https://example.invalid/source.jpg']);assert.equal(fallback.moveIn,null);assert.equal(fallback.moveInDate,null);
 const conflict=parse(page({extra:'<tr><td>Status</td><td>Verhuurd</td></tr><tr><td>Wijk</td><td>Wijk A</td></tr><tr><td>Wijk</td><td>Wijk B</td></tr><tr><td>Aanvaarding</td><td>01-12-2026</td></tr><tr><td>Aanvaarding</td><td>01-01-2027</td></tr>'}));assert.equal(conflict.available,false);assert.equal(conflict.neighbourhood,null);assert.equal(conflict.moveInDate,null);assert.match(conflict.moveIn!,/01-01-2027/);
});
test('Gruno UI fallback neither changes eligibility nor notifies/resurfaces; other sources unchanged',()=>{
 const l=parse(page()),before=structuredClone(l);
 for(const basis of ['base','knownMonthly']as const){const p={...neutralProfile,basis,maxBudget:100000};const evaluation=evaluate(l,p);assert.equal(evaluation.verdict,'unknown');assert.equal(evaluation.eligible,false);priceDisplay(l);assert.deepEqual(evaluate(l,p),evaluation);const home=decide(reconcile([],[l],p).homes[0],'dismissed','fixture',p);assert.equal(reconcile([home],[],p).events.length,0);assert.equal(reconcile([home],[],p).homes[0].decision,'dismissed');}
 assert.deepEqual(l,before);for(const source of ['solide','maxx']as const)assert.equal(priceDisplay({...l,source}).amount,null);
 const confirmed={...l,rent:{...l.rent,knownMonthly:90000}};assert.equal(priceDisplay(confirmed).amount,90000);assert.equal(priceDisplay(confirmed).advertisedFallback,false);
});
