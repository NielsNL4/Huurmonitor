# Gruno extraction contract

Scope: **Gruno only**. Active adapter: `worker/gruno.ts`, dispatched by `parseListing` in `worker/parsers.ts`. Solide/Maxx retain their existing generic parser. Shared number/date/coverage/contact-redaction helpers are passed into the adapter; no source-account, geocoder, photo downloads or unrelated-page searches.

## Exact field map

Feature labels are read from **`#tabs-2 table.feautures tr`** (the site's actual spelling), using direct label/value cells. Labels trim whitespace/NBSP and a trailing colon, then lowercase. Identical repeated values collapse; conflicting repeated requested values are not overwritten by the last row. Conflicting/missing identity prevents replacement of an existing record.

| Normalized fact | Source / priority | Interpretation |
|---|---|---|
| Stable ID | Feature `Referentienummer` | String, including leading zeros. Missing/conflicting ID rejects the detail. |
| Display title/address, city | `.object_details .object_table_details tr`, `Adres:` value | Address before comma is title; Groningen only when explicitly present. `h1.object_title` is marketing copy, not an invented address. |
| Advertised amount and raw qualifiers | Feature `Huurprijs`, crosschecked against `.object_details .object_price` | Preserve cents in `rent.headline` and both raw notations in `headlineText`. Summary can supply an absent amount. Different row/summary amounts or conflicting feature duplicates set `headlineConflict`, select no headline and block derivation. No generic `.object_price`/table/footer scan. |
| Explicit base rent | `Kale huurprijs`, `Kale huur`, `Netto huurprijs`; otherwise explicitly named base-rent sentence in the financial section | Generic `Huurprijs` is **not** proof of base. Never subtract a service advance from headline to manufacture base. Conflicting explicit bases remain unknown. |
| Service aggregate | Feature `Servicekosten` | One aggregate, not added again when the financial text already includes it. Itemized components are not invented or added on top of that aggregate. |
| Known monthly amount | Bounded `Huurprijs en borg` / `Huurprijs en waarborgsom` / rent-cost section in the full description | Only an explicit monthly total, a rent quote explicitly including a service/utility advance, or explicit base + stated aggregate. Monthly period must be stated in the price evidence. Row/description amounts, advances or included/excluded facts in conflict prevent confirmation. Exclusive/unspecified bare rent quotes stay advertised-only; no assumed full total. |
| Utilities / inclusions | Advertised row qualifiers + that same financial section | Preserve included/excluded/unknown/conflicting components. Known monthly is still not an all-in promise. No Borg/deposit or unrelated financial amount is used as rent. Unsupported fee structures remain unknown. |
| Surface | Feature `Woonoppervlakte` | Dutch decimal number, e.g. `19,94 m²`; conflicting rows become unknown. |
| Housing type | Feature `Type object`; if absent, explicit housing words in the marketing title/first description passage | Kamer/studio/appartement/huis only on supported explicit terms. Generic “woning” does not imply a house. Conflicting structured types stay unknown. |
| Bedrooms | Explicit `Aantal slaapkamers`, otherwise `Aantal kamers` **`waarvan N slaapkamer(s)`** | Room count alone is not bedroom count. |
| Move-in wording/date | Feature `Aanvaarding` + full-description `Beschikbaarheid` / `Huurperiode` section | Preserve source wording including negotiable/direct and differing dates. Normalize one unambiguous calendar date only. Multiple/contradictory dates leave ISO date unknown. `Aangeboden sinds` is never move-in. |
| Availability | Feature `Status`, scoped header `.object_header .object_status`, full-description counterevidence | Explicit rented/under-option/not-available evidence overrides an available badge. Conflicting statuses without decisive unavailable evidence remain unknown. No inference from timeouts/disappearance. |
| Wijk/buurt | Explicit feature `Wijk`/`Buurt`, otherwise bounded `Locatie` text | Explicit named neighbourhood/wijk phrases, including **Schildersbuurt**, not just names ending in `wijk`. No inference from street/postcode. Conflicting duplicate fields stay unknown. |
| Advertiser / landlord | Advertiser is Gruno Verhuur; landlord only feature `Verhuurder` | Advertising agency is not confirmed property owner. Contact-containing landlord values are not collected. |
| Full bio | **`#tabs-3 .description.textblock`** | Never `.short_description`. Preserve paragraph text, redact email/phone contacts, omit forms/scripts. Empty valid source bio is explicitly labelled not provided. |
| Photos | Ordered `.object_header .object_image[data-original]`; only if empty, `#object-photos a[href]` image links | Ordered unique HTTPS source URLs only. No downloads, unrelated listing photos or synthetic depictions. |
| Map point | Inline `script` → direct **`window.MAP_POC_CONFIG`** assignment → direct **`listing.lat` / `listing.lng`** numeric literals | `worker/gruno-location.ts` tokenizes static text without evaluation/script execution. No arbitrary page latitude/longitude, POI point, string or comment is used. One unambiguous assignment with unique properties, finite latitude ±90 and longitude ±180 only; expressions/strings/duplicates/conflicts return unknown. Store as optional `location: {lat, lon, provenance: 'source', precision: 'unknown'}`. Older JSON with no field remains unknown. |
| Optional stated income threshold | Explicit minimum absolute monthly-income statement in the scoped full bio | Existing supported rule only; missing/ratio/unclear conditions remain unknown. No new profile fields. |

## Raw versus derived price and UI behavior

`headline` is a source-advertised amount, not base or confirmed all-in. `headlineText` retains its notation/qualifiers. `knownMonthly` and `base` remain separate nullable facts. The approved Gruno-only presentation fallback is **“Geadverteerde huurprijs” / “kostenbasis niet bevestigd”** in detail/list, with advertised notation also visible in the cost breakdown. Conflicting advertised amounts display unknown, not an arbitrary choice. Solide/Maxx have no new fallback.

`shared/price-display.ts` is presentation-only. The matcher still uses the selected `rent.base` or `rent.knownMonthly`, never the advertised fallback. A base-budget criterion therefore stays unknown when no explicit base is stated. No UI-only change creates an event or resurfaces a dismissal.

## Evidence and fixtures

- Before this task, all **35** stored Gruno records had headline prices; **11** lacked a confirmed monthly amount and **35** lacked an explicit base. This was not evidence that headline scraping had failed.
- Actual retained affected examples: Korreweg 183-B (`01814`) advertises €650 with an unspecified exclusive basis; its quoted “huur … €650,- exclusief per maand” does not establish an all-in/base figure. Ripperdalaan 3 (`01838`) advertises €637.62 while its retained room-2 description quotes €637.32; do not silently choose one. Their Nov12 read failures are not proof of unavailability, and the old observations remain intact.
- Real public contract excerpts: `tests/fixtures/gruno.html` (Petrus 805 including 75), `gruno-jozef.html` (1265 including 200, Schildersbuurt). The Westersingel 1140 including 175 form is covered as a clearly synthetic financial-layout variation, not a newly fetched observation.
- `tests/gruno-template.test.ts` covers raw-vs-confirmed fallback, decimals/currency, scoped/duplicate/conflicting prices, no advance double count, explicit-only base, full bio, neighbourhood, status/date contradictions, ordered photos and no matching/event change from display fallback. Existing Gruno coverage regressions remain in `tests/parsers.test.ts`.

## Bounded refresh

Use only owner-scoped **stored Gruno URLs**, no inventory crawl, after focused tests. Serial robots-compliant reads; reuse same-pass successful representative responses, do not retry failed routes or bypass access controls. Preserve unread records, inactive facts and user choices; no Solide/Maxx requests or parsing. Reconcile only Gruno and combine other-source homes unchanged for the existing owner-targeted atomic `apply_batch`. Emit only meaningful criteria-fact events, never presentation-only changes. No mail lookup/claim/send, no profile edits, no schema changes or scheduling.

Check coverage before/after using public listing price projections only. Report source failures and raw-vs-confirmed counts rather than promising that every advertised price is a confirmed monthly total. Private credentials/profile/decisions are never printed. Refresh evidence for this task is summarized in README; do not run the full three-source worker merely to repair this adapter.

### Completed refresh and persisted coverage — 2026-11-12

One stored-URL pass completed: **33 updated, 2 unread observations preserved**, no retries or inventory crawl. Database readback confirms:

| Price fact | Before | After |
|---|---:|---:|
| Advertised amount present | 35/35 | 35/35 |
| Confirmed monthly amount present | 24/35 | 20/35 |
| Explicit base rent present | 0/35 | 1/35 |
| Raw advertised notation present after this adapter | — | 33/35 |

The decline in confirmed monthly coverage is conservative classification of insufficient/contradictory evidence, not lost advertised amounts. All 15 currently unconfirmed monthly amounts retain advertised amounts for the approved labelled fallback. Remaining source failures: `01814` Korreweg 183-B (representative read unavailable; original code not retained) and `01838` Ripperdalaan 3 (`network`). Their old observations remain; failed reads do not establish unavailability.

Readback verified unchanged profile and Gruno decisions, plus exact non-Gruno home/run contents after accounting for row ordering. Total homes remain 136. The transaction reported **zero matching events**; owner-scoped readback found **zero new outbox or sent entries since the first same-pass detail read**. No other-source requests or send attempts occurred. Evidence: 11 focused passing tests, one passing typecheck, a later passing focused status/date/duplicate-conflict regression, and retained-real-HTML offline checks for Petrus/Jozef (805 including 75; 1265 including 200; unknown base; nine source photos each). Earlier UI visual evidence was reused; no broad suite/build/browser round.

## Source-coordinate map extension

The retained real Petrus config publishes `lat: 53.2217200000, lng: 6.5789960000`. This is **“Locatie volgens de bron”**, not a guaranteed exact doorway. The full cached public HTML can establish this point; the prior script-stripped Jozef cache cannot establish any map point. Synthetic fixture coordinates are never used for live enrichment.

Per the superseding user request, the property detail automatically loads its OpenStreetMap iframe with the selected advertisement when valid source coordinates exist, including in demo. There is no load button. The disclosure explains the automatic external request (or following the larger-map link): IP and viewed coordinates go to OSM, not the search profile. Property/point changes replace the embed; it sends no referrer. The bounded surrounding bbox uses longitude/latitude order; marker uses latitude/longitude. Native attribution remains in the uncropped embed. Missing/invalid/ambiguous points show “Locatie op kaart niet beschikbaar” plus the existing original-advertisement link, never a guessed Groningen marker. No address geocoder, API key, paid service, new dependency or other-source parser changes.

Separately approved [PDOK/CBS 2026 official geography](pdok-cbs.md) now classifies source coordinates in the worker. Its cached `officialGeography` keeps buurt/wijk/municipality names and codes, input point, dataset/version and timestamps apart from source `neighbourhood`. Source `Locatie` wording is never overwritten: the fact grid shows “Wijk volgens advertentie”, “Buurt (CBS)” and “Wijk (CBS)” separately, with unknowns and attribution. No Gruno parse/rent/availability or OSM behavior changes are needed for this enrichment.

Final CBS readback on 2026-11-12: **35/35 Gruno source points** have known buurt and wijk after one 35-query PDOK pass and a saved-response schema correction with no additional requests. Petrus retains source **Oosterparkwijk**, alongside CBS **Gorechtbuurt / Oud-Oost**. All nongeography facts/choices and source runs remain unchanged; no rental-source requests or notification events were needed. See the linked contract for exact counters, wire-schema handling, cache policy and verification limits.

Coordinate enrichment uses only stored Gruno URLs, reusing identity-checked complete cached HTML where possible. One serial robots-compliant pass, no inventory/retries/bypass. It patches **only `listing.location`** through the existing version-checked `apply_batch`, with empty events/runs, no financial reparse or reconcile. It refuses an unassigned notification backlog, and readback compares all nonlocation home content, profile config, other-source homes, source runs, events and outbox. Failed/unknown reads retain old data. Tests live in `tests/location.test.ts` with a clearly identified minimal public config excerpt in `tests/fixtures/gruno-location.html`.

Completed coordinate enrichment, 2026-11-12: **35 patches, 35/35 source points persisted; 1 cached + 34 live detail reads, 0 failed/unknown**. Every public detail's scoped reference matched its stored identity. Readback confirmed all nonlocation home content, profile config, non-Gruno homes, source runs, events and outbox unchanged; optimistic version advanced once. Zero new events/outbox entries, no send attempts or other-source requests. Historical/dismissal/decision snapshots were not enriched or rewritten independently; their original contents remain intact.

Historical click-to-load evidence: five focused passing tests for extraction, bounds/conflicts/scoping, nonexecution, unchanged nonlocation parse output, URL ordering and legacy/initial markup; one passing typecheck. Local isolated-demo browser checks at 1440×1000 and 390×844 used the retained real Petrus point (not synthetic live-home data). They covered the former consent gate and keyboard load, selection reset, honest missing-point text, unchanged decisions and no iframe/action overlap. Both native OSM embeds returned HTTP 200. An initial exact-name attribution lookup missed OSM's “OpenStreetMap contributors” link; a targeted desktop inspection confirmed the native copyright/attribution text remains. Those checks do not establish the later automatic-loading change. That small change updated the initial-markup assertion and was verified by scoped diff inspection only; no tests/types/build/browser reruns, new source reads or database writes.
