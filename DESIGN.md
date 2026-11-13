---
name: Huurmonitor
description: A photo-led personal rental review tool
colors:
  primary: "#22654e"
  primary-hover: "#174f3c"
  ink: "#213d46"
  muted: "#5a6c74"
  canvas: "#f2f5f6"
  surface: "#ffffff"
  line: "#dce3e5"
  focus: "#146ea4"
  warning: "#80571c"
  error: "#a04434"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  description:
    fontSize: "0.9375rem"
    lineHeight: 1.8
  label:
    fontSize: "0.8125rem"
    fontWeight: 600
rounded:
  tag: "5px"
  input: "7px"
  button: "8px"
  row: "10px"
  surface: "12px"
spacing:
  compact: "8px"
  small: "12px"
  group: "16px"
  section: "24px"
  inset: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "9px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "9px 16px"
---

## Mobile editorial override · November 2026

At **≤760px only**, the five user-supplied Stitch screenshots govern their own
screen, followed by their HTML, then the exported Noord Archief DESIGN. This
overrides the daylight mobile rules below. The later approved desktop adaptation
below supersedes the original keep-light desktop restriction, not its split view.

- New: `#141412`, `#f4f3ef`, fine `#292826` dividers; Hanken Grotesk and Newsreader.
  A 56px italic masthead, source strip and full-bleed 4:5 story precede the real
  address, qualified price and equal 48px decisions in normal flow. Sections:
  Kenmerken → Kostenbasis → Locatie & omgeving → Voorwaarden → Omschrijving → source.
- Favourites: `#121212`, inset 16:10 photography, 24px gutters, serif addresses
  and prices, actual-source filters and three-column facts. Cards open a dossier;
  removal means removal from favourites, never deletion. No private notes.
- Archive: `#131313`, `#1c1b1b` cards, brass `#dbc48b`, Geist/JetBrains Mono with
  Newsreader; 16px gutters, grayscale 16:9 images. Search and chips use current
  stored data/evaluation. Only actual dismissal dates appear. All homes retained.
- Dossier: mobile collection subview, 4:3 gallery, numbered specification,
  criteria, location and description sections. Back restores origin and reading
  position before paint. Genuine source ID/agency; CTA opens the original ad.
- Profile: dark Hanken/Newsreader, flat divided sections, nullable editable
  budgets and optional synchronized range controls, actual supported types,
  bedrooms, area, price basis, income, unknown and email preferences. Save only;
  sources are directly visible. Operational copy is not a live-worker claim.

Navigation keeps Nieuw / Favorieten / Afgewezen / Profiel, including where the
references used other labels. New/Profile have text navigation; collections and
dossier use icon labels. Source-only automatic OSM maps, attribution and privacy
disclosure remain. Advertisement neighbourhood and CBS buurt/wijk stay separate.
Unsupported notes, district filters, travel estimates, legal/accreditation claims,
verified dossiers and application/document transfer are deliberately omitted.
Unknown facts are explicit, not replaced by reference claims.

All five actual PNGs were inspected. Implementation/comparison width is 390 CSS
pixels; the 231–390px-wide height-capped exports do not establish original CSS
viewport widths. Match corresponding regions, not stretched full-page height;
no pixel-perfect or unshown responsive claim. Unshown empty/loading/error/auth
states inherit the world. Self-hosted fonts and verbatim OFLs: `public/fonts/`.
Reference exports remain private, unmodified, outside application assets. Only
existing actual listing/demo photography is used; the demo can lack source photos.

## Approved desktop editorial adaptation · November 2026

The user requested the mobile design on desktop and explicitly retained the
side-by-side list/detail layout. At **>760px**, `src/desktop.css` overrides the
historical daylight tokens recorded below: canvas `#141412`, ink `#f4f3ef`, muted
`#aaa8a1`, dividers `#292826`, brass focus `#dbc48b`. Reuse the self-hosted mobile
Hanken/Newsreader faces and Vite's base-aware font URLs; titles/prices are regular
serif, the wordmark italic. No white/petrol panels, rounded shells or shadows.

