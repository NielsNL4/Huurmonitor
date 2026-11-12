import type { Listing } from './model';
/** Presentation only. Matching continues to read rent.base / rent.knownMonthly. */
export function priceDisplay(listing: Listing) {
  if (listing.rent.knownMonthly !== null) return { amount: listing.rent.knownMonthly, label: 'bekend per maand', caveat: 'geen all-in garantie', advertisedFallback: false };
  if (listing.source === 'gruno' && listing.rent.headline !== null && !listing.rent.headlineConflict) return { amount: listing.rent.headline, label: 'Geadverteerde huurprijs', caveat: 'kostenbasis niet bevestigd', advertisedFallback: true };
  return { amount: null, label: 'bekend per maand', caveat: 'geen all-in garantie', advertisedFallback: false };
}
