import type { EffectiveLocation, Listing, SourceLocation } from './model';
import { addressKey, canonicalAddressKey, currentAddress, validBagNumberId, validBagObjectId } from './address';

export function validCoordinates(lat: unknown, lon: unknown): lat is number {
  return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function validEffectivePoint(point?: EffectiveLocation | null): point is EffectiveLocation {
  return !!point && validCoordinates(point.lat,point.lon) && ((point.provenance === 'source' && point.precision === 'unknown') || (point.provenance === 'pdok-bag' && typeof point.inputKey === 'string' && point.inputKey.length > 0 && (point.precision === 'address' ? validBagNumberId(point.bagId) : point.precision === 'house-number' && validCandidateIds(point.candidateIds))));
}
export function validCandidateIds(value: unknown): value is {bagId:string;objectId:string}[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 50 && value.every(v=>v && validBagNumberId(v.bagId) && validBagObjectId(v.objectId)) && new Set(value.map(v=>`${v.bagId}:${v.objectId}`)).size === value.length;
}
export function effectiveLocation(listing: Pick<Listing,'location' | 'geocoding' | 'title' | 'city' | 'addressEvidence'> & Partial<Pick<Listing,'source'>>): EffectiveLocation | null {
  if (listing.location?.provenance === 'source' && validEffectivePoint(listing.location)) return listing.location;
  const value = listing.geocoding, key = addressKey(currentAddress(listing));
  if (!key || value?.provider !== 'pdok-bag' || value.status !== 'matched' || typeof value.inputKey !== 'string' || canonicalAddressKey(value.inputKey) !== key || !value.point || !validCoordinates(value.point.lat,value.point.lon)) return null;
  if (value.precision === 'house-number') return !!listing.addressEvidence?.lookupMode && (listing.addressEvidence.lookupMode !== 'house-number-v2' || (value.resolution === 'representative' && value.candidateIds?.length === 1)) && value.bagId === null && value.objectId === null && validCandidateIds(value.candidateIds) ? {...value.point,provenance:'pdok-bag',precision:'house-number',candidateIds:value.candidateIds,inputKey:key} : null;
  if (!validBagNumberId(value.bagId) || !validBagObjectId(value.objectId)) return null;
  return {...value.point,provenance:'pdok-bag',precision:'address',bagId:value.bagId,inputKey:key};
}

/** URLs contain the source point only: no address, profile or application state. */
export function mapLinks(location?: SourceLocation | null) {
  if (!location || location.provenance !== 'source' || location.precision !== 'unknown' || !validCoordinates(location.lat, location.lon)) return null;
  const { lat, lon } = location;
  const clamp = (n: number, bound: number) => Math.max(-bound, Math.min(bound, n));
  const west = clamp(lon - .008, 180), east = clamp(lon + .008, 180);
  const south = clamp(lat - .005, 90), north = clamp(lat + .005, 90);
  const format = (n: number) => Number(n.toFixed(6)).toString();
  const point = `${format(lat)},${format(lon)}`;
  return {
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${[west,south,east,north].map(format).join(',')}&layer=mapnik&marker=${point}`,
    larger: `https://www.openstreetmap.org/?mlat=${format(lat)}&mlon=${format(lon)}#map=16/${format(lat)}/${format(lon)}`,
  };
}
