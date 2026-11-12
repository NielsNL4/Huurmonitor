import * as cheerio from 'cheerio';
import type { Source } from '../shared/model';
import { sourceUrls } from './parsers';

export function inventoryUrl(source: Source, value: string, current = sourceUrls[source]): string | null {
  try {
    const url = new URL(value, current), base = new URL(sourceUrls[source]);
    if (url.origin !== base.origin || url.username || url.password || url.hash || /%city%/i.test(decodeURI(url.pathname))) return null;
    if (source === 'gruno') {
      if (url.pathname.replace(/\/$/, '') !== base.pathname || [...url.searchParams.keys()].some(k => !['skip','moveunavailablelistingstothebottom'].includes(k))) return null;
      if (url.searchParams.has('skip') && !/^\d+$/.test(url.searchParams.get('skip')!)) return null;
    } else if (source === 'solide') {
      if (!/^\/huurwoningen\/(?:page\/[1-9]\d*\/)?$/.test(url.pathname) || url.search) return null;
    } else if (!/^\/woning-huren\/groningen\/(?:page\/[1-9]\d*\/)?$/.test(url.pathname) || [...url.searchParams.keys()].some(k => k !== 'page') || (url.searchParams.has('page') && !/^[1-9]\d*$/.test(url.searchParams.get('page')!))) return null;
    url.hash = ''; url.searchParams.sort(); return url.href;
  } catch { return null; }
}
export function pageKey(source: Source, value: string) {
  const url = new URL(value);
  if (source === 'gruno') { url.searchParams.delete('moveunavailablelistingstothebottom'); if (url.searchParams.get('skip') === '0') url.searchParams.delete('skip'); }
  return url.href;
}
export function detailUrl(source: Source, value: string, current = sourceUrls[source]): string | null {
  try {
    const u = new URL(value, current);
    if (u.origin !== new URL(sourceUrls[source]).origin || u.username || u.password) return null;
    const valid = source === 'gruno' ? /^\/woningaanbod\/huur\/groningen\/[^/]+\/[^/]+\/?$/.test(u.pathname) : source === 'solide' ? /^\/huurwoningen\/groningen\/[^/]+\/$/.test(u.pathname) : /^\/objects\/ads\/view\/id-\d+\/$/.test(u.pathname);
    if (!valid) return null;
    u.search = ''; u.hash = ''; return u.href;
  } catch { return null; }
}
export function parseInventory(source: Source, html: string, current: string) {
  const $ = cheerio.load(html);
  const cards = $(source === 'gruno' ? 'article.objectcontainer' : source === 'solide' ? '.search-result' : 'a.object[href*="/objects/ads/view/id-"]');
  const recognized = cards.length > 0 || $(source === 'gruno' ? '#object-search-results' : source === 'solide' ? '#nav-pagination' : '#filter-results-container').length > 0;
  if (!recognized) throw new Error('Inventory structure unrecognized');
  const details = new Set<string>(), entries = new Set<string>(); let excluded = 0, malformed = 0;
  cards.each((_, card) => {
    const el = $(card);
    const raw = source === 'maxx' ? el.attr('href') : el.find(source === 'gruno' ? 'a.sys-property-link' : 'a[href*="/huurwoningen/"]').first().attr('href');
    if (raw) { try { const entry=new URL(raw,current); entry.search=''; entry.hash=''; entries.add(entry.href); } catch { /* Marked malformed below. */ } }
    const url = raw ? detailUrl(source, raw, current) : null;
    if (raw && !url && source === 'solide' && /\/huurwoningen\/[^/]+\/[^/]+\//.test(raw)) { excluded++; return; }
    const type = source === 'maxx' ? el.find('.type-woonruimte-object').text() : el.find('.obj_type').text();
    const city = source === 'maxx' ? el.find('.plaatsnaam-object').text().trim() : '';
    if (/garage|berging|parkeer|kantoor|bedrijfsruimte/i.test(type) || (city && city.toLowerCase() !== 'groningen')) { excluded++; return; }
    if (!url) { malformed++; return; } details.add(url);
  });
  // Solide's Yoast head rel=next contains a literal %city% placeholder; the real
  // #nav-pagination anchors are authoritative. Never crawl the placeholder.
  const paging = source === 'solide' ? $('#nav-pagination a[href]') : $('.pagination a[href], link[rel="next"]');
  const pages = new Set<string>(); let unsupportedPagination = false, next: string | null = null;
  paging.each((_, link) => {
    const raw = $(link).attr('href')!, url = inventoryUrl(source, raw, current);
    if (!url) { unsupportedPagination = true; return; }
    pages.add(url);
    if ($(link).attr('rel') === 'next' || $(link).hasClass('next-page') || /next page|volgende/i.test($(link).text())) next = url;
  });
  const totalText=$(source === 'gruno' ? '#TotalPropertyCount' : source === 'maxx' ? '.aantal-woonruimtes' : '.no-declared-total').first().text();
  const total=totalText.match(/\d+/)?.[0];
  return { details: [...details], entries: [...entries], advertisedTotal: total ? Number(total) : null, pages: [...pages], next, excluded, malformed, unsupportedPagination };
}
