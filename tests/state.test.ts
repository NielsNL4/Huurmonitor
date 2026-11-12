import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../shared/matcher';
import { decide, mergeEvents, reconcile } from '../shared/state';
import { neutralProfile, type Listing } from '../shared/model';
import { retryKey } from '../worker/outbox';
const listing = (): Listing => ({ key: 'gruno:1', source: 'gruno', externalId: '1', url: 'https://example.invalid', title: 'Example', city: 'Groningen', type: 'kamer', area: 20, bedrooms: null, available: true, moveIn: null, description: 'Fixture', photos: [], incomeMin: null, observedAt: 'old', rent: { base: 70000, headline: 80000, serviceAggregate: 10000, service: null, energy: null, knownMonthly: 80000, comparison: 'base+aggregate', coverage: { gas: 'included', water: 'included', electricity: 'included', internet: 'excluded' }, utilities: 'G/W/E inbegrepen; internet niet inbegrepen', complete: false, note: '' } });
test('unknown_facts_do_not_qualify', () => {
  const p = { ...neutralProfile, minBedrooms: 1 };
  assert.equal(evaluate(listing(), p).verdict, 'unknown'); assert.equal(evaluate(listing(), p).eligible, false);
  assert.equal(evaluate(listing(), { ...p, includeUnknown: true }).eligible, true);
  assert.equal(evaluate({ ...listing(), available: null }, { ...p, includeUnknown: true }).eligible, false);
});
test('corrected_facts_can_resurface, dismissal_persistence', () => {
  const p = { ...neutralProfile, minBedrooms: 1 };
  const initial = reconcile([], [listing()], p).homes;
  const dismissed = [decide(initial[0], 'dismissed', 'then')];
  const update = reconcile(dismissed, [{ ...listing(), bedrooms: 1 }], p);
  assert.equal(update.homes[0].decision, 'new'); assert.equal(update.events.length, 1); assert.equal(update.homes[0].dismissal?.at, 'then');
  const noChange = reconcile([decide(update.homes[0], 'dismissed')], [{ ...listing(), bedrooms: 1 }], p);
  assert.equal(noChange.homes[0].decision, 'dismissed'); assert.equal(noChange.events.length, 0);
});
test('profile changes re-evaluate, favourites never reinsert into New', () => {
  const first = reconcile([], [listing()], { ...neutralProfile, maxBudget: 70000 });
  const next = reconcile(first.homes, [], neutralProfile); assert.equal(next.events.length, 1);
  const fav = [decide(next.homes[0], 'favourite')]; const cheaper = listing(); cheaper.rent.knownMonthly = 75000;
  assert.equal(reconcile(fav, [cheaper], neutralProfile).homes[0].decision, 'favourite');
});
test('comparable_price_drops_only', () => {
  const initial = reconcile([], [listing()], neutralProfile), cheaper = listing(); cheaper.rent.knownMonthly = 75000;
  assert.equal(reconcile(initial.homes, [cheaper], neutralProfile).events.length, 1);
  cheaper.rent.comparison = 'different-coverage'; assert.equal(reconcile(initial.homes, [cheaper], neutralProfile).events.length, 0);
  cheaper.rent.comparison = null; assert.equal(reconcile(initial.homes, [cheaper], neutralProfile).events.length, 0);
});
test('confirmed_reavailability', () => {
  const unavailable = reconcile([], [{ ...listing(), available: false }], neutralProfile);
  const next = reconcile(unavailable.homes, [listing()], neutralProfile); assert.equal(next.events[0].reason, 'Opnieuw beschikbaar');
});
test('source_failure_preserves, cosmetic_no_repeat', () => {
  const initial = reconcile([], [listing()], neutralProfile);
  const failure = reconcile(initial.homes, [], neutralProfile); assert.deepEqual(failure.homes, initial.homes); assert.equal(failure.events.length, 0);
  assert.equal(reconcile(initial.homes, [{ ...listing(), description: 'New words', observedAt: 'new' }], neutralProfile).events.length, 0);
});
test('retries_reuse_event and stable digest idempotency', () => {
  const first = reconcile([], [listing()], neutralProfile);
  const retry = reconcile([], [listing()], neutralProfile);
  assert.equal(first.events[0].id, retry.events[0].id); assert.equal(mergeEvents(first.events, retry.events).length, 1);
  assert.equal(retryKey('durable-id'), retryKey('durable-id'));
});
test('cloud profile-save then dismiss before worker acknowledges the current trusted profile', () => {
  const stored = reconcile([], [listing()], { ...neutralProfile, maxBudget: 70000 }).homes[0];
  assert.equal(stored.evaluation.eligible, false);
  // save_profile changes only profiles.config. set_decision reads that row under
  // lock and captures it with stored listing facts, NOT a browser evaluation.
  const cfg = structuredClone(neutralProfile);
  const cloudDismissal = { ...stored, decision: 'dismissed' as const,
    decisionContext: { listing: structuredClone(stored.listing), profile: cfg },
    dismissal: { listing: structuredClone(stored.listing), evaluation: null, profile: cfg, at: '2026-11-11T12:00:00Z' } };
  const next = reconcile([cloudDismissal], [listing()], cfg);
  assert.equal(next.events.length, 0); assert.equal(next.homes[0].decision, 'dismissed');
  assert.equal(next.homes[0].dismissal?.evaluation?.eligible, true);
  assert.equal(next.homes[0].decisionContext, null);
  assert.equal(reconcile(next.homes, [listing()], cfg).events.length, 0);
  const cheaper = listing(); cheaper.rent.knownMonthly = 75000;
  assert.equal(reconcile(next.homes, [cheaper], cfg).events.length, 1); // A later real change still counts.
});
test('a profile change after the acknowledged dismissal can still newly qualify', () => {
  const strict = { ...neutralProfile, maxBudget: 70000 };
  const stored = reconcile([], [listing()], strict).homes[0];
  const dismissed = decide(stored, 'dismissed', 'then', strict);
  const next = reconcile([dismissed], [], neutralProfile);
  assert.equal(next.events.length, 1); assert.equal(next.homes[0].decision, 'new');
  assert.equal(next.homes[0].dismissal?.evaluation?.eligible, false);
});
test('unknown, conflicting or legacy coverage cannot establish a comparable drop', () => {
  const initial = reconcile([], [listing()], neutralProfile), cheaper = listing(); cheaper.rent.knownMonthly = 75000;
  for (const value of ['unknown', 'conflict'] as const) {
    cheaper.rent.coverage!.internet = value;
    assert.equal(reconcile(initial.homes, [cheaper], neutralProfile).events.length, 0);
  }
  delete cheaper.rent.coverage;
  assert.equal(reconcile(initial.homes, [cheaper], neutralProfile).events.length, 0);
});
