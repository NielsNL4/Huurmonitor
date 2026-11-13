import * as cheerio from 'cheerio';
import type { Coverage, Housing, Listing, Rent } from '../shared/model';
import { parseGrunoLocation } from './gruno-location';
import { sourceAddress } from '../shared/address';

interface Tools {
  numberNL: (value: string) => number | null;
  calendarDate: (value: string | null) => string | null;
  parseCoverage: (...values: string[]) => Coverage;
  redact: (value: string) => string;
}
const clean = (value: string) => value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
function rows($: cheerio.CheerioAPI, selector: string) {
  const values = new Map<string, Set<string>>();
  $(selector).each((_, row) => {
    const cells = $(row).children('td,th'); if (cells.length !== 2) return;
    const label = clean(cells.first().text()).replace(/:$/, '').toLowerCase();
    const set = values.get(label) ?? new Set<string>(); set.add(clean(cells.eq(1).text())); values.set(label, set);
  });
  return {
    all: (label: string) => [...(values.get(label) ?? [])],
    get(label: string) { const set = values.get(label); return set?.size === 1 ? [...set][0] : null; },
    conflict: (label: string) => (values.get(label)?.size ?? 0) > 1,
  };
}
function section(description: string, wanted: RegExp) {
  const out: string[] = []; let collecting = false;
  for (const line of description.split('\n').map(s => s.trim()).filter(Boolean)) {
    const heading = /^[\p{L} &/-]{2,55}:$/u.test(line) || /^(huurprijs en borg|huurprijs en waarborgsom|locatie|indeling|beschikbaarheid en huurperiode)$/i.test(line);
    if (heading) { collecting = wanted.test(line); continue; }
    if (collecting) out.push(line);
  }
  return out.join('\n');
}
function housing(value: string): Housing | null {
  if (/kamer/i.test(value)) return 'kamer';
  if (/studio/i.test(value)) return 'studio';
  if (/appartement|bovenwoning|benedenwoning|maisonnette|flat/i.test(value)) return 'appartement';
  if (/woonhuis|eengezinswoning|hoekwoning|tussenwoning/i.test(value)) return 'huis';
  return null;
}

