import type { SourceLocation } from './model';

export function validCoordinates(lat: unknown, lon: unknown): lat is number {
  return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
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