Keep desktop header/account and horizontal navigation, incumbent 1280px canvas,
350px list/28px gap (existing 1050px/1500px adaptations), bounded reading scroll,
380px gallery cap and reserved decision strip. Rows are flat and divided, facts
are directly visible divided rows, full description uses 18px Newsreader. Equal
48px square outlined/filled decisions retain all existing semantics. Favourites
use `#121212`; archive uses `#131313`, `#1c1b1b` rows, grayscale thumbnails and
Geist/Mono/brass source metadata. Neither becomes a mobile feed. Profile/sign-in
retain native inputs, paired fields and explicit save in the dark flat world.
All content, source/CBS/cost unknowns, verdict labels, map loading/privacy and
attribution remain unchanged. Mobile CSS, fonts, navigation and safe areas are
unchanged. Desktop theme-color is `#141412`; no reference imagery ships.

Verification scope: isolated local demo at 1440px and 390px across four existing
destinations, unchanged-mobile comparison, targeted detector and scoped diff
inspection. No full suite/build/lint, private data or cloud operations required.

Local Chromium evidence: `.impeccable/review/desktop-adapt-*.png` and
`desktop-adapt-evidence.json` (ignored development artifacts). At 1440×1000,
all four destinations had no horizontal overflow; list/detail remained
350px/838px, gallery 380px, decisions 48px with reading-region clearance.
Four 390×844 mobile captures were byte-identical before/after (New empty state,
populated favourites/archive and profile); the existing `stitch-new.png` remains
the populated mobile-story reference. One row-alignment correction followed.
The targeted detector reported advisory palette/type-ramp drift against the
historical frontmatter, not blockers; the approved overrides above are intentional.
No real-device/Safari, authenticated/private, live map, production build or
additional desktop-width rendering claim is made.

## Approved Kaart extension · November 2026

This extends the existing world, not a redesign. New **Kaart** navigation sits
between Afgewezen and Profiel. Five mobile icon/text destinations fit the existing
72px bottom bar; keep every label and 44px-or-larger controls. Desktop retains the
1280px canvas, 350px list and 28px gap, with a large linked map instead of the
detail pane. Mobile has an explicit Kaart/Lijst switch and compact selected-home
preview above navigation. Existing dossiers and the source-only detail OSM iframe
remain unchanged; return restores map camera, selection, mode and list position.

Use incumbent Hanken/Newsreader, near-black canvas, offwhite text/match marks,
brass heart favourites plus text, fine dividers, square controls and brass focus/
selected outlines. Prices always carry cost basis/caveat. Missing locations stay
selectable/countable in the list, not fabricated pins. Identical points cluster
without jitter and reveal all homes on expansion. No map gesture decides a home.

The managed CARTO Dark Matter style keeps its sources, glyphs and sprites. Only
safe layer-type/role changes recolour background, water, roads and label/halo
colours; no copied map style or decorative fake geography. Visible CARTO/OSM
attribution and direct privacy wording remain. Missing key, quota/style/network
or WebGL failures show honest fallback copy while the list remains usable.
MapLibre loads lazily, uses one cleaned-up instance, responds to resize and does
not refit after every data update/pan. Reduced motion removes camera animation.

CBS provenance now distinguishes source points from current worker-cached BAG
address locations. This explicitly supersedes earlier source-only classification
and project-wide no-geocoder rules; source neighbourhood/matching facts and the
per-property source-only iframe are not changed. No browser geocoder/geolocation.
The surface contract and scoped evidence live in `.impeccable/map-surface-brief.md`.

## Approved light/dark choice · November 2026

Device preference is the initial theme and remains live until an explicit choice.
One shared 44px header button offers “Lichte modus inschakelen” / “Donkere modus
inschakelen”, including signed-out screens. Explicit light/dark is remembered only
in this browser/device (`huurmonitor-theme-v1`), independent of account/demo/logout.
Storage denial keeps the choice in memory. No account synchronization/settings page.
A synchronous same-origin, base-relative bootstrap owns root theme/native scheme
and the single browser theme-color before React starts; no external bootstrap/CSP change.

The light counterpart preserves every editorial layout/type/collection distinction:
canvas `#f5f3ed`, favourites `#f8f6f0`, archive/dossier `#f1eee6`, cards `#e8e3d9`,
ink `#24231f`, muted/placeholders `#625e56`, dividers `#d8d3c8`, control borders and
tracks `#827b6e`, hover/selection `#e8e3d8`, pressed `#ddd6c8`, brass/focus/unknown
`#756026`, pass `#365b43`, fail `#963f35`, error background `#f3e5df`.
Primary buttons use dark ink with `#f8f6f0` text. Photo overlays stay white on a
fixed dark backing; no global filter/inversion. Archive photographs stay grayscale.
Mobile local tokens, sign-in native controls, autofill, placeholders and safe-area
canvas participate, not just desktop root tokens.

