import type { Listing } from './model';

const usablePrice = (amount: number | null) => amount !== null && Number.isSafeInteger(amount) && amount > 0;

/** Deliberately limited to labelled Dutch rent quotes, not general financial prose. */
function descriptionPrice(description: string) {
  const quotes: { amount: number; label: string }[] = [];
  const number = '(?:\\d{1,3}(?:[. ]\\d{3})+(?:,\\d{2}|,-)?|\\d+(?:[,.]\\d{2}|,-)?)';
  const quote = new RegExp(`^\\s*(?:de\\s+)?(?:(kale|totale)\\s+)?(?:huurprijs|huur(?:\\s+per\\s+maand)?)(?:\\s+per\\s+maand)?\\s*(?:(?:is|bedraagt)\\s*)?:?\\s*(?:€\\s*(${number})|EUR\\s+(${number})|(${number})\\s+euro\\b)(?![\\d,.])`, 'i');
  // Do not split Dutch decimals/thousands; preserve line boundaries from stored text.
  for (const clause of description.replace(/\u00a0/g, ' ').split(/[;\n]|[.!?](?=\s|$)/)) {
    if (!/\bhuur(?:prijs)?\b/i.test(clause) || !/€|\bEUR\b|\beuro\b/i.test(clause)) continue;
    // One ambiguous rent-bearing clause makes the whole description unsafe.
    if (/\b(borg|waarborgsom|inkomen|inkomenseis|salaris|vanaf|tussen|tot|circa|ongeveer|minimaal|maximaal)\b|\bv\.a\.|\d\s*[-–/]\s*\d/i.test(clause)) return null;
    const match = quote.exec(clause);
    if (!match || (clause.match(/€|\bEUR\b|\beuro\b/gi) || []).length !== 1) return null;
    const tail = clause.slice(match.index + match[0].length);
    if (/\d|\bper\s+(?!maand\b)\w+|\/\s*(?!mnd\b|maand\b)\S/i.test(tail)) return null;
    const raw = match[2] || match[3] || match[4];
    const normalized = raw.replace(/ /g, '').replace(/,-$/, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
    const amount = Math.round(Number(normalized) * 100);
    if (!usablePrice(amount)) return null;
    const label = match[1]?.toLowerCase() === 'kale' ? 'Geadverteerde kale huurprijs' : match[1]?.toLowerCase() === 'totale' ? 'Geadverteerde totale huurprijs' : 'Geadverteerde huurprijs';
    quotes.push({ amount, label });
  }
  if (!quotes.length || quotes.some(q => q.amount !== quotes[0].amount || q.label !== quotes[0].label)) return null;
  return quotes[0];
}

/** Presentation only. Matching continues to read rent.base / rent.knownMonthly. */
export function priceDisplay(listing: Listing) {
  if (listing.rent.knownMonthly !== null) return { amount: listing.rent.knownMonthly, label: 'bekend per maand', caveat: 'geen all-in garantie', advertisedFallback: false };
  if (!listing.rent.headlineConflict) {
    if (usablePrice(listing.rent.headline)) return { amount: listing.rent.headline, label: 'Geadverteerde huurprijs', caveat: 'kostenbasis niet bevestigd', advertisedFallback: true };
    if (listing.source === 'solide' || listing.source === 'maxx') {
      const quote = descriptionPrice(listing.description);
      if (quote) return { ...quote, caveat: 'kostenbasis niet bevestigd; controleer omschrijving', advertisedFallback: true };
    }
  }
  return { amount: null, label: 'bekend per maand', caveat: 'geen all-in garantie', advertisedFallback: false };
}
