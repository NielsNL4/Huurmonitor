import type { Evaluation, Listing, Profile, Verdict } from './model';
export function evaluate(l: Listing, p: Profile): Evaluation {
  const criteria: Evaluation['criteria'] = [];
  const add = (label: string, known: boolean, pass: boolean) => criteria.push({ label, verdict: !known ? 'unknown' : pass ? 'pass' : 'fail' });
  add('Beschikbaarheid', l.available !== null, l.available === true);
  add('Locatie', l.city !== null, l.city?.toLowerCase() === p.city.toLowerCase());
  const price = l.rent[p.basis];
  if (p.minBudget !== null) add('Minimale huur', price !== null, price !== null && price >= p.minBudget);
  if (p.maxBudget !== null) add(p.basis === 'base' ? 'Maximale kale huur' : 'Maximale bekende maandlasten', price !== null, price !== null && price <= p.maxBudget);
  if (p.minArea !== null) add('Oppervlakte', l.area !== null, l.area !== null && l.area >= p.minArea);
  if (p.minBedrooms !== null) add('Slaapkamers', l.bedrooms !== null, l.bedrooms !== null && l.bedrooms >= p.minBedrooms);
  if (p.types.length) add('Woningtype', l.type !== null, l.type !== null && p.types.includes(l.type));
  if (p.checkIncome) add('Expliciete inkomenseis', l.incomeMin !== null && p.income !== null, l.incomeMin !== null && p.income !== null && p.income >= l.incomeMin);
  const verdict: Verdict = criteria.some(c => c.verdict === 'fail') ? 'fail' : criteria.some(c => c.verdict === 'unknown') ? 'unknown' : 'pass';
  // Unknown availability is never actionable, even with unknown criterion opt-in.
  return { criteria, verdict, eligible: l.available === true && (verdict === 'pass' || (verdict === 'unknown' && p.includeUnknown)) };
}
