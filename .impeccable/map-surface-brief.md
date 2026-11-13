# Kaart · src/CollectionMap.tsx

Mode: Operate. Approved extension, code-first; the lead's accepted brief pins the
direction. No reference reproduction, concept round or generated assets.

## Direction contract
THESIS: Read matches and saved homes spatially without turning position into a
matching fact. No dashboard metrics, inferred doorways or hidden missing homes.

OWN-WORLD: Existing near-black Hanken/Newsreader, fine dark dividers, offwhite
matches and brass heart favourites with text labels. Square controls, no shadows.

STORY: Select a pin or keyboard-accessible listing, read a qualified-price preview,
open the existing dossier, then return to the same selection, camera and list.

FIRST VIEWPORT: Desktop keeps the 1280px canvas and a 350px list beside a large
map. Mobile adds a fifth labelled navigation item, a Kaart/Lijst switch and a
compact selected-home preview above navigation. Visible CARTO/OSM attribution
and direct privacy copy. Missing configuration leaves the complete list usable.

FORM: User-pinned dark map/list split, no seed. Signature interaction: linked
selection and temporary detail return; cluster expansion exposes overlapping
homes without jitter. Camera moves are immediate under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Bounds: eligible New + all favourites only; source-first valid point, otherwise
same-input worker BAG point. No browser geocoder, geolocation, URL/storage state,
fallback provider, account setup or live key verification. Per-property OSM
source-only iframe remains separate. One focused test batch, one final check,
one demo-only 1440/390 browser batch and at most one correction/confirmation.
No nested specialist tools; bounded in-thread finish review is reported honestly.

## Implementation evidence / finish
- Phase 1: 49/49 offline address/location/CBS/parser/state tests; reused unchanged.
- Phase 2: 12/12 map-model/navigation/private-load tests. `npm run check` passed.
  A subsequent narrow `npm run build` verified the explicit MapLibre 6 worker
  emits as a same-origin base-aware asset; both builds report size warnings.
- Isolated Chromium 1440×1000 / 390×844, reduced motion: missing key, complete
  list (including unknown points), detail/back scroll, synthetic WebGL style,
  two-member same-point cluster, explicit unavailable favourite status, camera
  and map-instance retention, five 76×72px mobile nav targets, no overflow.
  Eleven named captures: `.impeccable/review/map-{1440,390}-*.png`.
  Synthetic geometry/points are browser fixtures only, never shipped data.
- Initial renderer failure exposed the package's sibling-worker URL problem and
  was corrected. Confirmation recorded no page errors. The last harness check
  used a visible-link role locator after hiding the map in list mode, returning
  0 rather than 2; the actual DOM/screenshots contain both attribution links.
  The harness locator was corrected without rerunning the unchanged UI batch.
- Later selected-cluster outline and mobile toggle/control hover-contrast fixes
  were code/diff-inspected and included in the production rebuild, not recaptured.
- One detector invocation: 123 advisory findings, all historical-token/type-ramp
  drift; no non-advisory findings. Incumbent DESIGN tokens/sidecar not rewritten.
- Bounded in-thread review (no nested specialists): ship at this local demo scope.
  Live CARTO cartography/key/quota, authenticated data, real-device/Safari and
  actual PDOK/backfill remain unverified. No rollout/cloud actions performed.
