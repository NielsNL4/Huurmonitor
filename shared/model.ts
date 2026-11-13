export type Source = 'gruno' | 'solide' | 'maxx';
export type Housing = 'kamer' | 'studio' | 'appartement' | 'huis';
export type Coverage = Record<'gas' | 'water' | 'electricity' | 'internet', 'included' | 'excluded' | 'unknown' | 'conflict'>;
export interface SourceLocation {
  lat: number; lon: number;
  provenance: 'source'; precision: 'unknown'; // Published point, not a verified doorway.
}
export interface AddressEvidence {
  basis: 'source-markup' | 'source-title';
  street: string; houseNumber: number; letter: string; addition: string;
  city: string; postcode?: string;
  lookupMode?: 'house-number-v1' | 'house-number-v2';
  cityBasis?: 'source' | 'user-scope';
  exactComponents?: boolean;
  sourceBinding?: {source: Source; title: string; city: string | null; evidence: AddressEvidence | null};
}
export interface GeocodedLocation {
  lat: number; lon: number; provenance: 'pdok-bag'; precision: 'address';
  inputKey: string; bagId: string;
}
export interface HouseNumberLocation {
  lat: number; lon: number; provenance: 'pdok-bag'; precision: 'house-number';
  inputKey: string; candidateIds: {bagId: string; objectId: string}[];
}
export type EffectiveLocation = SourceLocation | GeocodedLocation | HouseNumberLocation;
export interface GeocodingResult {
  provider: 'pdok-bag'; inputKey: string;
  status: 'matched' | 'no-match' | 'ambiguous' | 'incomplete' | 'invalid-response' | 'error';
  bagId: string | null; objectId: string | null; point: {lat: number; lon: number} | null;
  retrievedAt: string; lastAttemptAt: string; lastAttemptStatus: 'ok' | 'error';
  precision?: 'house-number';
  candidateIds?: {bagId: string; objectId: string}[];
  resolution?: 'representative';
}
export interface OfficialGeography {
  provider: 'pdok-cbs'; year: 2026; version: '0';
  input: EffectiveLocation;
  retrievedAt: string; lastAttemptAt: string; lastAttemptStatus: 'ok' | 'error';
  status: 'known' | 'no-match' | 'ambiguous' | 'water' | 'invalid-response' | 'error';
  buurt: { code: string; name: string } | null;
  wijk: { code: string; name: string } | null;
  municipality: { code: string; name: string } | null;
}
export interface Rent {
  base: number | null; // cents, never inferred from a rounded card price
  headline: number | null;
  headlineText?: string | null; // Gruno: scoped advertised amount/qualifiers, separate from derived costs
  headlineConflict?: boolean;
  serviceAggregate: number | null;
  service: number | null;
  energy: number | null;
  knownMonthly: number | null;
  comparison: string | null; // calculation basis; component coverage below must also agree
  coverage?: Coverage; // absent legacy or uncertain coverage cannot establish a comparable drop
  utilities: string;
  complete: boolean;
  note: string;
}
export interface Listing {
  key: string; source: Source; externalId: string; url: string; title: string;
  city: string | null; type: Housing | null; area: number | null; bedrooms: number | null;
  neighbourhood?: string | null; advertiser?: string; landlord?: string | null;
  location?: SourceLocation | null; // Source provenance is never replaced by geocoding.
  addressEvidence?: AddressEvidence | null;
  geocoding?: GeocodingResult | null;
  officialGeography?: OfficialGeography | null; // Separate CBS polygon classification, not source wording or a matching criterion.
  moveInDate?: string | null; // ISO calendar date only when explicit and unambiguous; moveIn retains wording
  moveIn: string | null; available: boolean | null; description: string; photos: string[];
  rent: Rent; incomeMin: number | null; observedAt: string;
}
export interface Profile {
  city: string; minBudget: number | null; maxBudget: number | null; basis: 'base' | 'knownMonthly';
  minArea: number | null; minBedrooms: number | null; types: Housing[];
  income: number | null; checkIncome: boolean; includeUnknown: boolean; emailEnabled: boolean;
}
export const neutralProfile: Profile = { city: 'Groningen', minBudget: null, maxBudget: null, basis: 'knownMonthly', minArea: null, minBedrooms: null, types: [], income: null, checkIncome: false, includeUnknown: false, emailEnabled: false };
export type Verdict = 'pass' | 'fail' | 'unknown';
export interface Evaluation { verdict: Verdict; eligible: boolean; criteria: { label: string; verdict: Verdict }[] }
export type Decision = 'new' | 'favourite' | 'dismissed';
export interface Home {
  listing: Listing; evaluation: Evaluation; decision: Decision; revision: number;
  reason: string; dismissal: { listing: Listing; evaluation: Evaluation | null; profile?: Profile; at: string } | null;
  // SQL captures stored facts + the locked current profile, never a client evaluation.
  decisionContext?: { listing: Listing; profile: Profile } | null;
}
export interface Event { id: string; key: string; revision: number; reason: string; listing: Listing }
export interface ScanStats {
  inventoryPages: number; detailsDiscovered: number; detailsRead: number; parseFailures: number; excluded: number;
  available: number; unavailable: number; unknown: number;
  unknownNeighbourhood: number; unknownLandlord: number; unknownType: number; unknownMoveIn: number;
}
export interface SourceRun { source: Source; status: 'ok' | 'failed' | 'disabled'; at: string; message: string; count: number; coverage?: 'complete' | 'partial' | 'blocked'; stats?: ScanStats }
export function money(cents: number | null) { return cents === null ? 'Onbekend' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(cents / 100); }
