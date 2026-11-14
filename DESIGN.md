---
version: beta
name: EarthTrend Lab
description: A calm, light-first research workspace for reading satellite-era land-surface change. White surfaces, generous air, one indigo action colour, and provenance marks on every data-bearing surface.
colors:
  paper-bg: "#F6F7FB"
  surface: "#FFFFFF"
  ink: "#0E1526"
  muted: "#5B6478"
  faint: "#666F82"
  action: "#3B4FE0"
  accent-soft: "#EEF1FE"
  forest-bg: "#0B0F1A"
  forest-surface: "#111726"
  forest-ink: "#E8ECF5"
  warn: "#B45309"
  danger: "#DC2626"
typography:
  display:
    fontFamily: Inter Tight
    fontWeight: 600
    letterSpacing: -0.035em
    lineHeight: 1.04
  body:
    fontFamily: Inter
    fontWeight: 400
    size: 14px
    lineHeight: 1.55
  numeric:
    fontFamily: Inter
    fontVariantNumeric: tabular-nums
    fontWeight: 500
  micro-label:
    fontFamily: Inter
    size: 10.5px
    weight: 500
    letterSpacing: 0.07em
    textTransform: uppercase
rounded:
  panel: 20px
  card: 16px
  control: 10px
  inner: 8px
spacing:
  xs: 6px
  sm: 10px
  md: 16px
  lg: 28px
  xl: 40px
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    height: 36px
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    border: 1px solid rgba(14, 21, 38, 0.07)
---

## Overview

EarthTrend Lab is a browser-only research workspace built around an illustrative
land-surface-temperature case study. Its audience is an analyst, student, or reviewer
who must be able to tell a demonstration from an observation at a glance.

The look is a clean instrument panel: cool paper-white surfaces, a single indigo
action colour, slate secondary text, and hairline rules that separate regions instead
of stacking cards on gradients. Density is deliberate — charts and readouts carry the
weight, chrome stays quiet. A dark "Forest night" theme mirrors the same tokens.

This file documents the shipped interface. If a token changes in `src/index.css`,
change it here in the same commit.

## Colours

All tokens live in `src/index.css` (`:root` for Paper field, `.dark` for Forest night).

- **Paper background (`#F6F7FB`):** the default page surface. Never pure white behind panels.
- **Surface (`#FFFFFF`):** panels, cards, controls.
- **Surface-2 (`#F1F3F9`):** quiet fills — segmented tracks, badges, table headers.
- **Ink (`#0E1526`):** 17:1 on the page background. Body copy and headings.
- **Muted (`#5B6478`):** 5.5:1. Secondary prose, table values, chart labels.
- **Faint (`#666F82`):** 4.7:1 on the page background and 5.0:1 on white — the lightest
  text allowed. Anything lighter fails WCAG AA at the 10–12px sizes this UI uses.
- **Action indigo (`#3B4FE0`):** one job — primary action, active navigation, links,
  and the fitted-trend reading. It is never used as a status colour.
- **Accent-soft (`#EEF1FE`):** the indigo tint behind active rows and icon hovers.
- **Warn amber (`#B45309`) / danger red (`#DC2626`):** provenance and destructive
  actions only.
- **Forest night:** background `#0B0F1A`, surface `#111726`, ink `#E8ECF5`,
  action `#8EA0FF`. The same roles, no second accent hue.

Each theme's accent is verified at 4.5:1 or better against its own surfaces.

## Typography

- **Inter Tight** carries display and page titles: weight 600, tracking `-0.035em`,
  balanced wrapping. The only large moment is the page headline.
- **Inter** carries all interface copy, labels, and numbers. Numbers use
  `font-variant-numeric: tabular-nums` (`.num`) so readouts do not jitter.
- **Micro labels** (`.label`, `.label-xs`, `.kicker`) are the one uppercase moment:
  9.5–11px, weight 500, tracking `0.06–0.08em`, coloured `--faint`. Everything else
  stays sentence case.
- Sentence-level emphasis inside a headline is a muted `<em>` in the same typeface,
  never a second colour.
