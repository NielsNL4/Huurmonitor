import type { Listing } from './model';
import { priceDisplay } from './price-display';
import { currentOfficialGeography, cbsAttributionFor } from './official-geography';
import { currentAddress } from './address';
import { effectiveLocation } from './location';

/** Pure view of the canonical Listing, never a second persisted record or matcher input. */
export function listingPresentation(listing: Listing) {
  const official = currentOfficialGeography(listing);
  const known = official?.status === 'known';
  const district = known ? official.wijk!.name : null;
  const buurt = known ? official.buurt!.name : null;
  const advertLocation = listing.neighbourhood?.trim() || null;
  const locationFacts = [{label:known ? 'Wijk (CBS 2026)' : 'Wijk',value:district ?? 'Wijk nog niet bepaald'}];
  if (buurt) locationFacts.push({label:'Buurt (CBS 2026)',value:buurt});
  if (advertLocation) locationFacts.push({label:'Omgeving volgens advertentie',value:advertLocation});
  return {
    price:priceDisplay(listing),district,buurt,advertLocation,locationFacts,
    headerLocation:district ? `${district} (CBS 2026)` : advertLocation ? `Omgeving volgens advertentie: ${advertLocation}` : null,
    attribution:known ? cbsAttributionFor(listing) : null,
    refreshNote:known && official.lastAttemptStatus === 'error' ? 'Laatste hercontrole mislukt; eerdere bepaling behouden.' : null,
    address:currentAddress(listing),point:effectiveLocation(listing),
    locationCaveat:effectiveLocation(listing)?.precision === 'house-number' ? listing.addressEvidence?.lookupMode === 'house-number-v2' ? 'Benaderde locatie op huisnummerniveau; geen exacte woninglocatie.' : 'Locatie op huisnummerniveau; toevoeging niet bepaald' : null,
  };
}
