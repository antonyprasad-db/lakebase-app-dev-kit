---
author: UX Designer
---

# StockFlow design guide

Provenance: `design-brief.md` names two references. **Databricks-brand
default** (`client/src/styles/STYLE_GUIDE.md` + `theme.css`, already
shipped in this repo) supplies BRAND and COLOR: DM Sans, navy-900 text,
warm-oat page surface, white cards, brand red for primary actions only.
**A clean warehouse / inventory dashboard** (Cin7 / Fishbowl / Linnworks
card-and-table style) supplies LAYOUT and INFORMATION DENSITY: a calm,
scannable stock-by-location table, generous whitespace, right-aligned
numeric columns with tabular figures, a single narrow column for detail
and form pages. Where the brief was silent (breakpoints), a
conventional tablet/desktop pair is used, chosen because the
warehouse-floor tablet is the brief's primary target device.

## Design Philosophy

- **Clarity over decoration.** Every element earns its space; no
  ornament that doesn't carry information (Databricks-brand default).
- **Guide the user.** Empty states teach ("No stock at this location,
  receive an inbound shipment"), never scold or blank out
  (design-brief, Interaction and feedback).
- **Warm and professional.** Navy + warm neutrals, not cold corporate
  grey (Databricks-brand default).
- **Calm and scannable under density.** The warehouse dashboard
  reference exists because the home screen is a working table an
  operator scans fast; whitespace and alignment do the organizing,
  not color or decoration (warehouse-dashboard reference).
- **Consistent with the Databricks ecosystem.** A user moving between
  this app and other Databricks surfaces should feel at home
  (Databricks-brand default).

## UI Framework and Templating

StockFlow is a React 18 + TypeScript single-page application (Vite,
React Router), per `product-overview.md`'s architectural requirements.
No hand-assembled HTML strings; every screen is a composed component
tree rendered client-side, with client-side routing and no full-page
reloads (design-brief, "UI delivery"). Every component state (empty,
loading, success, validation error) is a distinct rendered state, not
an afterthought, and carries a stable `data-testid` (or ARIA role) seam
so the E2E layer can select it without depending on visual structure.
Rendering happens only in `client/src/pages/` and
`client/src/components/` (the Architect's layering); this guide governs
what those layers must look and feel like, not how they're wired.

## Typography

| Token | Value | Use |
|---|---|---|
| `font_family` | `'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | All UI text |
| `font_mono` | `'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace` | Tracking codes, quantities, numeric columns |
| `text-xs` | 10px | Micro-labels |
| `text-sm` | 13px | Table meta, badges |
| `text-base` | 15px | Body default |
| `text-md` | 16px | Emphasized body, form labels |
| `text-lg` | 20px | Section headings |
| `text-xl` | 24px | Page titles |
| `text-xxl` | 29px | Rare hero use |

Body line-height `1.5`, heading line-height `1.25`. Weights: regular
`400`, medium `500`, semibold `600`, bold `700`. Quantity and tracking
code columns use `font_mono` with tabular figures so digits align
vertically (design-brief, Accessibility).

## Color Palette

| Group | Token | Value | Rule |
|---|---|---|---|
| brand | `brand-red` | `#FF3621` | Primary action / active state ONLY: Receive, Pick, Save, the active nav link (design-brief, Brand constraints) |
| brand | `brand-red-hover` | `#EB1600` | Hover/active state of the above |
| semantic | `success` | `#2E844A` | Confirmations, successful scan flash |
| semantic | `warning` | `#FFAB00` | Low-stock pill |
| semantic | `info` | `#0176D3` | Informational banners |
| semantic | `error` | `#FF3621` | Validation errors, failed scan |
| surface | `page` | `#F9F7F4` | Page background (warm-oat) |
| surface | `card` | `#FFFFFF` | Cards, table surface |
| text | `primary` | `#1B3139` | Default text (navy-900) |

Meaning is never color-only: an "out of stock" cell reads **out** and
uses `error`; a "low" cell reads **low** and uses `warning`
(design-brief, Accessibility). Keep the stock table itself calm and
high-contrast; brand red is reserved for the primary action so it stays
salient against the table (design-brief, Brand constraints).

## Spacing

4px base grid, matching `theme.css`: `space-1` 4px, `space-2` 8px,
`space-4` 16px, `space-6` 24px. Extend the same 4px cadence (e.g.
`space-8`, `space-12`) if a later feature needs a larger gap; don't
invent an off-grid value.

### Radius and shadow

- `sm` 4px: form inputs.
- `md` 8px: cards, the table container.
- `lg` 12px: modals, hero/confirmation cards.
- `pill` 999px: status badges.
- `none` 0px: the primary action button ONLY, sharp corners by design
  (design-brief, Brand constraints: "solid brand-red with sharp (0px)
  corners"), distinct from every other rounded surface.
- Shadows are navy-tinted (`rgba(27, 49, 57, ...)`), never black:
  `sm`/`md`/`lg` for elevation, plus a flat `navbar` shadow for the
  persistent top bar.

### Layout

Content max width 960px; navbar height 64px, persistent across pages.
Single content column on the SKU detail page and every form; the home
screen is the one grid/table view (Databricks-brand default +
warehouse-dashboard reference).

## Components

- **Stock table** (home): calm, scannable, one row per `(sku,
  location)`. Numeric quantity column right-aligned, `font_mono`,
  tabular figures. Empty state is explicit text ("No stock at this
  location, receive an inbound shipment"), never a blank table body.
- **Status/quantity pill**: uses `radius-pill`, a semantic color, AND
  its status name as text ("out", "low", "ok"). Never color alone.
- **Card**: white (`surface.card`) on warm-oat (`surface.page`),
  `radius-md`, `shadow-sm`. Used for the SKU detail panel and any
  standalone form.
- **Primary button**: solid `brand-red`, `radius-none` (sharp
  corners), white text, `brand-red-hover` on hover/press. Reserved for
  the single primary action per view (Save, Receive, Pick). Minimum
  44x44px tap target (design-brief, Accessibility, tablet floor use).
- **Form input**: `radius-sm`, a visible persistent label above the
  field (never placeholder-only), inline validation message directly
  under the field naming what's wrong.
- **Scan zone**: the primary input surface on the warehouse floor.
  Success is a green (`success`) flash plus the affected stock row
  updating in place. Failure (unknown barcode, locked SKU) is a red
  (`error`) flash of the scan zone plus a persistent toast, not a
  flash that disappears before it's read.
- **Empty / not-tracked state**: any optional or absent value (a SKU
  with no batch/serial detail, a location with no stock) renders an
  explicit label ("not tracked", "No stock at this location...") in
  the region it would otherwise occupy. Never a blank region, never a
  null crash.

## User Feedback Principles

- **No silent failure.** Every form submission (adjustment, receipt,
  pick, cycle count) either lands on an explicit confirmation (or an
  inline success flash for a quick adjustment) or shows an inline
  error naming the offending field. A pick that would overcommit
  stock is a validation error shown next to the quantity field, not a
  toast-only or console-only failure.
- **No unacknowledged success.** A successful barcode scan updates the
  stock row in place with a green flash; the user never has to guess
  whether the scan registered.
- **Errors name the field.** "Unknown SKU" or "quantity exceeds
  available stock" appears next to the input that caused it, not in a
  generic banner detached from context.
- **Persistent over transient for failure.** A failed scan gets a
  persistent toast (dismissed explicitly), not a flash that vanishes
  before the operator can read it; a successful scan's flash can be
  transient because the row-level update is itself the durable
  confirmation.
