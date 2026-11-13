import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Listing, Source } from '../shared/model';
import { priceDisplay } from '../shared/price-display';

function listing(source: Source, description = ''): Listing {
  return {
    key: `${source}:fixture`, source, externalId: 'fixture', url: 'https://example.invalid/ad', title: 'Fixture',
    city: 'Groningen', type: null, area: null, bedrooms: null, moveIn: null, available: true,
    description, photos: [], incomeMin: null, observedAt: '2026-11-13',
    rent: { base: null, headline: null, knownMonthly: null, serviceAggregate: null, service: null, energy: null,
      comparison: null, utilities: 'onbekend', complete: false, note: '' },
  };
}

test('all sources retain known-monthly precedence and honest persisted headline fallback', () => {
  for (const source of ['gruno', 'solide', 'maxx'] as const) {
    const l = listing(source, 'Huurprijs: €999,- per maand.');
    l.rent.headline = 80500;
    assert.deepEqual(priceDisplay(l), { amount: 80500, label: 'Geadverteerde huurprijs', caveat: 'kostenbasis niet bevestigd', advertisedFallback: true });
    l.rent.headlineConflict = true;
    assert.equal(priceDisplay(l).amount, null);
    l.rent.knownMonthly = 73065;
    assert.deepEqual(priceDisplay(l), { amount: 73065, label: 'bekend per maand', caveat: 'geen all-in garantie', advertisedFallback: false });
  }
});

test('description-only Solide and Maxx quotes handle bounded Dutch currency variants', () => {
  const examples = [
    ['Huurprijs: €805,- per maand.', 80500],
    ['De huurprijs bedraagt EUR 637,62 per maand, exclusief nutsvoorzieningen.', 63762],
    ['Huur per maand: € 1.140,50 inclusief servicekosten.', 114050],
    ['Huurprijs € 1\u00a0140,50 per maand', 114050],
    ['Huurprijs: 730,65 euro per maand', 73065],
    ['Huurprijs: €730.65 /mnd', 73065],
    ['Huurprijs: €1.140,-', 114000],
    ['Huurprijs: €800 per maand.\nHuurprijs: €800,- per maand.', 80000],
    ['Beschikbaar per 01-12-2026, oppervlakte 42 m².\nHuurprijs: €800,- per maand.\nBorg: €1600,-. Inkomen: €3000,-.', 80000],
  ] as const;
  for (const source of ['solide', 'maxx'] as const) for (const [description, amount] of examples) {
    const l = listing(source, description), before = structuredClone(l), result = priceDisplay(l);
    assert.equal(result.amount, amount, `${source}: ${description}`);
    assert.equal(result.label, 'Geadverteerde huurprijs');
    assert.equal(result.advertisedFallback, true);
    assert.match(result.caveat, /kostenbasis niet bevestigd/);
    assert.deepEqual(l, before);
  }
});

test('base and total quote labels remain qualified, never promoted to calculated rent', () => {
  for (const source of ['solide', 'maxx'] as const) for (const qualifier of ['kale', 'totale']) {
    const l = listing(source, `De ${qualifier} huurprijs bedraagt €800,- per maand inclusief servicekosten.`);
    const before = structuredClone(l);
    assert.equal(priceDisplay(l).label, `Geadverteerde ${qualifier} huurprijs`);
    assert.equal(priceDisplay(l).amount, 80000);
    assert.match(priceDisplay(l).caveat, /kostenbasis niet bevestigd/);
    assert.deepEqual(l, before);
    assert.equal(l.rent.base, null); assert.equal(l.rent.knownMonthly, null);
  }
});

test('ambiguous, competing and non-rental numbers stay unknown', () => {
  const descriptions = [
    '', 'Prijs op aanvraag.', '€800,- per maand.', 'Borg: €1600,-.', 'Inkomenseis: EUR 3000 per maand.',
    'Servicekosten: €75,- per maand.', 'Servicekosten bij huurprijs: €75,-.',
    'Beschikbaar per 01-12-2026. Oppervlakte 42 m².', 'Huurprijs: 01-12-2026.', 'Huurprijs: 42 m².',
    'Borg bedraagt tweemaal de huurprijs: €1600,-.', 'Inkomen: 3 keer de huurprijs €800,-.',
    'Huurprijs: vanaf €800,-.', 'Huurprijs: €800,- tot €900,-.', 'Huurprijs: €800 - 900.',
    'Huurprijs: €800–900.', 'Huurprijs: €800 of 900.', 'Huurprijs: €800/900.',
    'Huurprijs: €800,- per week.', 'Huurprijs: €800,- per jaar.', 'Huurprijs: €800 per m².', 'Huurprijs: €800/m².',
    'Huurprijs: €800,-. Huurprijs: €900,-.',
    'Kale huurprijs: €800,-. Totale huurprijs: €900,-.',
    'Kale huurprijs: €800,-. Totale huurprijs: €800,-.',
    'Huurprijs: €800,- exclusief €75,- servicekosten.',
    'Huurprijs: €800,-. De huur van de andere kamer bedraagt €900,-.',
    'Huurprijs: €800,123.', 'Huurprijs: €0,-.', 'Huurprijs: €-800,-.',
  ];
  for (const source of ['solide', 'maxx'] as const) for (const description of descriptions) {
    assert.equal(priceDisplay(listing(source, description)).amount, null, `${source}: ${description}`);
  }
});

test('Gruno descriptions are not reinterpreted; unusable headlines do not block safe other-source quotes', () => {
  assert.equal(priceDisplay(listing('gruno', 'Huurprijs: €800,- per maand.')).amount, null);
  for (const source of ['solide', 'maxx'] as const) for (const headline of [null, 0, -1, NaN, Infinity, 80500.5]) {
    const l = listing(source, 'Huurprijs: €800,- per maand.');
    l.rent.headline = headline;
    assert.equal(priceDisplay(l).amount, 80000);
    l.rent.headlineConflict = true;
    assert.equal(priceDisplay(l).amount, null);
  }
});
