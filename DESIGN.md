---
version: alpha
name: EarthTrend Lab
description: A frontend Earth-observation workspace for analysts who need to read land-surface change without being misled; it should feel like a field instrument, measured and plainly labeled, not a dashboard demo.
colors:
  ground: "#171C1D"
  ground-light: "#EDEEE9"
  ink: "#ECE7DC"
  ink-light: "#1C2220"
  muted: "#A9B2AD"
  signal: "#E29A63"
  signal-light: "#8A441C"
  secondary: "#8FB3A6"
typography:
  display:
    fontFamily: Archivo
    fontSize: 15px
    fontWeight: 600
    letterSpacing: -0.03em
  body:
    fontFamily: Public Sans
    fontSize: 14.5px
    lineHeight: 1.55
  numeric:
    fontFamily: IBM Plex Mono
    fontSize: 12px
    fontWeight: 400
rounded:
  sm: 6px
  md: 8px
  lg: 12px
spacing:
  sm: 8px
  md: 16px
  lg: 28px
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ground}"
    rounded: "{rounded.md}"
    padding: 0 20px
  panel:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 20px
---

## Overview

EarthTrend Lab is a browser-only research workspace built around an illustrative
land-surface-temperature case study. Its audience is a curious analyst, student, or
reviewer who must be able to tell a demonstration from an observation at a glance.

The look comes from field instrumentation and survey paperwork: matte basalt and
limestone surfaces, engraved scale bars, graticule grids, copper signal marks, and a
sage second reading. It borrows the restraint of a laboratory readout rather than the
gloss of a mission-control console. Every number sits next to its unit and provenance;
every decorative element had to earn its place as a measurement aid.

## Colors

- **Ground, dark (`#171C1D`):** matte basalt. The default working surface; low chroma so map fills and copper readouts stay legible.
- **Ground, light (`#EDEEE9`):** cool limestone paper, not cream. Used for the daylit theme.
- **Ink (`#ECE7DC` dark / `#1C2220` light):** 12.4:1 and 14.1:1 on their grounds respectively.
- **Muted (`#A9B2AD` dark / `#4A554F` light):** 6.2:1 and 7.1:1; passes AA for body and small text.
- **Signal copper (`#E29A63` dark / `#8A441C` light):** one job — interactive action and the fitted-trend reading. It is never used as decoration, never as a headline highlight, and never as a status badge.
- **Secondary sage (`#8FB3A6` dark / `#33685C` light):** the seasonal and categorical companion; replaces the earlier violet entirely.

## Typography

- **Archivo** carries display and page titles. It is set at weight 600 with tight tracking (`-0.03em`) and balanced wrapping.
- **Public Sans** carries all interface copy, labels, and prose. Micro labels use sentence case at 10–10.5px with weight 600 and almost no tracking. Uppercase and wide tracking are not used for chrome.
- **IBM Plex Mono** is reserved for real numeric readouts, axes, and code identifiers. It is tabular by default so figures do not jitter between renders.
- The scale runs from 10px metadata to a 4.4rem overview headline. The only loud display moment is the overview headline and the results finding; every other heading stays close to body scale.
- `text-wrap: pretty` on paragraphs and `text-wrap: balance` on headings.

## Layout

- A fixed 264px sidebar on desktop, a 64px top bar, and a single scrolling content column. The content column is capped at 1400px with 16/28/40px gutters.
- Map screens break the column on purpose: the explorer uses a full-height map with floating control rails at `xl` and above.
- The structural idea is the **measured rule**: section breaks are 1px hairlines or the scale-bar tick rule, never decorative cards floating on a gradient.
- Page headers align title left and actions right; a lede is capped at 66 characters per line.

## Elevation & Depth

- Most surfaces are flat: a 1px border on a solid token surface. Shadows are reserved for genuinely floating layers — dialogs, toasts, hover tooltips, and the Leaflet zoom control.
- There is no glassmorphism. Overlays use a solid scrim mixed from `--bg-deep`, not a backdrop blur.
- Panels do not nest with new shadows; nested regions separate with hairlines and a step in surface tone.

## Shapes

- Panels and map plates: 12px (`--r-panel`).
- Controls, inputs, segmented groups, and secondary buttons: 8px (`--r-control`).
- Small inline chips, badges, and nested tiles: 6px (`--r-inner`).
- Circular shapes are limited to status dots and map markers. No decorative rings.

## Components

- **Sidebar:** grouped sentence-case navigation (Mission, Study, Reference), a single copper primary action, and an active-study dossier. Active rows use a 2px copper edge and a surface step, not a filled pill.
- **Top bar:** section breadcrumb, command search, theme toggle, session button. All hit targets are at least 40px.
- **Panels:** solid surface, hairline border, flat by default. `SectionHead` opens with a top rule.
- **Readouts:** `ReadoutStrip` is the only KPI pattern: one hairline-divided band, 2–4 cells, each with a label, a numeric value, and one short explanation. No icon tiles, no floating stat cards.
- **Buttons:** one copper primary per view; secondary is a bordered solid; ghost is text-only; press feedback is a 0.96 scale.
- **Data marks:** `DemoMark` and `DataNote` attach the illustrative disclaimer directly to data-bearing surfaces. The demo banner is dismissible but the marks are not.
- **Charts:** Plotly for analysis, inline SVG for sparklines. Observed is ink, trend is copper, seasonal is sage, anomalies are oxide red. Series never rely on hue alone: the fitted trend is dashed, the seasonal norm is dotted, comparison series each take their own dash pattern, and anomalies are diamond markers backed by a table. Legends are always visible for non-compact charts.

## Do's and Don'ts

- Do reuse the nav, top bar, panels, and tokens above on every page, unchanged.
- Do add a token here before a page uses it. Never invent a one-off inside a page.
- Do keep the demo disclaimer attached to any surface that shows a value.
- Don't change: the copper-on-basalt signal system, sentence-case labels, or the measured-rule section breaks.
- Don't use: near-black plus neon cyan, purple or violet gradients, glass panels, Space Grotesk/Inter, all-caps mono kickers, one accented headline word, decorative 01/02/03 indices, middle-dot metadata strings, cream + terracotta nostalgia, or generic dashboard stat-card grids.
