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
