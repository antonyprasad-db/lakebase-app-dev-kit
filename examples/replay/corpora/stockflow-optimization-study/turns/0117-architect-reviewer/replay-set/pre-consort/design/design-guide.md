# StockFlow Design Guide

The project-level visual + interaction contract. Tokens are the source of
truth in `design-guide.json` and land in `client/src/styles/theme.css` as
`var(--token)`. Provenance: BRAND + COLOR + typography from the
**Databricks-brand default** (`STYLE_GUIDE.md` / `theme.css`); LAYOUT +
information density from a **clean warehouse/inventory dashboard** (Cin7 /
Fishbowl / Linnworks card-and-table view).

## Design Philosophy

- **Clarity over decoration.** Every element earns its space; the stock
  table stays calm and high-contrast so quantities and SKUs scan fast.
- **Guide the user.** The interface explains itself; empty states teach,
  never scold ("No stock at this location, receive an inbound shipment").
- **Warm and professional.** Navy + warm neutrals, not cold corporate grey.
- **One branded product.** Every screen carries the warehouse app icon and
  the same component vocabulary; brand red appears for the primary action /
  active state only.

## UI Framework and Templating

React 18 + TypeScript SPA (Vite), client-side routed with React Router; no
server-rendered HTML, no hand-assembled markup , every screen composes the
named component classes below. Rendering lives in the `client/src/pages/`
boundary layer. Stable test seams: `data-testid` on every state
(empty/loading/success/error) plus semantic roles; the JSON API is the only
data source. (The framework record `renders_via` is the Architect's.)

## Typography

- **DM Sans** primary face (weights 400 / 500 / 600 / 700); **DM Mono** for
  numerics and codes.
- Scale: `text-xs` 10px, `text-sm` 13px, `text-base` 15px, `text-md` 16px,
  `text-lg` 20px, `text-xl` 24px, `text-xxl` 29px.
- Line height: body 1.5, headings 1.25.
- Numeric quantities use **tabular figures** so columns align.

## Color Palette

- **Brand** , `brand #FF3621` (primary CTA / active only), `brand-hover
  #EB1600`, `brand-light rgba(255,54,33,0.08)`.
- **Navy scale** (text + dark surfaces) , 900 `#1B3139` (primary text),
  700 `#1B5162`, 500 `#618794`, 400 `#90A5B1`, 300 `#C4CCD6`, 200
  `#E5EAF1`, 100 `#EDF2F8`.
- **Surface** , page `#F9F7F4` (warm-oat), card `#FFFFFF`, cool `#F0F2F5`.
- **Semantic** , success `#2E844A`, warning `#FFAB00`, info `#0176D3`,
  error = brand red `#FF3621` (+ `-light` pill backgrounds for success /
  warning).

## Spacing

4px base grid: `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 ·
`space-5` 20 · `space-6` 24 · `space-8` 32 · `space-12` 48 · `space-16` 64.

**Radius:** sharp 0px (primary button), sm 4px (inputs), md 8px, lg 12px
(cards / modals), pill 999px (badges).

**Shadows** (navy-tinted, never black): sm `0 2px 8px rgba(27,49,57,0.06)`,
md `0 4px 16px rgba(27,49,57,0.08)`, lg `0 8px 32px rgba(27,49,57,0.12)`,
navbar `0 1px 0 rgba(27,49,57,0.08)`.

**Layout:** 960px content column; 64px persistent navbar; single column on
detail/form pages, table grid on the home index.

## Components

Each names the CSS class the pages apply (identical vocabulary to
`design-guide.json` `components`):

- **Navbar** (`.navbar`) , navy-900 bar, 64px, 2px brand-red bottom
  border; app icon + "StockFlow" left, nav links right, active link brand.
- **Page** (`.page`) , warm-oat bg, centered 960px column, `page__header`
  + `page__title` (with `page__title-icon`).
- **Card** (`.card`) , white surface, `--radius-lg`, `--shadow-sm`,
  `--space-5` padding.
- **Buttons** (`.btn`) , `btn--primary` (solid brand, sharp 0px corners),
  `btn--secondary` (outlined), `btn--ghost` (text). Tap target ≥ 44×44px.
- **Form input** (`.field`) , persistent visible `field__label`,
  `--radius-sm`, `--color-info` focus ring; inline `field__error` naming
  the field.
- **Stock table** (`.stock-table`) , cool uppercase header, numeric cells
  right-aligned in `--font-mono` tabular figures.
- **Status pills** (`.badge`) , five states, each text + color (never
  color alone): `badge--in-stock`, `badge--low`, `badge--out`,
  `badge--on-order`, `badge--quarantined`.
- **Empty state** (`.empty-state`) , icon + heading + copy + CTA; also
  "not tracked" for SKUs without batch/serial detail.
- **Toast** (`.toast`) , fixed top-right; `toast--success` auto-dismisses,
  `toast--error` persists; no layout shift.
- **Scan zone** (`.scan-zone`) , primary floor input; green flash + row
  update on success, red flash + persistent toast on failure.

## Iconography

- **Icon set** , a single line-style set used consistently (inbound /
  outbound, scan, warehouse, stock-level states); do not mix styles.
- **App icon** , warehouse mark, ships at `intake/assets/warehouse.png`,
  copied to `client/src/assets/warehouse.png`, shown in the navbar brand
  and `page__title` (`.page__title-icon`, 28px).
- **Favicon** , the same warehouse mark for the browser tab, wired in
  `client/index.html`.

## User Feedback Principles

- **No silent failure, no unacknowledged success.** Receipt, pick,
  adjustment, and cycle-count forms confirm on save (confirmation view or
  inline green flash) and show validation problems inline next to the
  offending field, naming it (overcommit, unknown SKU).
- **Every state is explicit** , empty, loading, success, and error each
  render with a stable `data-testid`; never a blank page.
- **Scans give sensory feedback** , green flash + in-place row update on
  success; red scan-zone flash + persistent error toast on unknown/locked.
- **Accessibility** , persistent labels, ≥44×44px tap targets, keyboard
  reachable, readable at 200% zoom, state via shape+text not color alone.

## Adherence contract

Downstream UI is checked at the E2E (Playwright) layer via
`assertDesignAdherence(page, guide)` (token-level: `:root` vars match this
JSON) plus element/structural checks: tokens consumed not hardcoded, IA
`data-testid` seams present, every action gives feedback, every page routed
and reachable, every page applies the component-class vocabulary. Violations
are a blocking `ux-adherence` smell; the UI refactors to the guide.
