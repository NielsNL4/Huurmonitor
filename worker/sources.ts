import type { Listing, ScanStats, Source, SourceRun } from '../shared/model';
import { parseListing, sourceUrls } from './parsers';
import { detailUrl, inventoryUrl, pageKey, parseInventory } from './inventory';
import { publicReader, ReadFailure, robotsPolicy, type Reader } from './http';
export function allowedSources(value = ''): Source[] {
  const values = value.split(',').map(s => s.trim()).filter(Boolean);
  if (values.some(s => !['gruno', 'solide', 'maxx'].includes(s))) throw new Error('SOURCE_ALLOWLIST contains an unknown source');
  return [...new Set(values)] as Source[];
}
interface Options { full?: boolean; read?: Reader; maxPages?: number; maxDetails?: number; pause?: (ms: number) => Promise<void> }
export async function ingest(allowlist: Source[], at: string, options: Options = {}): Promise<{ listings: Listing[]; runs: SourceRun[] }> {
  const listings: Listing[] = [], runs: SourceRun[] = [], read = options.read ?? publicReader();
  const maxPages = options.maxPages ?? (options.full ? 30 : 1), maxDetails = options.maxDetails ?? (options.full ? 300 : 12);
  const pause = options.pause ?? (ms => new Promise(resolve=>setTimeout(resolve,ms)));
  for (const source of Object.keys(sourceUrls) as Source[]) {
    if (!allowlist.includes(source)) { runs.push({ source, status: 'disabled', at, count: 0, message: 'Uitgeschakeld; allowlist en toegangsbeoordeling vereist' }); continue; }
    const stats: ScanStats = { inventoryPages: 0, detailsDiscovered: 0, detailsRead: 0, parseFailures: 0, excluded: 0, available: 0, unavailable: 0, unknown: 0, unknownNeighbourhood: 0, unknownLandlord: 0, unknownType: 0, unknownMoveIn: 0 };
    const batch = new Map<string,Listing>(), issues = new Set<string>(); let blocked = false;
    const noteFailure = (error: unknown, stage: string) => {
      if (error instanceof ReadFailure) { if (error.kind === 'blocked' || error.kind === 'robots') blocked = true; issues.add(`${stage}: ${error.status ? `HTTP ${error.status}` : error.kind}`); }
      else issues.add(`${stage}: structuur niet herkend`);
    };
    try {
      let robots = '';
      try { robots = await read(new URL('/robots.txt',sourceUrls[source]).href); }
      catch(error) { if (!(error instanceof ReadFailure && error.status === 404)) throw error; }
      if (/<html/i.test(robots)) throw new ReadFailure('robots');
      const policy = robotsPolicy(robots);
      const permittedRead = async (url: string) => { if (!policy.allowed(url)) throw new ReadFailure('robots'); await pause(policy.delay); return read(url); };
      const queue = [sourceUrls[source]], queued = new Set(queue.map(url=>pageKey(source,url))), seen = new Set<string>(), fingerprints = new Set<string>(), details = new Set<string>(), entries = new Set<string>();
      let advertisedTotal: number | null = null;
      while (queue.length && stats.inventoryPages < maxPages) {
        const url = queue.shift()!, key = pageKey(source,url); if (seen.has(key)) continue;
        seen.add(key);
        try {
          if (!inventoryUrl(source,url)) throw new Error('Invalid inventory route');
          const page = parseInventory(source,await permittedRead(url),url); stats.inventoryPages++; stats.excluded += page.excluded;
          if (page.advertisedTotal !== null) advertisedTotal=page.advertisedTotal;
          page.entries.forEach(entry=>entries.add(entry));
          const fingerprint = [...page.details].sort().join('|');
          if (fingerprint && fingerprints.has(fingerprint)) { issues.add('Herhaalde aanbodpagina; paginering niet betrouwbaar'); break; }
          if (fingerprint) fingerprints.add(fingerprint);
          for (const detail of page.details) details.add(detail);
          if (page.malformed) issues.add('Niet alle aanbodkaarten herkend');
          if (page.unsupportedPagination) issues.add('Niet-ondersteunde pagineringslink; niet gevolgd');
          if (page.next && seen.has(pageKey(source,page.next))) issues.add('Circulaire volgende-paginalink');
          for (const next of page.pages) { const nextKey=pageKey(source,next); if (!queued.has(nextKey)) { queued.add(nextKey); queue.push(next); } }
        } catch(error) { noteFailure(error,'Aanbodpagina'); break; }
      }
      stats.detailsDiscovered=details.size;
      if (advertisedTotal !== null && entries.size < advertisedTotal) issues.add('Minder unieke kaarten dan het gepubliceerde aanbodtotaal; dekking onzeker');
      if (queue.length) issues.add(`Paginering niet voltooid (veiligheidslimiet ${maxPages} of leesfout)`);
      if (details.size>maxDetails) issues.add(`Detaillimiet ${maxDetails} bereikt`);
      if (!options.full) issues.add('Begrensde modus; geen volledige inventaris');
      if (!blocked) for (const url of [...details].slice(0,maxDetails)) {
        try {
          if (!detailUrl(source,url)) throw new Error('Invalid detail route');
          const html=await permittedRead(url); stats.detailsRead++;
          const listing=parseListing(source,html,url,at);
          if (listing.city && listing.city.toLowerCase()!=='groningen') { stats.excluded++; continue; }
          batch.set(listing.key,listing); // Stable external IDs dedup aliases too.
        } catch(error) {
          if (!(error instanceof ReadFailure)) stats.parseFailures++;
          noteFailure(error,'Advertentie'); if (blocked) break;
        }
      }
    } catch(error) { noteFailure(error,'Robots/toegang'); }
    const usable=[...batch.values()]; listings.push(...usable);
    for (const listing of usable) {
      if (listing.available === true) stats.available++; else if (listing.available === false) stats.unavailable++; else stats.unknown++;
      if (!listing.neighbourhood) stats.unknownNeighbourhood++;
      if (!listing.landlord) stats.unknownLandlord++;
      if (!listing.type) stats.unknownType++;
      if (!listing.moveIn) stats.unknownMoveIn++;
    }
    const coverage = blocked ? 'blocked' : issues.size ? 'partial' : 'complete';
    const message = `${coverage === 'complete' ? 'Volledig gelezen' : coverage === 'blocked' ? 'Geblokkeerd; niet volledig' : 'Deels gelezen; niet volledig'}: ${stats.inventoryPages} aanbodpagina’s, ${stats.detailsDiscovered} unieke woonadvertenties gevonden, ${stats.detailsRead} details gelezen, ${usable.length} bruikbaar. ${[...issues].join('; ')} Onbekend: wijk ${stats.unknownNeighbourhood}, verhuurder ${stats.unknownLandlord}, type ${stats.unknownType}, ingangsdatum ${stats.unknownMoveIn}. Eerdere niet-gelezen woningen blijven bewaard; verdwijnen bewijst geen onbeschikbaarheid.`;
    runs.push({ source, status: coverage === 'complete' ? 'ok' : 'failed', coverage, at, count: usable.length, message, stats });
  }
  return { listings, runs };
}
