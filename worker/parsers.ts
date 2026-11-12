import * as cheerio from 'cheerio';
import type { Coverage, Housing, Listing, Rent, Source } from '../shared/model';
import { parseGruno } from './gruno';
export const sourceUrls: Record<Source, string> = {
  gruno: 'https://www.grunoverhuur.nl/woningaanbod/groningen',
  solide: 'https://solideverhuur.nl/huurwoningen/',
  maxx: 'https://maxxhuren.nl/woning-huren/groningen/',
};
export function numberNL(text: string): number | null {
  const m = text.match(/\d[\d.,]*/);
  if (!m) return null;
  const s = m[0].replace(/[.,]$/, '');
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s);
  return Number.isFinite(n) ? n : null;
}
const cents = (s: string) => { const n = numberNL(s); return n === null ? null : Math.round(n * 100); };
const clean = (s: string) => s.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
const contactPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+31|0)(?:[ .()-]*\d){9}\b/gi;
const safeFact = (s: string) => s && s.length <= 160 && !new RegExp(contactPattern.source,'i').test(s) ? clean(s) : null;
export function calendarDate(value: string | null): string | null {
  if (!value) return null;
  const numeric=value.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/);
  const written=value.toLowerCase().match(/\b(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})\b/);
  const months=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  const day=Number(numeric?.[1] ?? written?.[1]), month=numeric ? Number(numeric[2]) : written ? months.indexOf(written[2])+1 : 0, year=Number(numeric?.[3] ?? written?.[3]);
  if (!day || !month || !year || /\btot\b|\d\s*\/\s*\d/i.test(value)) return null;
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day ? date.toISOString().slice(0,10) : null;
}
function textBlock($: cheerio.CheerioAPI, selector: string) {
  const el = $(selector).first().clone();
  el.find('script,style,h3,button').remove();
  el.find('br').replaceWith('\n');
  el.find('p,li').append('\n\n');
  return clean(el.text()).replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n');
}
function typeFrom(s: string): Housing | null {
  if (/kamer/i.test(s)) return 'kamer';
  if (/studio/i.test(s)) return 'studio';
  if (/appartement|bovenwoning|benedenwoning|maisonnette|flat/i.test(s)) return 'appartement';
  if (/woonhuis|eengezinswoning|hoekwoning|tussenwoning/i.test(s)) return 'huis';
  return null;
}
const componentWords = { gas: /\bgas\b/i, water: /\bwater\b/i, electricity: /\b(?:elektra|elektriciteit|electricity)\b/i, internet: /\binternet\b/i };
export function parseCoverage(...texts: string[]): Coverage {
  const result: Coverage = { gas: 'unknown', water: 'unknown', electricity: 'unknown', internet: 'unknown' };
  const record = (clause: string, state: 'included' | 'excluded') => {
    const expanded = clause.replace(/g\s*\/\s*w\s*\/\s*e/gi, 'gas water elektra');
    for (const key of Object.keys(componentWords) as (keyof Coverage)[]) {
      if (componentWords[key].test(expanded)) result[key] = result[key] === 'unknown' || result[key] === state ? state : 'conflict';
    }
  };
  for (const text of texts) for (const sentence of text.replace(/\b(incl|excl)\./gi, '$1').split(/\n|;|(?<!\d)\.(?!\d)/)) {
    // Prefix coverage has scope only to the next inclusion/exclusion marker.
    // Ambiguous mixed clauses may yield conflict; they must not enable price alerts.
    const markers = [...sentence.matchAll(/\b(inclusief|incl\.?|exclusief|excl\.?)\b/gi)];
    markers.forEach((marker, i) => record(sentence.slice(marker.index! + marker[0].length, markers[i + 1]?.index ?? sentence.length), /^ex/i.test(marker[0]) ? 'excluded' : 'included'));
    const postfix = sentence.match(/^(.+?)\s+(?:is\s+|zijn\s+)?(niet\s+(?:bij\s+de\s+huurprijs\s+)?inbegrepen|inbegrepen|exclusief)\b/i);
    if (postfix) record(postfix[1], /^(niet|ex)/i.test(postfix[2]) ? 'excluded' : 'included');
  }
  return result;
}
function parseGenericListing(source: Source, html: string, url: string, observedAt: string): Listing {
  const $ = cheerio.load(html);
  $('script,style,noscript,form,nav,footer').remove();
  const fields = new Map<string, string>();
  $('tr').each((_, tr) => { const t = $(tr).find('td,th'); if (t.length >= 2) fields.set(clean(t.first().text()).replace(/:$/, '').toLowerCase(), clean(t.eq(1).text())); });
  $('dt').each((_, dt) => { fields.set(clean($(dt).text()).toLowerCase(), clean($(dt).next('dd').text())); });
  if (source === 'maxx') $('.div-block-117').each((_,row)=>{
    const cells=$(row).find('.text-block-49');
    if (cells.length===2) fields.set(clean(cells.eq(0).text()).toLowerCase(),clean(cells.eq(1).text()));
  });
  // Maxx exposes label/value blocks rather than a table on some detail templates.
  $('[class*="label"], [class*="kenmerk-titel"]').each((_, el) => {
    const key = clean($(el).text()).replace(/:$/, '').toLowerCase();
    if (key.length < 45 && !fields.has(key)) fields.set(key, clean($(el).next().text()));
  });
  const field = (...names: string[]) => names.map(n => fields.get(n)).find(Boolean) ?? '';
  const title = source === 'gruno' ? field('adres').split(',')[0] : clean($('h1.entry-title, h1').first().text());
  let description = textBlock($, source === 'gruno' ? '.description.textblock' : source === 'solide' ? '.card-unit-description .card-body, .unit-description .card-body, .unit-description' : '.object-description, .object-omschrijving, .omschrijving, .w-richtext, [class*="description"], p.paragraph-8').replace(contactPattern,'[contactgegevens weggelaten]');
  const structuredSolide = source === 'solide' && $('.epl-listing-single[id]').length === 1 && !!field('status') && fields.has('kale huurprijs') && fields.has('oppervlakte');
  if (!title || (!description && !structuredSolide)) throw new Error(`${source}: detailstructuur niet herkend; geen gegevens vervangen`);
  if (!description) description = 'Beschrijving niet vermeld door de bron.';
  const status = field('status') || clean($('.object_status, .object-beschikbaar, .object-onder-optie, .div-block-125 .text-block-51').first().text());
  const unavailable = /(?:al(?:ready)?\s+(?:is\s+)?(?:verhuurd|rented)|reeds\s+verhuurd|niet (?:meer )?beschikbaar|bijna verhuurd|onder (?:optie|voorbehoud)|voorbeeldwoning)/i.test(`${status} ${description}`) || /^(verhuurd|rented)$/i.test(status);
  const available = unavailable ? false : /beschikbaar|nieuw in verhuur|te huur/i.test(status) ? true : null;
  const baseText = field('kale huurprijs', 'kale huur', 'huurprijs exclusief', 'netto huurprijs');
  const headlineText = field('huurprijs') || clean($('.object_price, .huurprijs-object, .page-price, .text-block-54').first().text());
  let serviceAggregate = cents(field('servicekosten'));
  let base = cents(baseText), headline = cents(headlineText);
  if (source === 'maxx') {
    if (base === null) base=cents(description.match(/kale huurprijs\s+(?:bedraagt|is)\s*€\s*([\d.,]+)/i)?.[1] || '');
    if (serviceAggregate === null) serviceAggregate=cents(description.match(/€\s*([\d.,]+)-?\s*(?:aan\s+)?servicekosten/i)?.[1] || '');
  }
  let service = cents(field('voorschot servicekosten')), energy = cents(field('voorschot energiekosten'));
  let knownMonthly: number | null = null, comparison: string | null = null;
  let utilities = 'Niet volledig vermeld', complete = false;
  let note = 'Niet alle bijkomende kosten zijn bekend. Geen all-in bedrag.';
  if (source === 'solide') {
    // Aggregate servicekosten already contains both itemized advances.
    const sum = service !== null && energy !== null ? service + energy : serviceAggregate;
    if (base !== null && sum !== null) { knownMonthly = base + sum; comparison = 'base+aggregate-service-energy'; }
    utilities = /(?:g\/w\/e|gas,? water (?:en )?(?:elektra|elektriciteit)).{0,40}(?:inbegrepen|inclusief)|inclusief.{0,40}(?:gas|g\/w\/e)/i.test(description) ? 'G/W/E volgens beschrijving inbegrepen' : 'Energievoorschot vermeld; dekking controleren';
    if (/elektriciteit.{0,35}(?:niet|exclusief)|(?:exclusief|niet inbegrepen).{0,35}elektriciteit/i.test(description)) utilities = 'Elektriciteit niet inbegrepen';
    note = 'Kale huur + service-/energievoorschot. Het service-totaal niet nogmaals opgeteld. Overige kosten kunnen ontbreken.';
  } else {
    const incl = description.match(/(?:huurprijs|huur)[^.\n]{0,100}€\s*([\d.,]+)[^\n]{0,60}inclusief[^\n]{0,80}(?:voorschot|service)/i);
    const totalText = field('totale huurprijs', 'totale huur', 'totaal per maand', 'totaal') || (source === 'maxx' ? description.match(/totale (?:maandelijkse )?huurprijs\s+(?:komt(?: hiermee)? uit op|bedraagt|is)\s*€\s*([\d.,]+)/i)?.[1] || '' : '');
    if (totalText) { knownMonthly = cents(totalText); comparison = 'stated-total'; }
    if (incl && headline !== null) {
      knownMonthly = cents(incl[1]); comparison = 'headline-includes-advance';
      const advance = description.match(/inclusief een voorschot van\s*€\s*([\d.,]+)/i);
      if (advance && serviceAggregate === null) energy = cents(advance[1]);
      // Do not reverse-engineer a base rent: no explicit base means unknown.
      note = 'Het voorschot is al inbegrepen in dit bedrag. Kale huur niet afzonderlijk bevestigd.';
    } else if (base !== null && serviceAggregate !== null) {
      knownMonthly = base + serviceAggregate; comparison = 'base+aggregate';
    }
    if (/inclusief.{0,100}(?:gas|water|elektra)|incl\. (?:gas|water)/i.test(`${headlineText} ${description}`)) utilities = 'Voorschot G/W/E inbegrepen; zie beschrijving';
    if (/excl(?:usief)?[.\s]{0,5}(?:gas|g\/w\/e|utilities)|(?:gas|water|elektra).{0,35}(?:niet inbegrepen|exclusief)/i.test(description)) utilities = 'G/W/E niet inbegrepen';
  }
  const coverage = parseCoverage(headlineText, description);
  const names = { gas: 'gas', water: 'water', electricity: 'elektriciteit', internet: 'internet' };
  const states = { included: 'inbegrepen', excluded: 'niet inbegrepen', unknown: 'onbekend', conflict: 'tegenstrijdig vermeld' };
  note += ` Dekking: ${(Object.keys(names) as (keyof Coverage)[]).map(key => `${names[key]} ${states[coverage[key]]}`).join('; ')}.`;
  const rent: Rent = { base, headline, serviceAggregate, service, energy, knownMonthly, comparison, coverage, utilities, complete, note };
  const photos = [...new Set($(source === 'gruno' ? '.object_image[data-original]' : source === 'solide' ? '.unit-media .carousel-item img' : '.object-images img, .object-gallery img, .swiper-slide img, .w-slider img').map((_, img) => $(img).attr('data-original') || $(img).attr('data-src') || $(img).attr('src')).get())].filter((s): s is string => !!s && /^https:\/\//.test(s));
  const explicitDate=description.match(/\bper\s+(\d{1,2}-\d{1,2}-\d{4}|\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}|direct)/i)?.[1];
  const moveIn = safeFact(field('beschikbaar per', 'beschikbaar vanaf', 'beschikbaar') || (source === 'maxx' ? clean($('.div-block-125 .text-block-51').first().text()) : '') || explicitDate || field('aanvaarding'));
  const neighbourhood = safeFact(field('wijk', 'buurt') || description.match(/(?:in de (?:leuke |populaire |rustige |gewilde )?(?:buurt|wijk)|(?:buurt|wijk)\s*:)\s+([A-ZÀ-Ž][\p{L}\p{M} -]{1,60})/u)?.[1]?.split(/\s+(?:in|te|van)\s+/)[0] || description.match(/gelegen in de ([A-ZÀ-Ž][\p{L}\p{M}-]*wijk)\b/u)?.[1] || '');
  const bedroomText = field('slaapkamers', 'aantal slaapkamers') || field('aantal kamers').match(/waarvan\s+(\d+)\s+slaapkamer/i)?.[1] || '';
  const income = description.match(/(?:minimum|minimaal|minimale)\s+(?:bruto\s+)?(?:maand)?inkomen[^€\n]{0,25}€\s*([\d.,]+)/i);
  const externalId = source === 'gruno' ? field('referentienummer') : source === 'maxx' ? url.match(/id-(\d+)/)?.[1] : $('.epl-listing-single').attr('id')?.replace('post-', '');
  if (!externalId) throw new Error(`${source}: stabiele bron-id ontbreekt`);
  return { key: `${source}:${externalId}`, externalId, source, url: url.split('?')[0], title, description, rent, photos,
    city: /\bGroningen\b/i.test(`${field('adres', 'plaats')} ${source === 'solide' ? $('h1.entry-title').next().text() : ''} ${description.slice(0, 400)}`) ? 'Groningen' : null,
    neighbourhood, advertiser: { gruno: 'Gruno Verhuur', solide: 'Solide Verhuur', maxx: 'Maxx Aanhuurmakelaars' }[source], landlord: safeFact(field('verhuurder')),
    moveInDate: calendarDate(moveIn),
    type: typeFrom(field('woning type', 'type woning', 'type object', 'type woonruimte', 'soort woonruimte')) || typeFrom(`${title} ${description.slice(0, 200)}`),
    area: numberNL(field('woonoppervlakte', 'oppervlakte', 'woonoppervlak')), bedrooms: numberNL(bedroomText), moveIn, available, incomeMin: income ? cents(income[1]) : null, observedAt };
}
export function parseListing(source: Source, html: string, url: string, observedAt: string): Listing {
  if (source === 'gruno') return parseGruno(html,url,observedAt,{numberNL,calendarDate,parseCoverage,redact:value=>value.replace(contactPattern,'[contactgegevens weggelaten]')});
  return parseGenericListing(source,html,url,observedAt);
}
export function discover(source: Source, html: string): string[] {
  const $ = cheerio.load(html), base = sourceUrls[source];
  const selector = source === 'gruno' ? 'a.sys-property-link' : source === 'maxx' ? 'a.object[href*="/objects/ads/view/id-"]' : '.search-result a[href*="/huurwoningen/groningen/"]';
  return [...new Set($(selector).map((_, a) => { const u = new URL($(a).attr('href')!, base); u.search = ''; u.hash = ''; return u.href; }).get())].filter(u => new URL(u).hostname === new URL(base).hostname);
}
