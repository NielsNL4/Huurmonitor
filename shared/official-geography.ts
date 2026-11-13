import type { EffectiveLocation, Listing, OfficialGeography, SourceLocation } from './model';
import { effectiveLocation, validCoordinates, validEffectivePoint } from './location';
import { canonicalAddressKey } from './address';

export const cbsYear = 2026;
export const cbsVersion = '0';
export const cbsDocumentation = 'https://www.pdok.nl/ogc-apis/-/article/cbs-wijken-en-buurten';
export const cbsLicence = 'https://creativecommons.org/licenses/by/4.0/';
export const cbsAttribution = 'CBS Wijk- en Buurtkaart 2026, via PDOK — CC BY 4.0; bepaald uit broncoördinaten';
export function cbsAttributionFor(listing: Listing) {
  if (effectiveLocation(listing)?.precision === 'house-number') return listing.addressEvidence?.lookupMode === 'house-number-v2' ? 'CBS Wijk- en Buurtkaart 2026, via PDOK — CC BY 4.0; benaderde locatie op huisnummerniveau; geen exacte woninglocatie' : 'CBS Wijk- en Buurtkaart 2026, via PDOK — CC BY 4.0; locatie op huisnummerniveau; toevoeging niet bepaald';
  return effectiveLocation(listing)?.provenance === 'pdok-bag'
    ? 'CBS Wijk- en Buurtkaart 2026, via PDOK — CC BY 4.0; bepaald uit PDOK/BAG-adreslocatie'
    : cbsAttribution;
}

export function sourcePoint(location?: SourceLocation | null): SourceLocation | null {
  return location?.provenance === 'source' && location.precision === 'unknown' && validCoordinates(location.lat,location.lon) ? location : null;
}
export function geographyKey(point?: EffectiveLocation | null) {
  if (!validEffectivePoint(point)) return null;
  const inputKey = point.provenance === 'source' ? null : canonicalAddressKey(point.inputKey);
  if (point.provenance !== 'source' && !inputKey) return null;
  const identity = point.provenance === 'source' ? '' : point.precision === 'house-number' ? `:pdok-bag:house-number:${inputKey}:${JSON.stringify(point.candidateIds.map(({bagId,objectId})=>[bagId,objectId]))}` : `:pdok-bag:${inputKey}:${point.bagId}`;
  return `${cbsYear}:${cbsVersion}:${point.lon},${point.lat}${identity}`;
}
export function validOfficialNames(value: OfficialGeography) {
  const {buurt, wijk, municipality} = value;
  const name = (v: unknown) => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 200 && !/[\u0000-\u001f<>]/.test(v);
  return !!buurt && !!wijk && !!municipality && /^BU\d{8}$/.test(buurt.code) && /^WK\d{6}$/.test(wijk.code) && /^GM\d{4}$/.test(municipality.code)
    && buurt.code.slice(2,8) === wijk.code.slice(2) && wijk.code.slice(2,6) === municipality.code.slice(2)
    && name(buurt.name) && name(wijk.name) && name(municipality.name);
}
/** Never show a cached district against a changed/absent source point or dataset. */
export function currentOfficialGeography(listing: Pick<Listing,'location' | 'officialGeography' | 'geocoding' | 'title' | 'city' | 'addressEvidence'>): OfficialGeography | null {
  const value = listing.officialGeography;
  const key = geographyKey(effectiveLocation(listing));
  if (!value || value.provider !== 'pdok-cbs' || value.year !== cbsYear || value.version !== cbsVersion || !key || geographyKey(value.input) !== key) return null;
  if (value.status === 'known' && !validOfficialNames(value)) return null;
  return value;
}