/** Gruno's active extraction contract. See docs/sources/gruno.md. */
export function parseGruno(html: string, url: string, observedAt: string, tools: Tools): Listing {
  const $ = cheerio.load(html);
  const features = rows($, '#tabs-2 table.feautures tr'); // Source's real spelling.
  const summary = rows($, '.object_details .object_table_details tr');
  const externalId = features.get('referentienummer'), address = summary.get('adres');
  if (!externalId || !address) throw new Error('gruno: scoped identity/address missing or conflicting');
  const bio = $('#tabs-3 .description.textblock').first().clone();
  bio.find('script,style,noscript,form,button,h3').remove(); bio.find('br').replaceWith('\n'); bio.find('p,li').append('\n\n');
  const description = tools.redact(bio.text().replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim()) || 'Beschrijving niet vermeld door de bron.';
  const amount = (value: string | null): number | null => {
    const raw = value?.match(/(?:€|EUR)\s*(\d[\d.\u00a0 ]*(?:,\d{1,2})?)/i)?.[1];
    const n = raw ? tools.numberNL(raw.replace(/\s/g,'')) : null;
    return n === null ? null : Math.round(n * 100);
  };
  const priceRows = features.all('huurprijs');
  const heroPrices = [...new Set($('.object_details .object_price').map((_,el) => clean($(el).text())).get())];
  const rowAmount = amount(features.get('huurprijs'));
  const heroAmounts = [...new Set(heroPrices.map(value => amount(value)).filter((n): n is number => n !== null))];
  const headlineConflict = features.conflict('huurprijs') || heroAmounts.length > 1 || (rowAmount !== null && heroAmounts.length === 1 && rowAmount !== heroAmounts[0]);
  const headline = headlineConflict ? null : rowAmount ?? heroAmounts[0] ?? null;
  const headlineText = [...new Set([...priceRows, ...heroPrices])].join(' | ') || null;
  const serviceAggregate = amount(features.get('servicekosten'));
  const financial = section(description,/^(?:huurprijs|huurprijzen|huur en borg|huursom|huurkosten)/i) || description.split('\n').filter(line => /^(?:de\s+)?(?:(?:totale|kale|netto)\s+)?huur(?:prijs|prijzen)?\b/i.test(line.trim())).join('\n');
  const clauses = financial.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ž])/u).map(clean).filter(Boolean);
  const rentClauses = clauses.filter(line => /^(?:de\s+)?(?:(?:totale|kale|netto)\s+)?huur(?:prijs|prijzen)?\b/i.test(line) && amount(line) !== null);
  const baseClauses = rentClauses.filter(line => /^(?:de\s+)?(?:kale|netto)\s+huur/i.test(line));
  const baseValues = new Set<number>();
  for (const label of ['kale huurprijs','kale huur','netto huurprijs']) { const value = amount(features.get(label)); if (value !== null) baseValues.add(value); }
  baseClauses.forEach(line => baseValues.add(amount(line)!));
  const base = baseValues.size === 1 ? [...baseValues][0] : null;
  const included = rentClauses.filter(line => !baseClauses.includes(line) && /\bincl(?:usief|\.)?\b[\s\S]*(?:voorschot|servicekosten)/i.test(line));
  const statedTotals = rentClauses.filter(line => /^(?:de\s+)?totale\s+huur/i.test(line));
  const candidates = [...new Set([...included,...statedTotals].map(line => amount(line)!))];
  const coverage = tools.parseCoverage(...priceRows, financial);
  const notes: string[] = [];
  let financialConflict = headlineConflict || features.conflict('servicekosten') || baseValues.size > 1 || ['kale huurprijs','kale huur','netto huurprijs'].some(label => features.conflict(label));
  if (headlineConflict) notes.push('Geadverteerde bedragen in kenmerken/samenvatting zijn tegenstrijdig; geen bedrag gekozen.');
  const genericQuotes = rentClauses.filter(line => !baseClauses.includes(line));
  if (headline !== null && genericQuotes.some(line => amount(line) !== headline)) { financialConflict = true; notes.push('De beschrijving noemt een ander huurbedrag dan de advertentiekop.'); }
  for (const line of included) {
    const advanceText = line.match(/(?:voorschot|servicekosten)\s*(?:van\s*)?((?:€|EUR)\s*\d[\d., -]*)/i)?.[1];
    const advance = amount(advanceText ?? null);
    if (advance !== null && serviceAggregate !== null && advance !== serviceAggregate) { financialConflict = true; notes.push('Voorschot in beschrijving en servicekostenrij verschillen.'); }
  }
  if (Object.values(coverage).includes('conflict')) { financialConflict = true; notes.push('Inbegrepen/uitgesloten kosten zijn tegenstrijdig vermeld.'); }
  const monthlyPeriod = /per maand|\/mnd|p\/m|per mnd/i.test(`${headlineText ?? ''} ${financial}`);
  let knownMonthly: number | null = null, comparison: string | null = null;
  if (!financialConflict && monthlyPeriod && candidates.length === 1) {
    knownMonthly = candidates[0]; comparison = included.length ? 'headline-includes-advance' : 'stated-total';
    notes.push('Genoemd voorschot zit al in het bevestigde maandbedrag; niet nogmaals opgeteld.');
  } else if (!financialConflict && monthlyPeriod && base !== null && serviceAggregate !== null) {
    knownMonthly = base + serviceAggregate; comparison = 'base+aggregate';
    notes.push('Expliciete kale huur plus één service-totaal.');
  }
  if (candidates.length > 1) { knownMonthly = null; comparison = null; notes.push('Meerdere verschillende maandtotalen; geen totaal gekozen.'); }
  if (base === null) notes.push('Kale huur niet afzonderlijk bevestigd; niet afgeleid door een voorschot af te trekken.');
  if (knownMonthly === null) notes.push('Alleen geadverteerde huurprijs beschikbaar; kostenbasis niet bevestigd.');
  const names = { gas: 'gas', water: 'water', electricity: 'elektriciteit', internet: 'internet' };
  const states = { included: 'inbegrepen', excluded: 'niet inbegrepen', unknown: 'onbekend', conflict: 'tegenstrijdig' };
  notes.push(`Dekking: ${(Object.keys(names) as (keyof Coverage)[]).map(key => `${names[key]} ${states[coverage[key]]}`).join('; ')}.`);
  notes.push('Geen volledig all-in bedrag; overige kosten kunnen ontbreken.');
  const gwe = (['gas','water','electricity'] as const).map(key => coverage[key]);
  const utilities = gwe.every(value => value === 'included') ? 'G/W/E volgens bron inbegrepen' : gwe.every(value => value === 'excluded') ? 'G/W/E niet inbegrepen' : 'Dekking G/W/E niet volledig bevestigd; zie kosten';
  const rent: Rent = { base, headline, headlineText, headlineConflict, serviceAggregate, service: null, energy: null, knownMonthly, comparison, coverage, utilities, complete: false, note: notes.join(' ') };
  const status = features.get('status') || clean($('.object_header .object_status').first().text());
  const counter = /\b(?:al|reeds|inmiddels)\s+verhuurd|niet (?:meer )?beschikbaar|voorbeeldwoning|already rented/i.test(description);
  const unavailable = counter || [status,...features.all('status')].some(value=>/\bverhuurd\b|onder (?:optie|voorbehoud)|niet beschikbaar/i.test(value));
  const available = unavailable ? false : features.conflict('status') ? null : /nieuw in verhuur|beschikbaar|te huur/i.test(status) ? true : null;
  const location = section(description,/^locatie/i);
  const neighbourhood = features.conflict('wijk') || features.conflict('buurt') ? null : features.get('wijk') || features.get('buurt') || location.match(/(?:buurt|wijk)\s*:\s*([A-ZÀ-Ž][\p{L}\p{M} -]+)/u)?.[1] || location.match(/(?:gelegen in|in) de (?:leuke |populaire |rustige |gewilde )?(?:buurt |wijk )?([A-ZÀ-Ž][\p{L}\p{M}-]*(?:buurt|wijk))\b/u)?.[1] || null;
  const acceptance = features.all('aanvaarding').join(' / ') || null;
  const availability = section(description,/^(?:beschikbaarheid|huurperiode)/i) || description;
  const dateWords = /\b(?:per|vanaf)\s+(\d{1,2}-\d{1,2}-\d{4}|\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}|direct)/gi;
  const dates = [...new Set([...availability.matchAll(dateWords)].map(match => match[1]))];
  const isoDates = [...new Set(dates.map(tools.calendarDate).filter((value): value is string => value !== null))];
  const acceptedDate = features.conflict('aanvaarding') ? null : tools.calendarDate(acceptance);
  const dateConflict = features.conflict('aanvaarding') || isoDates.length > 1 || (acceptedDate !== null && isoDates.length === 1 && acceptedDate !== isoDates[0]);
  const moveIn = dates.length ? `${dates.join(' / ')}${acceptance && !dates.includes(acceptance) ? ` (aanvaarding: ${acceptance})` : ''}${dateConflict ? '; meerdere brondata, niet eenduidig' : ''}` : acceptance || null;
  const moveInDate = dateConflict ? null : isoDates[0] ?? acceptedDate;
  const photosFrom = (selector: string, attr: string) => $(selector).map((_,el) => $(el).attr(attr) || '').get().filter(value => /^https:\/\//.test(value));
  const headerPhotos = photosFrom('.object_header .object_image[data-original]','data-original');
  const photos = [...new Set(headerPhotos.length ? headerPhotos : photosFrom('#object-photos a[href]','href').filter(value => /\.(jpe?g|png|webp|avif)(?:$|[?#])/i.test(value)))];
  const bedroomText = features.get('aantal slaapkamers') || features.get('aantal kamers')?.match(/waarvan\s+(\d+)\s+slaapkamer/i)?.[1] || '';
  const landlord = features.get('verhuurder');
  const income = description.match(/(?:minimum|minimaal|minimale)\s+(?:bruto\s+)?(?:maand)?inkomen[^€\n]{0,25}€\s*([\d.,]+)/i);
  return { key: `gruno:${externalId}`, source: 'gruno', externalId, url: url.split('?')[0], title: address.split(',')[0],
    city: /\bGroningen\b/i.test(address) ? 'Groningen' : null,
    addressEvidence: sourceAddress(address,/\bGroningen\b/i.test(address) ? 'Groningen' : null),
    type: features.conflict('type object') ? null : housing(features.get('type object') || `${$('.object_details h1.object_title').text()} ${description.slice(0,200)}`),
    area: tools.numberNL(features.get('woonoppervlakte') || ''), bedrooms: tools.numberNL(bedroomText),
    neighbourhood, advertiser: 'Gruno Verhuur', landlord: landlord && tools.redact(landlord) === landlord ? landlord : null, location: parseGrunoLocation(html),
    moveIn, moveInDate, available, description, photos, rent, incomeMin: income ? amount(`€${income[1]}`) : null, observedAt };
}