The same managed CARTO provider/key uses Positron in light and Dark Matter in dark.
Only Dark Matter gets the existing dark paint adjustments. Theme switches use
`setStyle` on the same MapLibre instance, restoring the latest local homes source
on `style.load`, retaining camera/selection/group/list state without refitting.
Stale cluster responses are generation-guarded. Fallback list/privacy/attribution
remain unchanged; no browser geocoding or new provider/dependency.

Theme implementation evidence: 13/13 focused theme/map-model tests; one
`npm run check` passed (106 modules). Vite reports the expected unbundled classic
bootstrap warning (the file is copied and base-relative in dist) and incumbent
large chunks. Isolated Chromium at 1440×1000 and 390×844, both themes, synthetic
demo only: New, favourites, archive, mobile dossier, native profile, masked/revealed
passwords and confirmation/status; all five mobile labels and 44px theme control,
no horizontal overflow. Computed ancestor-background audit sampled 337 pairs:
worst passing sampled text was brass `#756026` on card `#e8e3d9`, 4.75:1; light
field edge `#827b6e` on canvas `#f5f3ed`, 3.78:1. Dark field edges (2.39:1), mobile
skip-link (1.11–1.29:1), sign-in error (2.15:1) and primary hover (1.95:1) were
corrected in one batch; named confirmation reported no sampled contrast failures.
Older skip-link captures are explicitly marked superseded, not rerendered.
Pressed light controls use ink/stronger edges because muted/brass/control palette
pairs on the pressed background alone fell below their thresholds.

Real CARTO Positron tiles/labels and cluster markers were observed. Same map
instance, camera and selected preview survived rapid toggles; mobile list scroll
remained 240px. Mock provider failure retained the list; mobile recovery observed,
desktop recovery sampled too early and is not established. Final inspection found
MapLibre 6's diff path does not emit `style.load`; the last narrow correction uses
`setStyle(url,{diff:false})`, rebuilding only the style so dark paint and homes
restoration run reliably. This final option change is source-inspected, after the
single check/browser budget: **not rebuilt or recaptured**. The earlier dark-map
capture shows the previous/transitional light style and is not proof of final
dark cartography. Group captures preceded async expansion, so group behavior
reuses earlier map evidence rather than claiming a fresh verification.

43 distinct ignored captures: `.impeccable/review/theme-*.png`; sanitized aggregate
`theme-evidence.json` records the two initial harness interruptions (button locator,
optimized CJS default export), bounded continuation, named confirmation and limits.
One detector run: 31 historical palette/type sidecar advisories, zero primary
findings; not a redesign gate. Final scoped tracked diff whitespace check passed.
No real account reads/writes, geocoder calls, Safari/real device/autofill proof or
real password success update. No secret/keyed URL recorded; no cloud/release work.

# Design System: Huurmonitor

## Overview

**Creative North Star: "Read the home, then decide"**

An operating interface for a person reviewing rentals in daylight on a phone or laptop. Real source photography leads; compact Dutch labels make cost uncertainty and saved decisions understandable. Restrained green actions, cool neutral surfaces and dark petrol text support repeated use rather than decoration. Huurmonitor is a temporary functional name, not an established brand.

**Key Characteristics:** photo-first, labelled uncertainty, reversible decisions, familiar controls. This records the implemented system, not a user-approved final identity.

## Colors

Primary green carries selection, original-source links and the save action. Petrol ink and cool slate secondary text sit on white; desktop canvas is a cooler neutral layer. Warnings use an ochre text role, failures a muted red role, always accompanied by words.

**The Known Is Not All-In Rule.** A strong price value is always adjacent to the known-monthly qualifier and its all-in caveat, never treated as a marketing headline.

## Typography

One native system sans stack throughout. Page titles are fixed-size, reducing to 1.5rem on mobile. Property headings are 1.625rem desktop / 1.5rem mobile. The price is 1.875rem / 1.75rem with tabular numerals. Description text is 0.9375rem desktop / 0.875rem mobile with 1.8 line height and a 70ch cap. Compact metadata is subordinate to the title, not a separate display voice. No external font requests.

## Layout

Desktop uses a 1280px maximum canvas, 32px normal outer padding, a 350px property-list column and a flexible detail column with 28px gap. At 1500px the list becomes 370px, gap 36px, and container padding drops. At 1050px the list becomes 280px and insets tighten. At 760px and below the list is removed, with a manual property pager and one detail profile.

