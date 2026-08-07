# StockFlow Information Architecture

Screens, navigation, and primary flows for the StockFlow SPA. Derived from
the product-overview (V1: see/adjust stock, receive, pick, multi-location)
and the design brief (home stock-by-location, SKU detail, forms, search).

## Screens

- **Home / Stock by location** (`/`) — the landing view: a calm, scannable
  card containing the `stock-table` of SKUs × locations with quantity and
  stock-state pill per row. Entry point for scanning and search. Empty state
  when a location holds no stock. `data-testid="home-page"`,
  `stock-table`, `scan-zone`.
- **SKU detail** (`/sku/:skuId`) — single narrow column: SKU identity,
  per-location quantities, batch/serial (tracking-code) detail or a "not
  tracked" empty state, and links to Receive / Pick / Adjust.
  `data-testid="sku-detail-page"`.
- **Search results** (`/search?q=`) — results of a SKU/barcode search;
  empty state when nothing matches. `data-testid="search-page"`.
- **Receive** (`/receive`) — inbound receipt form: supplier, SKU, quantity,
  location. Confirmation on success. `data-testid="receive-page"`.
- **Pick** (`/pick`) — outbound pick form: SKU, quantity, location; refuses
  to overcommit with inline validation. `data-testid="pick-page"`.
- **Adjust** (`/adjust`) — stock adjustment form: SKU, location, new
  quantity; inline green flash on success. `data-testid="adjust-page"`.
- **Cycle count** (`/count`) — count form to reconcile system vs shelf,
  inline validation. `data-testid="count-page"`.

## Navigation

Persistent `navbar` (64px) across all screens: app icon + "StockFlow" links
to `/`; right-side nav links to Receive, Pick, Adjust, Count, with the
active link in brand-red. A search field in the navbar routes to
`/search`. Barcode scan on Home/detail is the primary floor input and
navigates in place (row update), not a page reload.

`App.tsx` `<Routes>` map (every screen is routed; no dead pages):

| Path | Page | Nav affordance |
| --- | --- | --- |
| `/` | Home / Stock by location | app icon / logo |
| `/sku/:skuId` | SKU detail | row click from stock-table |
| `/search` | Search results | navbar search field |
| `/receive` | Receive | navbar link |
| `/pick` | Pick | navbar link |
| `/adjust` | Adjust | navbar link + SKU detail |
| `/count` | Cycle count | navbar link |

## User flows

1. **See stock** — open `/` → scan the stock-table by location → click a row
   → SKU detail. (product-overview: know what/where/how many.)
2. **Receive inbound** — navbar Receive → fill supplier/SKU/qty/location →
   submit → confirmation; stock rises at the chosen location.
3. **Pick outbound** — navbar Pick → SKU/qty/location → submit; system
   refuses to overcommit with inline field error, else confirmation and
   stock drops.
4. **Adjust stock** — SKU detail → Adjust → new quantity → submit → inline
   green flash, row updates in place.
5. **Cycle count** — navbar Count → enter counted quantity → submit;
   reconcile against system, inline validation on discrepancy.
6. **Scan on the floor** — from `/` or SKU detail, scan a barcode → green
   flash + row updates in place; unknown/locked barcode → red flash +
   persistent error toast.
7. **Search** — navbar search → `/search` results → open SKU detail, or an
   empty state when nothing matches.
