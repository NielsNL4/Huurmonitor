# Huurmonitor — local MVP

Personal Groningen rental review app, Dutch by default. React/Vite/TypeScript frontend, Node/TypeScript ingestion, private Supabase Auth/Postgres, optional Gmail SMTP digests (selected) or explicit Resend transport. The user has manually provisioned Supabase; read-only profile/table checks and anonymous denial succeeded. **No deployment/publication or real email sending has been performed; daily scheduling remains disabled.** `PRODUCT.md` records approved product constraints; the implementation decisions and current limits are below.

## Run locally

Node 22.12+ and npm:

```sh
npm ci
npm run dev
# Open http://127.0.0.1:5175/
```

The canonical local URL is **http://127.0.0.1:5175/**. Both `npm run dev` and `npm run preview` bind only to `127.0.0.1` on port **5175**, with strict port selection: if occupied, startup fails instead of switching ports. Run dev OR preview, never both at once. Preview serves the existing production build; it does not rebuild changed configuration. Keep Supabase Auth's local Site URL and allowed redirect URL exactly `http://127.0.0.1:5175/` (not `localhost` or another port). The passwordless callback uses the current origin and path.

No `.env` is needed for the explicitly labelled demo. Two public-observation examples demonstrate the application. Three Gruno JPEGs are local-review-only and excluded from Git because redistribution rights are unconfirmed; a fresh checkout uses the existing missing-image fallback. See `public/photos/PROVENANCE.md`. These observations are **not current rental recommendations**. Demo decisions and profile live only in `localStorage` under `huurmonitor-demo-v1`; delete that key to reset. No analytics, source reads, Supabase calls or email in default demo mode. Opening an original advertisement is an explicit external navigation.

```sh
npm test       # offline matcher/state/outbox and representative parser fixtures
npm run test:corrections # targeted state/parser/private-load regression evidence
npm run test:scan # focused inventory pagination, failure preservation, facts and matcher tests
npm run check # one TypeScript check of frontend + shared + worker + tests, then production build
npm run build
npm run worker # safely exits without contacting anything by default
```

## What works locally

