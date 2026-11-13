import type { Home } from '../shared/model';
import { listingPresentation } from '../shared/listing-presentation';

export type MobileView = 'new' | 'favourite' | 'dismissed' | 'map' | 'profile';
export type CollectionView = 'favourite' | 'dismissed';
export interface DossierSelection { key: string; origin: CollectionView; scrollTop: number }
export function openDossier(key: string, origin: CollectionView, scrollTop: number): DossierSelection {
  return { key, origin, scrollTop: Number.isFinite(scrollTop) ? Math.max(0,scrollTop) : 0 };
}
export function mobileScreenKey(view: MobileView, activeKey: string | undefined, dossier: DossierSelection | null) {
  return dossier ? `dossier:${dossier.key}` : view === 'new' ? `new:${activeKey ?? 'empty'}` : `view:${view}`;
}
export type ArchiveFilter = 'all' | 'budget' | 'area' | 'income';
export const archiveCriteria = { budget: /huur|maandlasten/i, area: /oppervlakte/i, income: /inkomen/i };
export function archiveMatches(home: Home, query: string, filter: ArchiveFilter) {
  const {district,buurt,advertLocation} = listingPresentation(home.listing);
  const text = [home.listing.title,district,buurt,advertLocation,home.listing.source,...home.evaluation.criteria.map(c=>c.label)].join(' ').toLocaleLowerCase('nl-NL');
  return text.includes(query.trim().toLocaleLowerCase('nl-NL')) && (filter === 'all' || home.evaluation.criteria.some(c=>c.verdict === 'fail' && archiveCriteria[filter].test(c.label)));
}
