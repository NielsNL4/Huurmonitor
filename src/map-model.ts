import type { Home, Listing, Profile } from '../shared/model';
import { evaluate } from '../shared/matcher';
import { effectiveLocation } from '../shared/location';
import type { FeatureCollection, Point } from 'geojson';

export interface MapCamera { center: [number,number]; zoom: number; bearing: number; pitch: number }
export interface MapSession {
  selectedKey: string | null; camera: MapCamera | null; mode: 'map' | 'list';
  listScroll: number; detailKey: string | null;
}
export const newMapSession = (): MapSession => ({selectedKey:null,camera:null,mode:'map',listScroll:0,detailKey:null});
export const openMapDetail = (state: MapSession,key: string): MapSession => ({...state,selectedKey:key,detailKey:key});
export const closeMapDetail = (state: MapSession): MapSession => ({...state,detailKey:null});
export function mapCollection(homes: Home[], profile: Profile) {
  return homes.map(home=>({...home,evaluation:evaluate(home.listing,profile)})).filter(home=>home.decision === 'favourite' || (home.decision === 'new' && home.evaluation.eligible));
}
export function mapStatus(home: Home, demo: boolean) {
  return [home.decision === 'favourite' ? 'Favoriet' : 'Nieuwe match',
    home.listing.available === false ? 'Niet beschikbaar' : home.listing.available === null ? 'Beschikbaarheid onbekend' : demo ? 'Beschikbaar in voorbeeld' : 'Beschikbaar bij laatste check',
    home.evaluation.eligible ? home.evaluation.verdict === 'unknown' ? 'Match met onbekende gegevens' : 'Past bij profiel' : 'Past nu niet bij profiel'].join(' · ');
}
/** No addresses/profile facts in tile requests or feature properties. Local IDs
 * link back to React content, rather than interpolating advertisement HTML. */
export function mapFeatures(homes: Home[]): FeatureCollection<Point> {
  return {type:'FeatureCollection',features:homes.flatMap(home=>{
    const point=effectiveLocation(home.listing);
    return point ? [{type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[point.lon,point.lat]},properties:{key:home.listing.key,favourite:home.decision==='favourite'}}] : [];
  })};
}
/** The detail canvas can only receive its current listing's validated point. */
export function propertyMapFeatures(listing: Listing): FeatureCollection<Point> {
  const point=effectiveLocation(listing);
  return {type:'FeatureCollection',features:point ? [{type:'Feature',geometry:{type:'Point',coordinates:[point.lon,point.lat]},properties:{key:listing.key}}] : []};
}
export function samePointGroups(homes: Home[]) {
  const groups=new Map<string,string[]>();
  for (const feature of mapFeatures(homes).features) {
    const key=feature.geometry.coordinates.join(',');
    groups.set(key,[...(groups.get(key) ?? []),feature.properties!.key as string]);
  }
  return [...groups.values()];
}
export function cartoStyleUrl(key: unknown, theme: 'light' | 'dark' = 'dark'): string | null {
  // Public browser key, never a URL or arbitrary provider endpoint.
  if (typeof key !== 'string' || !/^[A-Za-z0-9_.-]{8,2048}$/.test(key)) return null;
  return `https://basemaps.cartocdn.com/gl/${theme === 'light' ? 'positron-gl-style' : 'dark-matter-gl-style'}/style.json?key=${encodeURIComponent(key)}`;
}