- New / Favourites / Dismissed / Profile. Desktop selectable list + property detail; mobile property profile.
- Six-second photo stories within the selected home only, segmented progress, previous/next/pause controls; reduced-motion starts paused. Hidden/offscreen/press and focus within the gallery pause playback. Leaving focus resumes only if not manually/reduced-motion paused; no photo timer selects another home. No horizontal photo swipe was added.
- Deliberate horizontal drag on the **labelled title/header surface only** favours/dismisses. Vertical scroll, photos, description, links and buttons do not decide. Buttons perform every gesture action. Persistent Undo/Restore, visible focus and live decision announcements.
- Full descriptions, explicit price breakdown, utilities and unknown facts. One neutral saved profile drives matching; no assumed personal budget or income. Demo persistence is real browser storage, separate from cloud state.
- Property facts include explicit wijk, housing type, original move-in wording plus an ISO calendar date when unambiguous, advertising agency and separately disclosed landlord. Agency/source is **not** assumed to be the owner. Unknowns remain labelled; no geocoding or new profile criteria. Listing email/phone contacts are not collected.
- Source messages, cost breakdown and criterion explanations are always visible, not accordions. User rule: no decorative/useless disclosures; dropdowns only for functional selection (the profile's native selects).
- Existing-user passwordless Supabase sign-in and private reads/profile/decisions are wired for manual cloud setup. No email/password form or signup.
- Conservative source discovery/detail parsers, failure-preserving reconciliation, meaningful-change events and transactional outbox code. These are **not proof of operational live delivery**.

## Readiness / source access

All automated source access is **off by default**. An owner must review permission/terms, robots rules, rate limits and applicable legal basis before enabling any source. Public visibility is not a data licence. Never bypass a 403, login, CAPTCHA or other access control.

| Source | Evidence and gate |
|---|---|
| Gruno | Public index and Petrus Campersingel detail read on 2026-11-11. Sanitized representative fixture verifies €805 already includes €75 advance. Review permission for automation and image redistribution before enabling/publishing. |
| Solide | Public index and three bounded details read on 2026-11-11. Fixtures verify base + service/energy, without adding aggregate service twice. **Terms explicitly restrict processing without written permission: obtain it before automatic ingestion. No permission is claimed.** |
| Maxx | Earlier detail requests returned HTTP 403 and were stopped. The first full attempt read 75 details but hit an old-template parser gap; one real page established the corrected Webflow template. The final user-authorized targeted recovery successfully read and imported only the missing 74, bringing known coverage to 75/75. Both rented promotional examples are stored but non-actionable. `maxx-live.html` is a sanitized real excerpt; older fixtures remain explicitly reconstructed. Access/data permission remains unresolved; no paid zoekopdracht, bypass or permission claim. |

Default mode remains first-page / at most 12 details and is labelled incomplete. **`SCAN_MODE=full`** follows recognized same-origin Groningen inventory pagination to termination, serially, with 30-page / 300-residential-detail safety caps per source and at least two seconds between requests (longer published Crawl-delay is respected). It deduplicates detail URLs and source external IDs, rejects cross-domain/non-inventory pagination, excludes explicitly nonresidential/other-city cards, detects repeated pages/next loops, and checks advertised card totals where exposed. It never crawls photos or arbitrary site links. Caps, parse gaps, unsupported links and read failures mean **partial**, never full.

Robots are checked first. A robots denial, 401/403/429 stops the affected source; no CAPTCHA/login/proxy/browser impersonation or redirect workaround. Other sources continue. Successful observations can persist even when a later detail fails; source status remains partial/blocked. Unread prior records and decisions are retained, never made unavailable merely because a source failed or an advert disappeared. Unknown source facts are not invented. The app exposes coverage/counts and field-unknown counts directly in source status. No daily schedule is enabled by a local full scan; Actions schedules can in any case be delayed or skipped. Robots permission is not a processing licence; Solide's written-permission prerequisite remains unresolved despite the user's instruction to attempt this scan.

### One explicitly requested full import, without changing saved flags

On Linux/bash, after source/access review and private Supabase configuration:

```sh
ENABLE_MONITORING=true SOURCE_ALLOWLIST=gruno,solide,maxx ENABLE_EMAIL=false SCAN_MODE=full npm run worker
```

Node's `--env-file-if-exists=.env` does not override already-set process variables; this precedence was checked before the requested run. This command does **not** edit `.env`, repository variables or schedules. `ENABLE_EMAIL=false` returns before owner-email lookup, digest claiming or sending. If the saved profile requests notifications, the atomic import may still queue pending events/digests; inspect that backlog before any later mail enablement. Never change the profile preference simply to hide queued events. Success is reported only after `apply_batch` commits; compare the owner-scoped stored counts afterward. No schema migration is needed: coverage, counts and added facts use existing JSON columns.

### First import attempt + initial repair — history, 2026-11-11

One full integrated attempt committed **60** homes. The allowed single focused Maxx repair read then committed **one** additional home through the same reconciliation/transaction RPC: **61 stored**, **7 then eligible in New**. At that point the three-source import was **not complete**; the later final recovery result is below:

| Source | Inventory pages | Residential details found | Detail HTML read | Stored / inserted | Available / unavailable / unknown | Coverage |
|---|---:|---:|---:|---:|---:|---|
| Gruno | 4 | 35 | 35 | 35 | 30 / 0 / 5 | Complete reachable inventory |
| Solide | 4 | 26 | 26 | 25 | 4 / 21 / 0 | Partial: one detail not parsed; 6 other-city/non-target cards excluded |
| Maxx | 1 | 75 | 75 + 1 focused repair read | 1 | 1 / 0 / 0 | Partial: 74 details remain unvalidated; 2 nonresidential cards excluded |

All rows were new (updated/preserved pre-existing observations: 0); the database was empty before this scan, so preservation of existing real favourites/dismissals was not exercised at runtime. The saved profile checksum stayed unchanged. Owner-specific post-import reads confirmed 61 homes, 7 immutable event rows, **0 outbox rows and 0 sent digests**. No second global scan, source failure→unavailable inference, source accounts, schema changes, or schedule enablement. `.env` monitoring/email remain false and its source allowlist empty.

Field coverage: 13 explicit neighbourhoods (48 unknown), advertiser labelled for all 61, **no separately disclosed landlord** for any of these records, housing type known for 58 (3 unknown), original move-in wording retained for all 61, unambiguous ISO move-in date for 32. Direct/negotiable/other wording is not converted into an invented date. Maxx repair retained eight actual source photo URLs, without fetching photo files. Only available homes meeting the saved profile enter New; inactive and uncertain observations are stored without being made actionable.

Local `http://127.0.0.1:5175/` and its current property/status module returned HTTP 200. This was a cheap local integration check, **not authenticated browser verification** or a new screenshot/design pass. At this historical point one Solide and 74 Maxx details still needed recovery; no fixture was used to populate the real database.

### Final targeted recovery — 2026-11-11

The final explicit allowance recovered **only** the missing Solide 1 + Maxx 74, transactionally adding **75** observations. **136 total stored; 30 currently qualify for New under the unchanged saved profile.** All known discovered residential targets are now accounted for, including inactive observations:

| Source | Previously stored | Recovered | Total / known targets | Available / inactive / unknown | Coverage |
|---|---:|---:|---:|---:|---|
| Gruno | 35 | 0 | 35 / 35 | 30 / 0 / 5 | Complete; no Gruno requests or status changes |
| Solide | 25 | 1 | 26 / 26 | 4 / 22 / 0 | Complete for the known inventory |
| Maxx | 1 | 74 | 75 / 75 | 70 / 5 / 0 | Complete for the known inventory |

Original full-attempt detail bodies and its failed-URL manifest had not been retained; only an earlier Maxx inventory index remained. Consequently four Solide inventory pages and one Maxx inventory page were read **solely to identify missing URLs against stored records**, not to refetch imported homes. Maxx's 75 targets matched the retained earlier index exactly. Only the 74 missing Maxx details were then requested serially, with robots/rate checks; no access denial or new parser failure occurred. The one missing Solide response was fetched once during diagnosis and replayed locally during recovery. No second all-source scan and no Gruno fetch.

The Solide root cause was a legitimate `Verhuurd` listing with an ID, structured facts and an empty description card. A narrowly guarded fallback now says **“Beschrijving niet vermeld door de bron.”** without inventing a bio or dropping the inactive listing. One focused regression passed and the retained real response parsed successfully; no broad test/build/browser/screenshot rerun. Other layouts still require recognizable description/structure and do not silently become listings.

Owner-scoped readback confirmed the saved profile unchanged, **all 61 pre-existing decisions unchanged**, 30 immutable event rows, **0 outbox rows and 0 sent digests**. Both Maxx promotional examples are present and non-actionable. Source reports retain `previousAttempt` counts/errors and record recovery targets, completed counts and zero remaining known gaps; original failed reads are not rewritten as historical successes. Ignored `data/last-recovery-*.json` files retain the normalized recovery observations and sanitized result/verification evidence; never publish datasets or runtime artifacts.

Final normalized field unknowns remain honest: 119 neighbourhoods, 136 separately identified landlords, and 5 housing types are unknown; this is not proof that the websites contain no further information. Advertising agency is not treated as property owner. Move-in wording is preserved without turning direct/negotiable wording into an invented calendar date. Completeness refers to these **known inventory snapshots**, not hidden/new inventory or guaranteed present availability. Website processing permission is not claimed. Email, monitoring flags and the saved allowlist remain disabled/empty; scheduling is not configured. Use **Vernieuwen** in the signed-in app at `http://127.0.0.1:5175/` to load the complete persisted dataset and current matches.

## Private cloud setup — manual setup and verification boundaries

1. Create your own **free** Supabase project only after deciding to proceed. Disable public signups; manually add one Auth identity. Do not use rental-source accounts.
2. Run `supabase/schema.sql` in that project's SQL editor once (fresh-project migration). Provision that identity's profile using the commented neutral-profile insert and its UUID. No personal profile values are pre-filled.
3. Configure Auth Site URL and the exact local allowed redirect URL as `http://127.0.0.1:5175/`; add the final Pages URL only after separate execution authorization. Choose an email template with magic link or email OTP; the UI handles a link callback and optional code. Built-in Supabase SMTP is best effort, **owner/team-address only, around 2 emails/hour**. Do not assume public-user production mail delivery.
4. Copy `.env.example` to `.env`. For the browser set only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (prefer `sb_publishable_`; legacy `anon` JWT allowed). Other key types are rejected by the browser helper. **Never put a service-role/secret key in a `VITE_*` variable, frontend code, Pages assets or repository history.** Restart Vite after changing configuration.
5. Sign in using the existing allowed email. This action intentionally requests a real Auth email. It was not executed during development. Missing provisioned profile/RLS/schema shows a recoverable error, not sample private data.
6. Read-only worker access to the provisioned owner profile/five tables and anonymous read denial have passed, and all five RPCs appear in metadata. Still verify authenticated browser owner-only reads, second-user isolation and concurrency before relying on them; metadata is not RPC execution proof. No account creation, SQL mutation or schema migration is performed by the scan command.

RLS is enabled on every browser-visible table. Authenticated users have owner-only SELECT; direct table writes are revoked. Only `save_profile(config)` and `set_decision(key,decision)` are browser-executable security-definer functions, bound to `auth.uid()`. Worker RPCs are service-role only with a fixed empty search path. The backend key must be scoped operationally to this personal project and explicitly targets `OWNER_USER_ID`.

Private profile/state never enter the static bundle. Supabase's session token is stored by its browser SDK; do not use a shared browser session. Sign out before lending a device. Auth/mode/unmount boundaries invalidate pending private loads synchronously; late responses cannot render in demo or enter demo localStorage. Newer refreshes also supersede older loads. Private profile/decision completions are scope-guarded too. Refresh reloads cloud changes from another device. Realtime subscriptions are not included.

Supabase Free may pause after one inactive week and has **no free backups**. Arrange your own private exports/recovery before relying on it. Data deletion: remove the Auth owner to cascade profile/home/event/outbox rows, and remove local demo storage independently. No backup, paid plan or automated export has been configured.

## Matching and meaningful changes

### Property map: source points, automatic loading

The existing property detail has a direct **Locatie op kaart** section. Valid source-published points are labelled **“Locatie volgens de bron”** (exact doorway not confirmed). Per the superseding user request, the OpenStreetMap iframe **loads automatically with the selected advertisement**, including in demo; there is no load button. The disclosure explains this automatic external request: OSM receives IP and viewed location—not the search profile. Selecting another property/point replaces the embed. The native embed and ordinary larger-map link use coordinates only; the iframe sends no referrer. Missing points show **“Locatie op kaart niet beschikbaar”** and retain the original advertisement link. No address geocoder, key, paid API, new dependency, new swipe surface or redesign. Official CBS classification is separately worker-cached, as described below.

Only Gruno's inline `window.MAP_POC_CONFIG.listing.lat/lng` is currently supported; extraction is static, scoped, finite/bounds-checked and rejects ambiguous assignments/properties. Solide/Maxx are not guessed or rescanned. `Listing.location` is optional JSON metadata with source provenance and unknown precision, so old rows stay safe. See [the source contract](docs/sources/gruno.md#source-coordinate-map-extension). Map enrichment does not reparse rent, change matching or create match events.

Map enrichment completed 2026-11-12: **35/35 stored Gruno listings now have source coordinates**, using **1 identity-checked cached page + 34 serial live detail reads**, no failures/unknown points and no inventory crawl. Owner-scoped readback verified every nonlocation home field (including evaluations, decisions and historical snapshots), profile config, non-Gruno homes, all source runs, events and outbox unchanged. Only the existing optimistic transaction version advanced once. **0 events/outbox entries created; no sending or other-source requests.** Five focused map tests and one typecheck passed for the original click-to-load implementation. Its isolated local-demo desktop/mobile checks covered the former consent gate, selection reset, unknown-location wording, unchanged decisions and no overlap with reserved actions/navigation. OSM embed returned HTTP 200 at both sizes; a targeted attribution inspection resolved the test's overly exact link-name lookup (“OpenStreetMap contributors”). These are historical checks, not verification of automatic loading. The subsequent automatic-loading change updated the initial-markup assertion and was verified by scoped diff inspection only, without test/type/build/browser reruns, source reads or database writes.

### Official buurt/wijk: PDOK / CBS 2026

The existing fact grid separately shows **Wijk volgens advertentie**, **Buurt (CBS)** and **Wijk (CBS)** with linked **CBS Wijk- en Buurtkaart 2026, via PDOK — CC BY 4.0; bepaald uit broncoördinaten** attribution. Unknowns say **Niet bepaald**. Source neighbourhood wording is never overwritten; these are not new matching/profile criteria. Automatic OSM behavior is unchanged, with no per-render PDOK requests or new controls/layout.

The worker performs one polygon-intersection request per uncached unique **source-published longitude/latitude** pair to the pinned 2026 dataset/version 0. It validates exactly one containing nonwater feature, both named/code levels, municipality hierarchy and year/geometry; missing, ambiguous, malformed or failed lookups remain unknown. No addresses, owner/profile data or emails leave for PDOK. Metadata is optional listing JSON, reused across listings/runs at the exact same point/year/version. Known cache TTL is 30 days, valid negatives 7 days, failures 1 day; failed refreshes retain a previously valid same-point classification with an explicit failed-recheck note. Serial 2-second spacing, 15-second timeout, no retries and a transport-failure circuit stop are client precautions, not a published provider traffic/SLA guarantee. No schema, dependency, scheduler, email or environment-flag changes. See [the full source/cache contract](docs/sources/pdok-cbs.md).

Completed one live enrichment pass (2026-11-12): **35 source points / 35 unique queries, 0 cache hits, 0 rental-source requests**. Final persisted known buurt+wijk coverage: **Gruno 35/35**, **Solide 0/26** and **Maxx 0/75** (the latter two have no source coordinates and stay unknown). Initial validation rejected the service's string year and numeric-altitude geometry; two focused regressions and offline validation of all saved responses corrected this **without additional requests**. Two geography-only optimistic writes were needed; final readback confirmed every nongeography home field, profile config, coordinate-less home, source run, event and outbox entry unchanged. **0 new events/outbox entries or sends.** Example: preserved advertisement **Oosterparkwijk**, separately CBS **Gorechtbuurt / Oud-Oost**, for Petrus Campersingel 145A. Nine initial focused tests and one typecheck passed; two affected validation regressions passed after the schema correction. No broad suite/build/browser rerun.

### Gruno price extraction and presentation

The Gruno-only field/selector contract is in **[docs/sources/gruno.md](docs/sources/gruno.md)**; its active adapter is `worker/gruno.ts`. It scopes features to `#tabs-2 table.feautures`, crosschecks the advertised amount with the main property summary, reads the complete `#tabs-3` bio and uses explicit financial sections rather than unrelated page tables. Raw advertised notation/qualifiers remain separate from derived costs. Conflicts become unknown, not last-row-wins. Schildersbuurt is explicitly recognized from the Locatie passage.

Initial owner-scoped public-price diagnosis on 2026-11-12: **35 Gruno records, 0 missing advertised amounts, 11 missing confirmed monthly amounts, 35 missing explicit base rents**. Thus the observed “missing price” was not a lost headline in these stored records. Actual retained Ripperdalaan 3 (`01838`) evidence also disagrees: advertised €637.62 versus room-2 description €637.32. That is not silently resolved into a confirmed total. Generic exclusive rent wording without an established cost basis remains unconfirmed too.

User-approved **Gruno-only** display fallback: **“Geadverteerde huurprijs” / “kostenbasis niet bevestigd”** when `knownMonthly` is unknown but the advertised amount is unambiguous. Detail, list and the existing cost breakdown show this distinction without new design or disclosure controls. Matching remains unchanged: base-budget criteria still require explicit `rent.base`, monthly-budget criteria require `rent.knownMonthly`; the presentation helper never promotes headline to either. No price is inferred by subtracting an included advance, and included service costs are never added twice. Solide/Maxx parsing and price presentation are unchanged.

Completed bounded refresh (2026-11-12): **33/35** stored Gruno URLs updated, **2 preserved unread**, coverage **partial**. Owner-scoped database readback confirms advertised amounts **35/35**, confirmed monthly amounts **20/35**, explicit base rents **1/35**, and raw advertised notation **33/35**. Confirmed-monthly unknowns increased **11 → 15** because stricter evidence handling no longer promotes ambiguous advertised rent into a confirmed total; base unknowns decreased **35 → 34**. Advertised-price coverage did not regress. Korreweg 183-B (`01814`) failed its representative read (original error code unavailable); Ripperdalaan 3 (`01838`) failed with `network`. Neither was retried or marked unavailable because of that failure.

Preservation readback verified the profile, all Gruno decisions, every non-Gruno home and both other-source run records unchanged (home comparison accounts for row ordering). Total stored homes remain **136**. Refresh produced **0 matching events**, with **0 outbox entries created and 0 sent entries since the first same-pass detail read**. No other-source requests, inventory crawl or sending was attempted. Focused Gruno tests passed (11 cases), as did `npx tsc --noEmit`; a subsequent focused conflict/date/status regression passed too. Retained real Petrus and Jozef HTML validated the adapter offline. No broad suite, build or new browser/screenshot round was run.

Prices use integer cents. `base` is explicit base rent only, not reverse-engineered from a rounded headline or included advance. `knownMonthly` is a confirmed subtotal of stated monthly components, **not an all-in claim**. Aggregate service costs and their itemized energy/service breakdown are alternatives, not additive duplicates. Missing required monthly figures produce unknown totals; excluded/unspecified utilities and other costs stay visibly uncertain. Energy advances are not promises of final consumption cost.

Hard criteria return pass/fail/unknown: city, active availability, optional min/max rent on the chosen basis, min area/bedrooms, housing types, and optional explicitly stated absolute income threshold. Ratio-based or unclear income requirements remain unknown rather than being guessed. No income requirement stated does not mean no requirement. Unknown hard facts do not qualify unless the owner explicitly opts into uncertain matches. Unknown availability never qualifies.

First qualification, previously failing/unknown becoming eligible (including corrected facts or saved-profile changes), comparable known-monthly price reduction with unchanged coverage, and explicit unavailable→available generate a new immutable per-home revision. Cosmetic text/timestamp changes do not. A favourite stays favourite; a dismissed home may return to New on such an event. The most recent dismissal's original listing/evaluation snapshot remains saved. Restore does not force a home failing today's requirements into New. Dedup uses owner + source external ID; cross-source equivalence is never guessed.

Price-drop comparison requires the same calculation basis **and explicit unchanged gas, water, electricity and internet coverage**. Unknown/conflicting or legacy missing coverage blocks a drop alert; a lower headline with internet/electricity removed is not treated as a saving. Component facts are parsed from inclusion/exclusion clauses and included in the cost note; uncertainty is not a cosmetic hash difference.

`set_decision` locks and snapshots the database's current profile plus stored listing facts as a trusted acknowledgement baseline. It accepts no client-supplied evaluation/profile/facts. The worker evaluates this baseline before detecting new qualification, then consumes it. Dismissing after a profile save therefore cannot be resurrected by an older failed worker evaluation. A genuinely later qualifying change still counts. SQL stores a dismissal evaluation as null until the worker derives it from the preserved trusted profile/listing, rather than recording a false stale assessment.

The browser immediately evaluates all current facts against a saved profile. **Cloud resurfacing decisions/events are persisted by the next worker run**, not a privileged browser write; a dismissed home may therefore return at that run. Demo reconciliation is immediate. Initial eligible inventory creates first-match events; if email preference is already on, this first run queues a digest. Keep it off until you have reviewed the first import.

## Enable the worker only after access review

Local `.env` or GitHub configuration:

```dotenv
ENABLE_MONITORING=true
SOURCE_ALLOWLIST=gruno
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-WORKER-ONLY-KEY
OWNER_USER_ID=YOUR-EXPLICIT-AUTH-UUID
ENABLE_EMAIL=false
```

`SOURCE_ALLOWLIST` accepts `gruno,solide,maxx`; **do not enable Solide without written permission, or Maxx without access/permission resolution**. An empty allowlist or monitoring flag off exits before any external call. No sample ingestion option touches the database.

`.github/workflows/monitor.yml` is a local artifact only. When the user separately authorizes operational setup, set repository **variables** `ENABLE_MONITORING`, `SOURCE_ALLOWLIST`, `ENABLE_EMAIL`, `EMAIL_TRANSPORT`; set **secrets** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID`, and transport-specific mail values below. The whole job is gated off without opt-in. The existing daily UTC 07:17 cron template has not been activated; standard `ubuntu-latest` runner, read-only repository permissions, serialized runs, no billing/large runner or write-back. No deploy in this workflow. Public Actions logs print source outcomes/counts, **not profiles, addresses, recipient emails or secret keys**. Do not add private debug logging.

## Email — Gmail selected, disabled until credential setup and explicit test

The user selected **Gmail SMTP**, not a domain/Resend setup. Local transport support is implemented; the Google app password has **not** been confirmed ready. No Gmail connection, SMTP verification, account provisioning, inbox read, test email or cloud mutation was performed for this implementation. Gmail does not require this app to configure DNS or purchase a domain. Google account policy, quotas, spam filtering and delivery still apply; neither permanent free capacity nor inbox delivery is promised.

### Local credential setup (do not put credentials in chat)

1. In your own Google account, enable **2-Step Verification**, then create an **App password** for Huurmonitor. Google may hide/disable this for managed accounts, Advanced Protection or other account policies; stop rather than bypass them. Use an app password, **not your normal Google password**.
2. In the existing ignored local `.env`, fill only these worker settings (blank placeholders may already be present):

   ```dotenv
   EMAIL_TRANSPORT=gmail
   GMAIL_USER=your-authenticated-Google-email
   GMAIL_APP_PASSWORD=your-16-character-app-password
   ```

   Google's grouping spaces are accepted in memory; the configured value is never rewritten/logged. Never prefix these with `VITE_`, commit them or paste the app password into chat. Existing Supabase/owner configuration stays unchanged. Do not copy `.env.example` over an already configured `.env`.
3. Leave **`ENABLE_MONITORING=false`**, **`ENABLE_EMAIL=false`**, the current source allowlist and profile preference unchanged during setup. Missing/invalid Gmail configuration produces a sanitized actionable error before any SMTP contact. No `verify()` or diagnostic connection is made automatically.
4. Confirm **only that setup is ready**, without sharing the password. The previously approved single test is still pending that confirmation. The planned test is **one isolated Gmail message to the provisioned Auth owner's email**, resolved through the existing admin configuration, not an arbitrary recipient. It will not run ingestion, claim/drain the outbox, change profile/flags, or enable a schedule. No send-test command is supplied/executed at this stage; **do not use `npm run worker` as a test-email command**.

For separately authorized future Actions setup, put `GMAIL_USER` and `GMAIL_APP_PASSWORD` in **Actions secrets**, and `EMAIL_TRANSPORT=gmail` in **Actions variables**. The local workflow now passes them explicitly, without enabling the job or changing its gate/cron/concurrency. No repository/cloud secret was created here.

### Runtime gates and delivery safety

Normal worker mail still requires `ENABLE_MONITORING=true`, a reviewed nonempty source allowlist, worker `ENABLE_EMAIL=true`, the **saved profile's email preference**, configured explicit `EMAIL_TRANSPORT`, and the provisioned Auth owner's email. Sender is exactly authenticated `GMAIL_USER`, never `EMAIL_FROM`; recipient comes from that owner account, never the frontend or an `EMAIL_TO` override. Gmail uses `smtp.gmail.com:465`, implicit TLS with certificate validation/TLS ≥1.2, no connection pool, 10s connection/greeting and 30s socket timeouts, no protocol/debug logging and no provider fallback. Message-ID is stable tracing only, **not SMTP deduplication**.

State, immutable unique events, and pending digest commit in the existing Postgres RPC transaction before normal worker sending. Service-role delivery code (`worker/delivery.ts`) sends at most **one digest per run**. The early profile read is only an optimization: **`claim_delivery_digest` locks the owner's profile row, checks the current boolean email opt-in and conditionally claims the owner/id/status/previous-token/timestamps in the same transaction**. The lock order matches `save_profile`/decisions/ingestion. SQL independently accepts only pristine pending rows or marked, in-window same-provider Resend retries; SMTP/unknown-provider attempts cannot be reclaimed. It generates the token/lease using server time and returns at most one row. Provider markers still use `last_error`; no table is added. Successful SMTP acceptance uses the existing owner/token-scoped `finish_digest` success path.

**Required activation precondition for the existing database:** a trusted administrator must later apply **`supabase/migrations/20261112_atomic_delivery_claim.sql`** manually before enabling normal worker mail. This migration artifact has **not been executed**. Do not rerun the fresh-table `supabase/schema.sql` on an existing installation; fresh installations already include the identical function. The new RPC has an empty search path, revoked PUBLIC/anon/authenticated execution and a service-role-only grant; browser privileges are unchanged. The worker fails closed on missing/failed RPC, without a direct-update or legacy-claim fallback. Keep flags disabled until this separate migration/setup step is complete.

A completed opt-out while the Auth lookup is pending prevents a later new claim. The profile row lock serializes a racing opt-out and claim: an opt-out that commits first is observed before any outbox claim; if claiming wins first, the opt-out waits for that transaction to finish. This boundary cannot recall a message already claimed before the opt-out—SMTP sending occurs after the database transaction, not while holding a profile lock over the network.

Atomic-claim fix verification: **12/12 affected delivery tests and `npx tsc --noEmit` passed**, including the pending-Auth opt-out race for Gmail/Resend, competing claims, missing-RPC fail-closed behavior, SMTP ambiguous/accepted-but-unacknowledged outcomes, provider-switch safety and SQL static lock/ACL/parity assertions. Prior transport tests and the successful production build are reused; no full build or live SQL/concurrency/SMTP check was repeated.

**SMTP cannot guarantee exactly-once delivery.** Any Gmail failure (including connect/auth failures treated conservatively), ambiguous DATA timeout/disconnect, or unclassified outcome stops at **`review`**, never automatically back to pending. If SMTP accepts but the database acknowledgement fails, the row stays sending; after lease expiry it becomes review without resending. A crash after claiming can therefore require manual review even when nothing was delivered: avoiding accidental duplicates is preferred. A stable Message-ID does not make a retry safe. Do not reset review/sending rows or invoke the old SQL `claim_digest` directly for Gmail; it was designed for Resend retries. After inspecting the provider/account outcome, any manual resolution is a separate explicit operation.

### Explicit Resend alternative and provider switching

Resend remains supported **only** with `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY` and `EMAIL_FROM`; there is no automatic fallback in either direction. `onboarding@resend.dev` is restricted testing, not a production domain sender; Resend domain verification would require separate authorization and is not the selected Gmail route.

Same-provider, marked Resend attempts reuse the immutable digest UUID as the same `Idempotency-Key`, with the existing lease and **23-hour** retry cutoff. Old unmarked attempts, attempted rows from another provider, expired Gmail sends and uncertain/malformed queue state become review before any new send. Only unattempted pristine pending rows are freely eligible when switching providers; never assume an attempted Resend digest is safe to resend through Gmail (or vice versa). An unexpired sending lease is never stolen. Legacy attempted rows without a trustworthy provider marker deliberately lose automatic retry eligibility. Keep old worker versions/manual legacy claim calls off when using the new queue path.

Outbox status is visible privately in the app. Provider response/DB acknowledgement do not prove inbox arrival. Turning email off prevents sending; events produced while the preference is off are not later swept into mail. Already queued digests remain queued—review them before re-enabling. No automatic backlog expiry or management UI is supplied in this MVP.

Local Gmail implementation evidence (no live provider/database calls): **14 focused mocked tests passed** across transport gates, strict TLS/auth/sender, one owner recipient, sanitized errors, conservative SMTP review, failed success acknowledgement, expired leases, competing conditional claims, provider switches and Resend stable-key retries. The first `npm run check` stopped at a possibly undefined SMTP accepted-address value; after the explicit guard, a separately authorized closure check **passed TypeScript and the Vite production build (83 modules)**. That build evidence is reused for the later worker/SQL-only opt-out fix, not rerun. The atomic-claim fix adds a controlled enabled→disabled-during-Auth regression for both providers, missing-RPC fail-closed coverage, and static assertions of the actual SQL profile-first lock, current opt-in, provider/row eligibility, empty search path, restricted ACL and fresh/migration parity; mocks alone do not prove PostgreSQL concurrency. SQL has not been executed locally or in the cloud. No SMTP connection/verify/send, Gmail contents read, real owner lookup, cloud mutation, browser check or source scan was performed. Existing local `.env` settings were preserved; only missing `EMAIL_TRANSPORT=gmail` and blank Gmail credential placeholders were appended in the earlier transport task. This fix changes no flags, source allowlist, profile, schedule, DNS or publication state.

## GitHub Pages — public-source choice accepted, execution not authorized

GitHub Pages on Free requires a **public repository and public frontend**. The user explicitly accepts eventual public frontend/source with private data protected. This is **not authorization to publish now**. The Auth backend can remain private, but frontend source, demo facts and bundled assets would be public. The user has authorized local Git initialization and separate local snapshot commits only, not remote repository creation or push. **Do not publish until a separate execution instruction and source/photo redistribution review**; local photos are excluded from Git and have no established republication licence. Demo source-description redistribution still needs review. Never publish real datasets, private profiles, `.env`, worker keys, exports, diagnostics with PII or a private reference image.

The optional local `pages.yml` artifact is manual-only, further gated by `ENABLE_PAGES=true`, and uses public Supabase variables only. After separate execution authorization: configure Pages for Actions, set public frontend variables, review the built `dist`, and explicitly dispatch it. The app uses relative Vite assets and no path-router so a project Pages subpath works. Register that exact URL in Auth. There is no deployment permission implied by including the template.

## Evidence and remaining limits

- 14 offline tests initially passed: unknown facts, cost double-counting, corrected facts, price comparability, reavailability, source failure, cosmetic edits, dismissals, profile change, immutable retries and mocked outbox send gates. Fixtures do not establish scraping permission or future source stability.
- Approved correction pass: `npm run test:corrections` passed **19/19** targeted state/parser/private-load tests, including profile-save→dismiss→worker, later legitimate resurfacing, changed/unknown/conflicting cost coverage, and controlled deferred private replies after signout/demo/auth/unmount/newer refresh. These exercise shared code/helpers, not live Supabase. Two added Gruno fixture variations are explicitly synthetic regressions, not fresh listings. Existing outbox test evidence is reused; no broad suite rerun.
- The correction pass's single `npm run check` passed TypeScript across frontend/shared/worker/tests and the Vite production build (79 modules; 254.65 kB JavaScript before gzip). The earlier callback type error was already corrected.
- Historical default worker run confirmed disabled/no-contact behavior. Later read-only backend checks confirmed provisioned profile/tables and anonymous denial. Authenticated browser authorization, second-user isolation, concurrency, provider delivery and scheduled execution are not established by those checks.
- Single additional approved final capture batch: `.impeccable/review/desktop-corrected.png` (1440×1000) and `mobile-corrected.png` (390×844), both opened and confirmed valid. **Listed gallery defects resolved:** photo/gallery widths both 836px desktop and 390px mobile; three visibly backed 4px progress tracks on each. Keyboard focus paused for >6 seconds, transfer within controls remained paused, exit resumed when enabled, and manual/reduced-motion pause was retained. No page errors or horizontal overflow in that batch. DOM/code inspection found **zero details/summary/aria-expanded disclosure controls**; meaningful source, cost and match content is direct. Below-fold content was not reclassified as missing. No horizontal photo swipe or unrelated polish was added.
- Earlier favourite/reload/dismiss/restore/profile interaction evidence is reused. A previously recorded 1px desktop viewport/action-border boundary overlap was not part of this correction scope and was not re-audited. Coordinator's advisory reviewer/designer still own their listed-fix scoring; these results are implementation evidence, not independent approval.
- This is a lean personal MVP: full mode is complete only for inventory routes actually reached/interpreted without caps/blocks/gaps. No completeness guarantee for hidden or inaccessible inventory, no realtime or operational sender. Maxx reconstructed fixtures alone never establish live detail compatibility. Historical public observations are not a freshness promise; inspect each current source-run coverage report.
- Full-scan verification: 24 focused inventory/parser/state cases were exercised; 22 passed initially, two malformed synthetic multi-card fixture layouts were corrected and only those two rerun successfully. One combined `npm run check` passed. After the observed live Maxx parse failure, two targeted Maxx parser tests and a worker-parser-only TypeScript check passed; there was one affected-page refetch/repair import, no second global scan or frontend rebuild loop. Older UI/outbox/privacy evidence was reused at its unchanged scope. Live `apply_batch` commits and owner-scoped result counts are now verified; concurrency/second-user browser isolation and mail delivery remain unverified.

## Project map

`src/` UI, demo and public-client configuration; `shared/` normalized model, matching and state transitions; `worker/` adapters, ingestion, persistence runner, provider-aware delivery claims and Gmail/Resend transports; `supabase/schema.sql` tables/RLS/RPCs; `tests/fixtures/` sanitized/reconstructed minimal HTML; `.github/workflows/` inert-until-configured templates; `DESIGN.md` and `.impeccable/` development design context. The initial local history groups the final implementation into logical file snapshots; intermediate commits are not claimed to compile independently or recreate the feature-development chronology. No remote/push/publication is authorized or implied.
