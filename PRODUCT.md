# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Approved free-tier-only architecture: React/Vite/TypeScript static frontend on GitHub Pages, Node/TypeScript ingestion through standard GitHub Actions runners, private Supabase Auth/Postgres, optional Gmail SMTP email (selected), with Resend retained as an explicit alternative. One saved profile controls review and notifications. The user manually provisioned Supabase; worker read access and anonymous denial have been checked. Daily scheduling, publication and actual mail remain disabled/unverified.

## Users

One private user looking for rental housing in Groningen city, using both mobile and desktop browsers.

## Product Purpose

Bring rental options from Gruno Verhuur, Solide Verhuur and Maxx (maxxhuren.nl) into one place. Match new listings to saved requirements and deliver automatic notifications.

## Operating Context

Initial monitoring cadence: daily. The user reviews matching properties and opens original advertisements. Start with email notifications. SMS was raised as a question, not selected; Telegram is an optional alternative, not an approved dependency.

## Capabilities and Constraints

- A saved requirements profile must drive filtering and notification matching.
- Profile criteria: Groningen, optional min/max rent with explicit base/known-monthly basis, min area, min bedrooms, housing types and optional explicitly stated income requirements. Start neutral without assumed personal budget/income. Unknown hard facts are excluded unless explicitly opted in; unknown availability never qualifies.
- Show rent components distinctly; never add an already included service advance twice or label incomplete costs as all-in.
- Do not treat an omitted income requirement as absence of a requirement.
- Preserve the advertisement's neighbourhood wording separately. User-approved official **Buurt (CBS)** and **Wijk (CBS)** use a worker-side PDOK/CBS 2026 polygon intersection at source-published coordinates only, with cached year/provenance/licence and honest unknowns; no street/address geocoder or browser geolocation. These are not new matching criteria and never overwrite source wording. Show advertising agency/source separately from an explicitly disclosed landlord, never assume agency equals property owner. Reuse housing type and move-in wording; normalize a calendar date only when unambiguous. No publication-date substitution or personal phone/email collection.
- Read descriptions as well as structured fields: advertisements can have conflicting availability labels.
- Source integration reliability and permitted access remain unresolved. No bypass of access controls is authorized.
- Scheduled execution, persistence, deduplication, private cross-device profile editing and transactional email outbox are implemented but require manual cloud setup and runtime verification.
- Eventual public frontend/source is acceptable to the user, with private data protected. Local Git initialization, GitHub-account-derived repository-local identity and separate local snapshot commits are now explicitly authorized. Remote GitHub repository creation, push, publication, deployment, DNS changes, new sends, workflow activation and purchases are not authorized by this local commit task.
- The user owns a DNS-editable domain. No sender domain verification or DNS configuration has been performed; permanent zero-cost production email is not promised.
- Gmail SMTP local support is approved; account/app-password readiness is not yet confirmed. A single isolated test email is approved only after that confirmation, not a source scan/queue drain. Never request the app password in chat. SMTP uncertain delivery stops for manual review; no exactly-once promise, provider fallback, DNS setup or schedule activation.
- The user explicitly requested one full three-source inventory import into the configured owner database with email off. Full mode traverses recognized inventory pagination with serial requests, robots checks and hard safety caps; blocked/partial sources must be labelled honestly. Valid observations survive later detail failures; unread/disappeared homes are not made unavailable. This is not authorization to enable scheduling or assert source permission.

## Brand Commitments

No product name or visual identity chosen. `huurmonitor` is the working folder name only. Code-first design workflow selected; implementation must follow the agreed visual direction.

Durable user rule: no decorative or useless accordions/disclosures. Useful source messages, cost facts and match explanations are directly visible, not hidden behind a control. Dropdowns only serve a genuine selection function; native profile selects may remain.

## Approved Review Experience

- Open on new matches.
- Mobile uses a Tinder-like property profile: swipe right to favourite, left to dismiss. Dismissed listings remain saved in a separate collection and can be restored.
- Story-style property photos automatically advance within the current property. Below them show a property title, rent, surface, move-in date, utilities inclusion, bedroom count and relevant available facts, followed by the full description.
- Provide explicit buttons and undo so gestures are never required.
- Desktop uses a listing column and selected-property detail pane.
- The selected advertisement automatically loads an OpenStreetMap iframe when valid source-published coordinates exist, including in demo; no “Kaart laden” gate. Disclose the automatic IP/viewed-location request, never send the search profile, and label source precision as unknown. Keep native attribution, the larger-map link and honest missing-location text. PDOK/CBS classification is separately worker-cached; no extra map changes or per-render geography queries.
- Dismissed listings may return to New for any newly qualifying meaningful change: corrected facts/profile change from fail/unknown to eligible, comparable monthly price reduction with unchanged explicit cost coverage, or confirmed unavailable→available. Cosmetic edits do not count. A later explicit user decision acknowledges the facts/profile applicable then and is not overridden by stale last-worker evaluation. Favourites stay favourites.
- The user-pinned property-profile direction overrides the generated direction assignment (seed 15af0990). No visual mockup was requested; code-first remains selected.

## Evidence on Hand

Local application, sanitized Gruno/Solide fixtures, reconstructed Maxx regression fixtures, focused pagination/failure/fact tests and prior desktop/mobile demo captures exist. Public observations are not proof of continuing availability or permission. Maxx previously returned detail 403; no bypass was attempted. The configured owner's profile/tables were read successfully; anonymous reads denied and RPC metadata present. Those checks do not prove authenticated browser isolation, second-user authorization, transaction concurrency, scheduling or mail delivery. See README for the separately authorized full-import outcome.

Requested one-time full attempt (2026-11-11) plus one allowed focused Maxx repair persisted 61 observations: Gruno 35 complete, Solide 25 partial (one unparsed detail), Maxx 1 partial (74 not revalidated after template correction). Owner reads confirmed 7 currently eligible New homes, unchanged saved profile, 7 event rows and no queued/sent digests. No prior homes existed to exercise decision preservation at runtime. Scheduling stays off; no email or second global scan. Added facts remain unknown when not explicitly disclosed; agency never substitutes for actual landlord. See README for exact counts and verification limits.

## Product Principles

- One understandable profile controls matching and notifications.
- Make cost and eligibility uncertainty visible.
- Show genuinely actionable listings rather than trusting availability badges alone.
- Keep the first release personal and limited to three sources; scale later.

## Open Decisions

- Source access permission, especially written Solide processing permission, and authorized Maxx detail validation.
- Provider setup/credentials, owned-domain sender verification and actual free-tier feasibility; no DNS/send actions yet authorized.
- Manual cloud provisioning, owner-only access/concurrency checks and eventual separately authorized publication. Public hosting acceptance is not execution permission.
- Dutch is the current disclosed default; personal criteria remain neutral until the user saves them. First eligible inventory can notify only if the email preference and explicit configured worker send flags are on; review initial import before enabling.
