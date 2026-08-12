# StockFlow Design Guide

The project-level visual + interaction contract for the StockFlow SPA.
Tokens are the source of truth in `design-guide.json` and ship as
`var(--token)` CSS custom properties in `client/src/styles/theme.css`.
Provenance: BRAND + COLOR from the Databricks-brand default
(`STYLE_GUIDE.md` / `theme.css`); LAYOUT + DENSITY from a clean
warehouse dashboard reference (Cin7 / Fishbowl / Linnworks).

## Design Philosophy

- **Clarity over decoration.** Every element earns its space; the stock
  table stays calm and high-contrast so SKUs and quantities scan fast.
- **Guide the user.** The interface explains itself; empty states teach
  in a plain, guiding voice, they never scold or blank out.
- **Warm and professional.** Navy + warm neutrals, not cold grey; brand
  red is reserved for the single primary action / active state.
- **One branded product.** Every screen carries the StockFlow warehouse
  mark and the same component vocabulary.

## UI Framework and Templating

React 18 + TypeScript SPA built with Vite, client-side routed with React
Router. No server-rendered HTML and no hand-assembled markup: every
screen composes the named components below. Every state (empty, loading,
success, validation error) is a component state exposing a stable
`data-testid` seam so Playwright E2E can select it. Rendering lives in
the `client/src/pages/` + `client/src/components/` boundary; framework
choice (`renders_via`) is the Architect's to record.

## Typography

- **DM Sans** primary (weights 400 / 500 / 600 / 700). **DM Mono** for
  numerics and codes. No custom web font beyond `theme.css`.
- Scale: 10px `xs`, 13px `sm`, 15px `base`, 16px `md`, 20px `lg`, 24px
  `xl`, 29px `xxl`. Body line-height 1.5, headings 1.25.
- Numeric quantities use `tabular-nums` so columns align.

## Color Palette

- **Brand:** brand-red `#FF3621` (primary CTA / active only), hover
  `#EB1600`.
- **Semantic:** success `#2E844A`, warning `#FFAB00`, info `#0176D3`,
  error = brand-red `#FF3621`.
- **Surface:** page warm-oat `#F9F7F4`, card white `#FFFFFF`; navy scale
  900 `#1B3139` (primary text) through 100 `#E3E7E9`.

## Spacing

4px base grid: `space-1` 4 / `space-2` 8 / `space-3` 12 / `space-4` 16 /
`space-5` 20 / `space-6` 24 / `space-8` 32 / `space-12` 48 / `space-16`
64. Content column max 960px; navbar 64px.

## Components

Every page composes these (class names match `design-guide.json`):

- **Navbar** (`navbar`) , navy-900 bar, 64px, 2px brand-red bottom
  border; app icon + "StockFlow" left, nav links right (active =
  brand-red).
- **Page** (`page`) , warm-oat bg, centered 960px column, `page__header`
  with app icon + `page__title`.
- **Card** (`card`) , white, `--radius-md`, navy-tinted `--shadow-sm`.
- **Buttons** (`btn`) , `btn--primary` (solid brand-red, sharp 0px
  corners), `btn--secondary` (outlined), `btn--ghost` (text-only); tap
  target >= 44x44px.
- **Form inputs** (`field`) , persistent visible `field__label`, clear
  focus ring; inline `field__error` naming the field.
- **Stock table** (`stock-table`) , uppercase cool header; quantity
  cells right-aligned, `--font-mono`, tabular figures.
- **Status pills** (`badge`) , `badge--in-stock`, `badge--low`,
  `badge--out`, `badge--on-order`, `badge--quarantined`; meaning carried
  by BOTH text and color, never color alone.
- **Empty state** (`empty-state`) , icon + teaching heading + copy + CTA.
- **Toast** (`toast`) , `toast--success` auto-dismiss, `toast--error`
  persists; fixed top-right, no layout shift.
- **Scan zone** (`scan-zone`) , green flash + in-place row update on
  success, red flash + persistent error toast on failure.

## Iconography

Single line-style icon set (inbound/outbound, scan, warehouse,
stock-level states); do not mix styles. **App icon:** the StockFlow
warehouse mark ships at `intake/assets/warehouse.png`, copied to
`client/src/assets/warehouse.png`, referenced from the navbar and
`page__header`. **Favicon:** browser-tab variant of the same mark.

## User Feedback Principles

No silent failures, no unacknowledged success:

- Empty stock location -> explicit empty state ("No stock at this
  location, receive an inbound shipment"), never blank. SKU without
  batch/serial -> clear "not tracked".
- Successful save -> confirmation view or inline green flash (adjust).
- Validation problem (overcommitting pick, unknown SKU) -> inline error
  next to the offending field, naming it.
- Barcode scan success -> green flash + row updates in place; failure
  (unknown barcode, locked SKU) -> red flash + persistent toast.
- Feedback affordances use `role="alert"` / `aria-live`; controls are
  keyboard-reachable and readable at 200% zoom.

## Adherence contract

Downstream UI is checked at the Playwright E2E layer against
`design-guide.json`: `assertDesignAdherence` (`:root` tokens match),
plus element/structural checks , tokens consumed not hardcoded, IA
`data-testid` seams present, every action has feedback, every page
reachable via `App.tsx` routes, and every page consumes the component
classes above. Violations are a blocking `ux-adherence` smell; the UI
refactors to the guide, the guide is never weakened to match drift.
