# StockFlow Design Guide

The project-level visual + interaction contract for the StockFlow SPA.
Tokens are the source of truth in `design-guide.json` and are declared as
CSS custom properties on `:root` in `client/src/styles/theme.css`; feature
pages consume them as `var(--token)` and compose the named component
classes below. Downstream UI is checked against this guide at the E2E
(Playwright) layer, not by taste.

## Design Philosophy

- **Clarity over decoration.** Every element earns its space; the stock
  table stays calm and high-contrast so SKUs and quantities scan fast.
- **Guide the user.** The interface explains itself; empty states teach,
  never scold ("No stock at this location, receive an inbound shipment").
- **Warm and professional.** Navy + warm neutrals, not cold corporate grey.
- **Consistent with the Databricks ecosystem.** One branded product across
  home, detail, and form.
- **No silent failure, no unacknowledged success** on any operator action.

Provenance: philosophy, brand, and color from the Databricks-brand default
(`client/src/styles/STYLE_GUIDE.md` / `theme.css`); layout and information
density from a clean warehouse dashboard reference (Cin7 / Fishbowl /
Linnworks card-and-table view).

## UI Framework and Templating

React 18 + TypeScript single-page application built with Vite, client-side
routed with React Router (home, SKU detail, forms), no full-page reloads.
No hand-assembled HTML: every screen composes the component classes below.
Every state (empty, loading, success, validation error) is a component
state with a stable `data-testid` seam. The backend returns JSON only; the
SPA is the rendered UI. Rendering stays in the `client/src/pages/` +
`client/src/components/` boundary. (The framework record `renders_via` is
the Architect's; this states product intent.)

## Typography

- **DM Sans** primary face (weights 400 / 500 / 600 / 700). **DM Mono** for
  numerics and codes. No custom web font beyond `theme.css`.
- Type scale: `text-xs` 10px, `text-sm` 13px, `text-base` 15px, `text-md`
  16px, `text-lg` 20px, `text-xl` 24px, `text-xxl` 29px.
- Line heights: body 1.5, heading 1.25.
- Numeric quantities use tabular figures (`tabular-nums`) so number columns
  align. Provenance: Databricks-brand default.

## Color Palette

- **Brand** , `brand-red` `#FF3621` for the primary action / active state
  ONLY (Receive, Pick, Save, active link); `brand-red-hover` `#EB1600`.
- **Semantic** , `success` `#2E844A`, `warning` `#FFAB00`, `info` `#0176D3`,
  `error` `#FF3621` (brand red doubles as error).
- **Surface** , `page` warm-oat `#F9F7F4`, `card` white `#FFFFFF`, and the
  navy scale `navy-900 #1B3139` (primary text) through `navy-100 #E4E9EB`
  for dark surfaces and text variants.
Provenance: Databricks-brand default.

## Spacing

4px base grid: `space-1` 4px, `space-2` 8px, `space-3` 12px, `space-4` 16px,
`space-5` 20px, `space-6` 24px, `space-8` 32px, `space-10` 40px, `space-12`
48px, `space-16` 64px. Radius: `sm` 4px (inputs), `md` 8px (cards, buttons),
`lg` 12px (modals/hero), `pill` for badges, `sharp` 0px (primary button).
Shadows are navy-tinted, never black: `sm`, `md`, `lg`, plus a navbar
shadow. Content max width 960px; navbar 64px, persistent.

## Components

The named set every screen composes (classes match `design-guide.json`):

- **Navbar** (`navbar`) , navy-900 bar, 64px, 2px brand-red bottom border;
  app icon + "StockFlow" left, nav links right, active link brand-red.
- **Page** (`page`) , warm-oat bg, centered 960px column, `page__header`
  with `page__title` and the app icon.
- **Card** (`card`) , white on warm-oat, `--radius-md`, `--shadow-sm`,
  `--space-6` padding; wraps the stock table and detail panels.
- **Buttons** (`btn`) , `btn--primary` (solid brand-red, sharp 0px corners,
  hover `brand-red-hover`), `btn--secondary` (outlined), `btn--ghost`
  (text-only). Min 44x44px.
- **Form inputs** (`field`) , persistent visible `field__label` (not
  placeholder-only), `--radius-sm`, focus ring `--color-info`; inline
  `field__error` next to the offending field, naming it.
- **Stock table** (`stock-table`) , cool uppercase header; quantity cells
  right-aligned, `--font-mono`, `tabular-nums`.
- **Status pills** (`badge`) , all five stock states: `badge--in-stock`
  (success), `badge--low` (warning), `badge--out` (error), `badge--on-order`
  (info), `badge--quarantined` (navy-500). Pill shape, `text-xs` uppercase;
  meaning by BOTH text and color.
- **Empty state** (`empty-state`) , icon + teaching heading + copy + CTA;
  also renders "not tracked" for SKUs with no batch/serial detail.
- **Toast** (`toast`) , fixed top-right; `toast--success` auto-dismisses,
  `toast--error` persists; never shifts page layout.
- **Scan zone** (`scan-zone`) , primary floor input; green flash + in-place
  row update on success, red flash + persistent error toast on failure
  (unknown barcode, locked SKU).

## Iconography

Single line-style icon set used consistently (inbound / outbound, scan,
warehouse, stock-level states); do not mix icon styles.

- **App icon** , warehouse mark at `client/src/assets/warehouse.png` (ships
  at `intake/assets/warehouse.png`), shown in the navbar and page header
  next to "StockFlow" (`app-icon`).
- **Favicon** , the browser-tab icon references the same warehouse asset.

## User Feedback Principles

- **No blank regions.** Empty stock locations show an explicit empty state;
  SKUs without batch/serial detail show a clear "not tracked".
- **No silent form failure.** A successful save lands on a confirmation view
  (or an inline green flash for an adjustment); a validation problem (pick
  overcommit, unknown SKU) shows inline next to the causing field, naming it.
  Applies to receipt, pick, adjustment, and cycle-count forms.
- **Scan feedback.** Success , green flash + stock row updates in place;
  failure , scan zone flashes red + persistent error toast.
- Every action is keyboard-reachable and readable at 200% zoom; state is
  carried by shape + text, not color alone. Feedback affordances expose
  `role="alert"` / `aria-live` or a `data-testid` naming error/success.

## Adherence contract (E2E)

Downstream UI must pass, at the Playwright layer: token adherence
(`:root` vars match `design-guide.json`), no hardcoded hex/px (use
`var(--token)`), the `ia.md` `data-testid` seams render, every action
surface has a feedback affordance, every `client/src/pages/` page is routed
in `App.tsx` and reachable via nav, and every page consumes the component
vocabulary above (no bare default HTML).
