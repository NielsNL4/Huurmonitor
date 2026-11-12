import { evaluate } from './matcher';
import { coverageSignature } from './rent';
import type { Decision, Event, Home, Listing, Profile } from './model';
export function reconcile(previous: Home[], incoming: Listing[], profile: Profile): { homes: Home[]; events: Event[] } {
  const map = new Map(previous.map(h => [h.listing.key, h]));
  const fresh = new Map(incoming.map(l => [l.key, l]));
  const keys = new Set([...map.keys(), ...fresh.keys()]);
  const events: Event[] = [];
  const homes = [...keys].map(key => {
    const old = map.get(key), listing = fresh.get(key) ?? old!.listing;
    const evaluation = evaluate(listing, profile);
    // A decision made after a cloud profile save acknowledges the facts/profile at
    // that decision, not the stale evaluation from the last scheduled worker.
    const baseline = old?.decisionContext?.listing ?? old?.listing;
    const priorEvaluation = old?.decisionContext ? evaluate(old.decisionContext.listing, old.decisionContext.profile) : old?.evaluation;
    const signature = coverageSignature(listing.rent);
    let reason = '';
    if (evaluation.eligible) {
      if (!old || !priorEvaluation?.eligible) reason = old ? 'Voldoet nu aan je profiel' : 'Nieuwe match';
      else if (baseline?.available === false && listing.available === true) reason = 'Opnieuw beschikbaar';
      else if (baseline && listing.rent.knownMonthly !== null && baseline.rent.knownMonthly !== null && signature !== null && signature === coverageSignature(baseline.rent) && listing.rent.knownMonthly < baseline.rent.knownMonthly) reason = 'Bekende maandlasten gedaald';
    }
    if (evaluation.eligible && baseline?.available === false && listing.available === true) reason = 'Opnieuw beschikbaar';
    const revision = (old?.revision ?? 0) + (reason ? 1 : 0);
    if (reason) events.push({ id: `${key}:${revision}`, key, revision, reason, listing });
    const dismissal = old?.dismissal ? { ...old.dismissal, evaluation: old.dismissal.profile ? evaluate(old.dismissal.listing, old.dismissal.profile) : old.dismissal.evaluation } : null;
    return { listing, evaluation, revision, reason: reason || old?.reason || '', decision: reason && old?.decision !== 'favourite' ? 'new' : old?.decision ?? 'new', dismissal, decisionContext: null } satisfies Home;
  });
  return { homes, events };
}
export function decide(home: Home, decision: Decision, at = new Date().toISOString(), profile?: Profile): Home {
  const evaluation = profile ? evaluate(home.listing, profile) : home.evaluation;
  return { ...home, decision, evaluation, decisionContext: profile ? { listing: structuredClone(home.listing), profile: structuredClone(profile) } : null, dismissal: decision === 'dismissed' ? { listing: structuredClone(home.listing), evaluation: structuredClone(evaluation), ...(profile ? { profile: structuredClone(profile) } : {}), at } : home.dismissal };
}
export function mergeEvents(pending: Event[], next: Event[]) { return [...new Map([...pending, ...next].map(e => [e.id, e])).values()]; }
