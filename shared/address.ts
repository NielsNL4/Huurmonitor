import type { AddressEvidence, Listing } from './model';

export const normalizeAddressText = (value: string) => value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('nl-NL');
export const validBagNumberId = (value: unknown): value is string => typeof value === 'string' && value.length === 16 && /^\d{4}20\d{10}$/.test(value);
export const validBagObjectId = (value: unknown): value is string => typeof value === 'string' && value.length === 16 && /^\d{4}0[123]\d{10}$/.test(value);
const text = (value: unknown, max = 120): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && /^[\p{L}\p{M}\d .'’\-]+$/u.test(value);
// JSONB may reorder every object's keys, including nested source evidence.
// Arrays and all field values remain significant; only object order is ignored.
function stableIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableIdentity);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableIdentity((value as Record<string,unknown>)[key])]));
  return value;
}
export function canonicalAddressKey(key: string): string | null {
  try {
    const parts = JSON.parse(key);
    if (!Array.isArray(parts) || !['house-number-v1','house-number-v2'].includes(parts[0])) return key; // Legacy exact keys stay byte-for-byte unchanged.
    if (parts.length !== 10) return null;
    const candidate: AddressEvidence = {basis:'source-title',street:parts[1],houseNumber:parts[2],letter:parts[3],addition:parts[4],city:parts[5],...(parts[6] ? {postcode:parts[6]} : {}),lookupMode:parts[0],exactComponents:parts[7],cityBasis:parts[8],sourceBinding:parts[9]};
    const canonical = JSON.stringify(stableIdentity(parts));
    // Accept old object ordering only for a complete valid known-version key.
    // Reconstruction must preserve every field; no dropped or normalized input.
    return addressKey(candidate) === canonical ? canonical : null;
  } catch { return null; }
}
export function addressKey(value?: AddressEvidence | null): string | null {
  if (!value || !['source-title','source-markup'].includes(value.basis) || !text(value.street) || !text(value.city) || !Number.isSafeInteger(value.houseNumber) || value.houseNumber < 1 || value.houseNumber > 99999 || typeof value.letter !== 'string' || !/^[a-zA-Z]?$/.test(value.letter) || typeof value.addition !== 'string' || !/^[\p{L}\d]{0,10}$/u.test(value.addition) || (value.postcode !== undefined && !/^[1-9]\d{3}\s?[a-zA-Z]{2}$/.test(value.postcode))) return null;
  const parts = [normalizeAddressText(value.street),value.houseNumber,normalizeAddressText(value.letter),normalizeAddressText(value.addition),normalizeAddressText(value.city),value.postcode?.replace(/\s/g,'').toUpperCase() ?? ''];
  if (value.lookupMode !== undefined) {
    const b = value.sourceBinding;
    if (!['house-number-v1','house-number-v2'].includes(value.lookupMode) || typeof value.exactComponents !== 'boolean' || !['source','user-scope'].includes(value.cityBasis!) || !b || !['gruno','solide','maxx'].includes(b.source) || typeof b.title !== 'string' || (b.city !== null && typeof b.city !== 'string') || b.evidence?.lookupMode || (b.evidence !== null && !addressKey(b.evidence))) return null;
    return JSON.stringify(stableIdentity([value.lookupMode,...parts,value.exactComponents,value.cityBasis,b]));
  }
  return JSON.stringify(parts);
}

