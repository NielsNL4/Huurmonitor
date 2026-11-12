# Official buurt/wijk from source coordinates

User-approved classification: **CBS Wijk- en Buurtkaart 2026**, via PDOK OGC API, pinned dataset version **0**. It is a polygon intersection at the **source-published point**, not address geocoding, nearest-neighbour search or browser geolocation. A source point may be approximate; this does not verify a doorway or assert that the advertisement's own neighbourhood wording is wrong.

- [Official PDOK documentation](https://www.pdok.nl/ogc-apis/-/article/cbs-wijken-en-buurten)
- [API definition](https://api.pdok.nl/cbs/wijken-en-buurten-2026/ogc/v1/api?f=json)
- Attribution: **CBS Wijk- en Buurtkaart 2026, via PDOK — CC BY 4.0; bepaald uit broncoördinaten**. [Licence](https://creativecommons.org/licenses/by/4.0/)

## Request and validation

`worker/official-geography.ts` requests only:

```
https://api.pdok.nl/cbs/wijken-en-buurten-2026/ogc/v1/collections/buurten/items
  ?f=json&limit=2&filter-lang=cql2-text
  &filter=S_INTERSECTS(geometry,POINT(LONGITUDE LATITUDE))
```

Both buurt and wijk (plus municipality) come from this **one** result; there is no second layer request. Only finite, bounded `location` values with source provenance/unknown precision qualify. No address, listing title/URL, owner ID, email or profile is sent. PDOK necessarily receives the worker's IP and public source coordinates. No browser lookup, API key, paid service or new dependency.

Exactly one containing nonwater GeoJSON feature must supply exact year `2026` (number or the observed wire string `"2026"`), `water: NEE`, nonempty names, and consistent `BU########`, `WK######`, `GM####` codes. Municipality is validated from the response, not forced to Groningen. Default GeoJSON CRS84 longitude/latitude polygons are independently checked for point containment, including holes and MultiPolygons; two-dimensional positions or the observed three-dimensional positions with finite numeric altitude are supported (altitude is ignored). Foreign-point/malformed geometries or an unexpected CRS are rejected. Zero matches → `no-match`; multiple/paginated/boundary matches → `ambiguous`; water → `water`; malformed/wrong-year/foreign-point responses → `invalid-response`; transport/HTTP/timeout/JSON failures → `error`. All unknown results have null names/codes—no nearest polygon or guessed city centre.

## Stored metadata and cache

`Listing.officialGeography` is optional JSON, separate from `neighbourhood` and `location`: `provider`, `year`, `version`, exact input source coordinates/provenance, `retrievedAt`, `lastAttemptAt`, `lastAttemptStatus`, classification `status`, and nullable `buurt`, `wijk`, `municipality` name/code objects. Old rows remain safe and unknown. No SQL/table/RPC changes.

Each pass indexes validated persisted metadata from existing listing snapshots across **all** homes. Cache identity is provider/dataset year+version and the exact longitude/latitude pair. Duplicate points share one result. A changed/missing point or dataset invalidates reuse and display; old names must never follow a new point. Valid current classifications are preferred over failed entries at that same point.

- Known results: refresh after **30 days**.
- Valid negative results (`no-match`, `ambiguous`, `water`): **7 days**.
- Error/invalid-response: **1 day** before another attempt.
- A failed refresh of a previously valid **same-point/year** result retains its names and original retrieval time, recording the failed attempt and a one-day cooldown. The UI labels this failed recheck; it does not silently present it as freshly confirmed. A valid new negative classification replaces the old result.

Requests are serial, with **2 seconds between attempts**, one attempt per uncached unique point per pass, **15-second timeout**, no redirects/retries, and a 2MB response cap. A transport/HTTP failure stops further network attempts in that pass; remaining uncached points receive an error/cooldown. No numeric provider traffic limit or uptime guarantee has been established. These are conservative client limits, not promises about service capacity. The pinned dataset is not automatically upgraded to another year/version.

## Integration and display

Normal worker ingestion enriches normalized incoming listings using the stored cache **before** `reconcile`. Enrichment failure does not reject a rental observation. The existing monitoring/allowlist gates remain; no flags, scheduler or mail behavior is enabled by this work. `evaluate`/meaningful-change logic use no official-geography fields; no new profile criteria, price/availability changes or notification triggers.

The existing fact grid shows **Wijk volgens advertentie**, **Buurt (CBS)** and **Wijk (CBS)** separately. Unavailable/ambiguous/error/legacy results display **Niet bepaald**. A compact linked year/provenance/licence note accompanies them. The original source wording is not overwritten. No demo geographic result is invented. The automatic OSM map is unchanged.

For the explicitly authorized one-time enrichment, read owner-scoped stored source points only; no rental source/index requests. Patch only `listing.officialGeography` through the existing optimistic version-checked `apply_batch`, with empty events/runs. Refuse an unassigned notification backlog so that RPC cannot enqueue an unrelated digest. Do not reparse rentals or reconcile this metadata-only write. Preserve all other listing facts, evaluations, decisions and historical snapshots, profile config, homes without source points, source runs, events and outbox; verify exact canonical content after readback. Concurrent version changes abort, not overwrite/retry.

## Evidence

`tests/official-geography.test.ts` uses deterministic synthetic polygons (explicitly not live observations) to check request order/year, both levels, unknown/invalid results, containment/holes, cache identity/deduplication/expiry/backoff/failure retention, and unchanged source facts/matching/decisions. Nine focused tests and one typecheck passed. UI additions use the incumbent fact grid and are inspected, not redesigned; no broad suite, build or browser/screenshot round.

### One live pass and final persisted outcome — 2026-11-12

Initial owner snapshot: **136 homes**, **35 valid source points**, **35 unique point pairs**, all Gruno. One live pass made **35 PDOK queries**, **0 persisted-cache hits**, **0 duplicate points** and **0 rental-source requests**. All responses were saved for bounded offline inspection.

The first validator was too strict about wire types: the service returns `jaar: "2026"` and three-dimensional polygon positions with numeric altitude. That initially classified all 35 as `invalid-response`. Inspection—not further requests—established the actual schema. The validator now accepts only exact numeric/string 2026 and finite numeric 2D/3D positions. The two affected validation regressions passed after correction, and all **35 saved real responses** validated offline. No second live pass/retry/provider query occurred.

The initial unknown metadata and subsequent saved-response correction used **two** existing optimistic atomic geography-only writes; each advanced the transaction version once, not profile config. Final owner-scoped readback verified exact unchanged **all nongeography home data** (prices, availability, source neighbourhood, evaluations, decisions, histories and source coordinates), **all homes without source points**, **profile config**, **source runs**, **events** and **outbox** against the original snapshot. **Zero new events or outbox entries**, no sends, flags, schedules, schema changes or source scans.

| Source | Stored homes | Valid source points | Known CBS buurt + wijk | Unknown |
|---|---:|---:|---:|---:|
| Gruno | 35 | 35 | 35 | 0 |
| Solide | 26 | 0 | 0 | 26 |
| Maxx | 75 | 0 | 0 | 75 |

Final point classifications: **35 known**, **0 no-match**, **0 ambiguous**, **0 water**, **0 invalid**, **0 transport errors**. Final known coverage is not a claim that all 136 homes are classifiable or all source points mark exact entrances. No Solide/Maxx points were guessed.

Public example: Petrus Campersingel 145A (`gruno:01853`), source point longitude **6.578996**, latitude **53.221720**. Its preserved advertisement neighbourhood is **Oosterparkwijk**. CBS 2026 independently returns **Gorechtbuurt (`BU00140400`)**, **Oud-Oost (`WK001404`)**, municipality **Groningen (`GM0014`)**. The UI shows these as separate facts, not a correction of source wording. Runtime counters for the initial rejected phase are retained separately from the final corrected result; they are not final coverage.