- `text-wrap: pretty` on prose, `text-wrap: balance` on headings.

No monospace family ships with the app. Chart axes, tables and readouts all use Inter
with tabular figures; do not reference an unloaded family in Plotly or CSS.

## Layout

- A 64px sticky top bar holds the wordmark, primary navigation, the data badge,
  search (⌘K), theme toggle, primary action, and the session button. There is no
  persistent sidebar; navigation on small screens lives in a left drawer.
- Content columns are capped between 1400 and 1560px depending on density, with
  16px gutters on mobile, 28px at `md`, and 40px at `lg`.
- Overview and report pages open with a left-aligned title and right-aligned actions,
  lede capped near 66 characters per line.
- The Explorer is the one full-bleed screen: chart docked at the bottom, control rail
  floating left on `xl`, and the same rail becoming a stacked sheet below that.
- Section breaks are hairlines (`--line`) or a `.label` eyebrow, not decorative cards.

## Elevation & Depth

- Panels are flat by default: solid surface, 1px `--line` border, soft shadow
  (`--shadow-card`).
- `--shadow-lift` is reserved for floating layers — dialogs, toasts, hover tooltips,
  the map control rail, and lifted cards on hover.
- The sticky report nav and the mobile drawer may use a translucent surface with a
  small backdrop blur; nothing else uses glass effects.
- No gradient washes behind content. Map ramps are the only gradients, and they are
  data encoding.

## Shapes

- Page panels: `--r-panel` (20px) for the outer plate, `--r-card` (16px) for cards.
- Controls, inputs, segmented groups: `--r-control` (10px).
- Small chips, badges, nested tiles: `--r-inner` (8px) or fully rounded pills for
  status and tags.
- Circular shapes are limited to status dots, avatars, icon buttons, and map markers.

## Components

- **Top bar:** wordmark, active nav item on an `--accent-soft` pill, "Illustrative
  data" badge, command search, theme toggle, one primary indigo "New analysis".
- **Panels:** `.panel` (surface + hairline + soft shadow). Nested regions separate
  with hairlines, never with a second shadow.
- **Readouts:** one hairline-divided strip, 2–4 cells, each with a micro label,
  a numeric value, and one short explanation. No icon tiles or floating stat cards.
- **Buttons:** one primary per view (indigo, white text); secondary is a bordered
  surface button; ghost is text-only. Press feedback is a slight scale down.
- **Tags and marks:** `DemoMark` is the provenance badge. Its default label is
  **"Illustrative data"** and it must stay on every surface that shows a value.
  "Significant result", "Incomplete", and similar tags describe state; they never
  claim data provenance.
- **Charts:** Plotly is loaded lazily and only when a chart approaches the viewport.
  Observed is ink, fitted trend is `--chart-trend` (indigo), seasonal norm is slate,
  anomalies are sky-blue diamonds. Series never rely on hue alone: the trend is
  dashed, the seasonal norm is dotted, and comparison series each take a dash
  pattern. Legends stay visible on non-compact charts. The chart palette mirrors
  the CSS tokens in `src/utils/chartTheme.ts`.
- **Sparklines:** inline SVG. They are shape, not data tables — the series is
  smoothed (centred moving average) and reduced before drawing so a monthly record
  does not render as an ink block.
- **Forms:** `Field` renders its label and hint outside the control's `<label>`, so
  every input and select keeps a single, clean accessible name.

## Do's and Don'ts

- Do keep one action colour. Indigo means "you can act"; amber means "provenance";
  red means "destructive".
- Do keep text at or above `--faint`. If it needs to be quieter than that, use size
  or weight, not a lighter grey.
- Do label every data-bearing surface with `DemoMark`.
- Do keep figures tabular and units attached to their number.
- Don't claim NASA provenance for illustrative values. The demo series is synthetic;
  say so wherever a number is shown or exported.
- Don't introduce a second accent hue, gradient backgrounds, glass panels, or neon
  cyan on near-black.
- Don't reference fonts that `index.html` does not load.