/** Deliberately accepts a whole address title only, never marketing/ranges/units. */
export function titleAddress(title: string, city: string | null): AddressEvidence | null {
  if (!city || !text(city) || title.length > 240 || /\d\s*[-/–]\s*\d/.test(title)) return null;
  const parts = title.trim().split(/\s*,\s*/);
  if (parts.length > 2 || (parts.length === 2 && normalizeAddressText(parts[1]) !== normalizeAddressText(city))) return null;
  const match = parts[0].match(/^([\p{L}\p{M}][\p{L}\p{M}\d .'’\-]*?)\s+(\d{1,5})(?:\s*-?\s*([a-zA-Z]))?(?:\s+([\p{L}\d]{1,10}))?$/u);
  if (!match || /[\d-]$/.test(match[1]) || /\b(?:kamer|studio|appartement|woning|te huur)\b/i.test(match[1])) return null;
  // A separated numeric suffix without a house letter can also be a range.
  if (match[4] && !match[3]) return null;
  const value: AddressEvidence = {basis:'source-title',street:match[1],houseNumber:Number(match[2]),letter:match[3] ?? '',addition:match[4] ?? '',city};
  return addressKey(value) ? value : null;
}
export function currentAddress(listing: Pick<Listing,'title' | 'city' | 'addressEvidence'> & Partial<Pick<Listing,'source'>>): AddressEvidence | null {
  if (listing.addressEvidence?.lookupMode) {
    const value = listing.addressEvidence, b = value.sourceBinding;
    if (!b || b.source !== listing.source || b.title !== listing.title || b.city !== listing.city) return null;
    const expected = houseNumberAddress({...listing,source:b.source,addressEvidence:b.evidence},value.lookupMode);
    return expected && addressKey(expected) === addressKey(value) ? value : null;
  }
  // Explicit evidence is authoritative; malformed evidence must not fall back.
  if (listing.addressEvidence?.basis !== 'source-title' && listing.addressEvidence !== undefined && listing.addressEvidence !== null) return addressKey(listing.addressEvidence) ? listing.addressEvidence : null;
  return titleAddress(listing.title,listing.city);
}

/** User-approved lookup context only. Never writes Listing.city or removes raw units. */
export function houseNumberAddress(listing: Pick<Listing,'source' | 'title' | 'city' | 'addressEvidence'>, mode: NonNullable<AddressEvidence['lookupMode']> = 'house-number-v1'): AddressEvidence | null {
  if (listing.addressEvidence?.lookupMode) {
    if (listing.addressEvidence.lookupMode === mode) return currentAddress(listing);
    if (!currentAddress(listing)) return null;
    return houseNumberAddress({...listing,addressEvidence:listing.addressEvidence.sourceBinding!.evidence},mode);
  }
  if (listing.city && normalizeAddressText(listing.city) !== 'groningen') return null;
  const original = listing.addressEvidence;
  // Title-derived evidence is not authoritative against a changed source title.
  // Preserve it in the binding, but parse the current title just as exact mode does.
  const explicit = original?.basis === 'source-markup' ? original : null;
  if (original && !addressKey(original)) return null;
  if (explicit && (!addressKey(explicit) || normalizeAddressText(explicit.city) !== 'groningen')) return null;
  const city = listing.city || explicit?.city || 'Groningen';
  const raw = listing.title.trim().replace(/,\s*(?:[1-9]\d{3}\s?[A-Za-z]{2}\s+)?Groningen\s*$/i,'');
  const exact = explicit ?? titleAddress(raw,city);
  // A numeric street name may contain a year/ordinal; never treat that token as
  // the house number. Match the complete supported suffix, not arbitrary prose.
  const suffixPattern = mode === 'house-number-v2' ? '(?:\\s*\\([^()]{0,80}\\)|[A-Za-z][\\p{L}\\d \\-()]{0,80}|-+[\\p{L}\\d][\\p{L}\\d \\-()]{0,80}|\\s+s\\d+[\\p{L}\\d \\-()]{0,80})?' : '(?:[A-Za-z](?:\\s+[\\p{L}\\d]+)?|\\s*\\([^()]{1,80}\\)|-{1,2}[\\p{L}\\d]+(?:\\s+s\\d+)?)?';
  const pattern = new RegExp(`^([\\p{L}\\p{M}\\d][\\p{L}\\p{M}\\d .'’\\-]*?)\\s+(\\d{1,5})(${suffixPattern})$`,'u');
  const match = exact ? null : raw.match(pattern);
  const street = exact?.street ?? match?.[1], number = exact?.houseNumber ?? Number(match?.[2]);
  if (!street || !number || number > 99999 || !/[\p{L}]/u.test(street) || /[-]$/.test(street) || /\b(?:kamer|studio|appartement|woning|te huur)\b/i.test(street)) return null;
  const value: AddressEvidence = {basis:explicit?.basis ?? 'source-title',street,houseNumber:number,letter:exact?.letter ?? '',addition:exact?.addition ?? '',city,...(explicit?.postcode ? {postcode:explicit.postcode} : {}),lookupMode:mode,exactComponents:!!exact,cityBasis:listing.city || explicit?.city ? 'source' : 'user-scope',sourceBinding:{source:listing.source,title:listing.title,city:listing.city,evidence:original ?? null}};
  return addressKey(value) ? value : null;
}

/** Whole explicit source address only; no room/range cleanup or inferred city. */
export function sourceAddress(value: string, confirmedCity: string | null): AddressEvidence | null {
  const postal = value.trim().match(/^(.+?),?\s+([1-9]\d{3}\s?[A-Za-z]{2})\s+([\p{L}\p{M} .'’\-]+)$/u);
  const parts = value.trim().split(/\s*,\s*/);
  const city = postal?.[3] ?? (parts.length === 2 && text(parts[1]) ? parts[1] : confirmedCity);
  if (!city || (confirmedCity && normalizeAddressText(city) !== normalizeAddressText(confirmedCity))) return null;
  const address = titleAddress(postal ? postal[1].replace(/,$/,'') : value,city);
  if (!address) return null;
  const result: AddressEvidence = {...address,basis:'source-markup',...(postal ? {postcode:postal[2]} : {})};
  return addressKey(result) ? result : null;
}