The viewport is a bounded reading region. Desktop keeps header and navigation above it and reserves 81px below for decisions. Mobile reserves a 64px header, a 71px decision region and a 68px bottom navigation region plus safe area. The main region scrolls independently; action controls are outside its reading viewport. Empty/profile states retain the shell's reserved region. Photo is capped at 380px desktop and 240px mobile so the address/price are not displaced by a whole-screen image. Full descriptions remain in the scroll region.

## Elevation & Depth

Mostly flat surfaces with fine borders and selected-row tonal contrast. The selected row has a very subtle offset soft shadow; the action region uses a shallow separation shadow. No decorative glass, glows or image-like CSS material.

## Shapes

Rectangular photography, gently rounded desktop containers and list rows; mobile photo/profile run edge-to-edge. Small radii identify controls, not pill-shaped decoration. Inputs retain native select/number/checkbox behavior. Authored SVG icons share a thin rounded stroke.

## Components

- **Buttons:** primary green or white bordered secondary, 44px minimum normal height; decision controls are 48px desktop / 46px mobile. Background states use a 160ms ease-out transition, with visible 3px focus outline, pressed state and disabled opacity.
- **Navigation:** four labelled destinations, selected green text and thin marker. Desktop horizontal strip; mobile fixed bottom strip. Count is attached only to New.
- **Story gallery:** explicit full-width container with absolutely fitted cover-photo button, keeping the desktop height cap without intrinsic-width shrinkage. Six-second segments have a dark backed rail and three light 4px tracks visible even when paused at zero. Previous/next/pause buttons, source/demo label and honest missing-image fallback remain. Starts paused for reduced motion; hidden/offscreen/press and focus within pause it. Focus exit never clears manual/reduced-motion pause. It never selects a new property; photo taps navigate, not a new photo-swipe gesture.
- **Decision header:** labelled drag surface with horizontal intent threshold; it does not include the description, photos or form controls. Button actions and persistent Undo/Restore are authoritative alternatives.
- **Source, costs and match facts:** direct compact sections, no details/summary or substitute disclosure. Each source's meaningful message is always visible; every criterion has pass/fail/unknown words. No score, confetti or inferred all-in value. Native profile selects remain because they perform genuine selection.
- **Inputs:** white, fine cool border, compact labels; field descriptions explain uncertain matching. Error, loading, empty and saved feedback use readable text. The current loading state is a static pale wash, not an animated shimmer.
- **Property map:** a direct section after the full bio, inside the same scrolling detail. Only valid source-published points are eligible, labelled “Locatie volgens de bron” with unknown doorway precision. Per the superseding user request, the OpenStreetMap iframe loads automatically with the selected advertisement, including in demo; no load button or accordion. Property/point changes replace the embed. Disclosure explicitly names the automatic external request, IP address and viewed location, never profile transmission. A full-width 300px native embed retains its attribution and an ordinary larger-map link; missing points show plain unavailable text and retain the original source link. No new layout, tokens, geocoding, decorative map assets or swipe surface.
- **Official geography facts:** adjacent existing definition-grid entries distinguish “Wijk volgens advertentie”, “Buurt (CBS)” and “Wijk (CBS)”. Only worker-cached PDOK/CBS 2026 classifications for the current source point are shown; unknowns say “Niet bepaald”. An existing compact field-note role carries linked dataset/year/provenance and CC BY 4.0 attribution, plus failed-recheck wording when an earlier valid result is retained. No accordion, dropdown, browser query, new profile filter or map/layout polish.
- **Focus:** a first-focus skip link targets the bounded main region. Selection and caret colors follow the restrained palette. Reduced motion removes transitions and automatic story playback.

## Do's and Don'ts

- Do preserve the property-profile mobile view and desktop list/detail structure.
- Do keep complete descriptions and explicit unknown facts accessible.
- Do reserve space outside the reading viewport for decision/navigation controls.
- Don't turn the app into metric cards, dating scores or a marketing landing page.
- Don't imply a source photo is current or licensed for redistribution without evidence.
- Don't put development briefs, private profile data or worker secrets into browser assets.
- Don't use decorative/useless accordions or disclosures. Dropdowns only serve genuine selection; never hide a trivial source message or profile explanation behind a control. This is an explicit durable user rule.
