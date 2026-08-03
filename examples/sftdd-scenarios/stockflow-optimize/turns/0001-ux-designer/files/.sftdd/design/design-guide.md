# StockFlow Design Guide

Project-level visual + interaction standards for the StockFlow SPA. Teased
from the design brief: BRAND + COLOR from the Databricks-brand default
(`client/src/styles/STYLE_GUIDE.md`, `theme.css`); LAYOUT + information
density from a clean warehouse/inventory dashboard (Cin7/Fishbowl/Linnworks
card-and-table view). `design-guide.json` is the token source of truth;
this document must stay in sync.

## Design Philosophy

- **Clarity over decoration.** Every element earns its space; the stock
  table stays calm and high-contrast so SKUs and quantities are scannable.
  (Databricks default.)
- **Guide the user.** Empty states teach, never scold; the interface
  explains itself. (brief: Interaction and feedback.)
- **Warm and professional.** Navy + warm neutrals, not cold corporate grey.
  Brand red reserved for the single primary action / active state.
- **One branded product.** Every screen composes the same named components
  and shows the StockFlow warehouse mark, so home, detail, and forms feel
  like one app.

## UI Framework and Templating

React 18 + TypeScript single-page app under `client/` (Vite), client-side
routed via React Router, talking to a JSON API — no server-rendered HTML,
no hand-assembled markup. Every state (empty, loading, success, validation
error) is a component state. Stable test seams: each interactive element and
each screen exposes a `data-testid` (and appropriate ARIA role) so the
Playwright E2E layer can select it. Rendering is confined to the
`client/src/pages/` + `client/src/components/` layers. (brief: UI delivery;
product-overview: client-side layering.)

## Typography

- **DM Sans** primary face (weights 400/500/600/700); **DM Mono** for code
  and numeric/quantity cells. No custom web font beyond `theme.css`.
- Type scale: `text-xs` 10px, `text-sm` 13px, `text-base` 15px, `text-md`
  16px, `text-lg` 20px, `text-xl` 24px, `text-xxl` 29px.
- Line heights: body 1.5, headings 1.25.
- Quantities use tabular figures (`tabular-nums` + DM Mono) so number
  columns align. (brief: Accessibility.)

## Color Palette

- **Brand** — `brand-red` `#FF3621` (primary CTA / active state ONLY:
  Receive, Pick, Save, active link), hover `brand-red-hover` `#EB1600`.
- **Semantic** — `success` `#2E844A`, `warning` `#FFAB00`, `info` `#0176D3`,
  `error` `#FF3621` (brand red). Never color alone: pair with text/shape.
- **Surface** — `page` warm-oat `#F9F7F4`, `card` white `#FFFFFF`, navy
  scale `navy-900 #1B3139` (primary text) through `navy-100 #EAEFF1` for
  dark surfaces, borders, and text variants.
(BRAND + COLOR: Databricks-brand default.)

## Spacing

4px base grid: `space-1` 4 / `space-2` 8 / `space-3` 12 / `space-4` 16 /
`space-5` 20 / `space-6` 24 / `space-8` 32 / `space-12` 48 / `space-16` 64.
Generous whitespace around the stock table and single-column forms.
(LAYOUT: warehouse dashboard reference.)

Radius: `sm` 4px (inputs), `md` 8px (cards, buttons), `lg` 12px (modals),
`pill` for badges, `sharp` 0px (primary button corners). Shadows are
navy-tinted, never black: `sm`, `md`, `lg`, plus a navbar shadow.

## Components

The named vocabulary every page composes (CSS classes match
`design-guide.json` `components`):

- **Navbar** (`navbar`) — navy-900 bar, 64px, 2px brand-red bottom border;
  app icon + "StockFlow" left, nav links right; active link brand-red.
- **Page** (`page`) — warm-oat background, centered ≤960px column,
  `page__header` with app icon + `page__title`.
- **Card** (`card`) — white surface, navy-tinted `--shadow-sm`,
  `--radius-md`, `--space-5` padding.
- **Buttons** (`btn`) — `btn--primary` (solid brand-red, sharp 0px corners),
  `btn--secondary` (outlined), `btn--ghost` (text-only); ≥44×44px.
- **Form input** (`field`) — persistent visible `field__label`, focus ring
  `--color-info`, inline `field__error` naming the field.
- **Stock table** (`stock-table`) — cool uppercase header, quantity cells
  right-aligned in DM Mono tabular figures.
- **Status pill** (`badge`) — pill; state by text AND color:
  `badge--in-stock`, `badge--low`, `badge--out`, `badge--on-order`,
  `badge--quarantined`.
- **Empty state** (`empty-state`) — icon + teaching heading + copy + CTA;
  also the "not tracked" state for SKUs without batch/serial detail.
- **Toast** (`toast`) — fixed top-right; `toast--success` auto-dismisses,
  `toast--error` persists; never shifts layout.
- **Scan zone** (`scan-zone`) — barcode input; `scan-zone--success` green
  flash + in-place row update, `scan-zone--error` red flash + persistent toast.
(Component vocabulary: brief.)

## Iconography

- Single line-style icon set used consistently (inbound/outbound, scan,
  warehouse, stock-level states). Do not mix icon styles.
- **App icon** (`app-icon`): the StockFlow warehouse mark, shipped at
  `intake/assets/warehouse.png`, copied to `client/src/assets/warehouse.png`,
  referenced from the navbar and page headers.
- **Favicon**: the same warehouse mark as the browser-tab icon, wired in
  `client/index.html`.
(brief: Iconography and app identity.)

## User Feedback Principles

- **No silent failure, no unacknowledged success.** Every action on the
  receipt / pick / adjustment / cycle-count forms produces feedback.
- Successful save lands on a confirmation view (or an inline green flash for
  an adjustment). Validation problems (overcommitting pick, unknown SKU)
  show inline next to the causing field, naming it.
- Barcode scan: success = green flash + row updates in place; failure
  (unknown barcode, locked SKU) = red scan-zone flash + persistent error toast.
- Explicit empty states everywhere — an empty location reads "No stock at
  this location, receive an inbound shipment", never a blank page.
- Accessibility: persistent labels; ≥44×44px tap targets; readable at 200%
  zoom; keyboard-reachable; state via text+shape, not color alone.

## Adherence contract

Downstream UI is checked against this guide at the Playwright E2E layer:
`:root` CSS custom properties must match `design-guide.json` (token-level),
components must consume `var(--token)` not hardcoded values, IA `data-testid`
seams must render, every action surface must expose a feedback affordance,
every page must be routed + reachable, and every feature page must apply the
component-class vocabulary above.
