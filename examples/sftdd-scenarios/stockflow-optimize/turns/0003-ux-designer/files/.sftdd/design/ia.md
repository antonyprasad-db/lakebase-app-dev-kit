# StockFlow Information Architecture

Screens, navigation, and primary flows for the StockFlow SPA. Each screen
maps to a concrete React Router path in `App.tsx` and a nav affordance; each
flow seeds >=1 E2E scenario.

## Screens

- **Home , Stock by location** (`HomePage`) , the landing view. A card
  holding the `stock-table` of stock-by-location: SKU, location, quantity
  (right-aligned mono), and a status pill (in-stock / low / out / on-order /
  quarantined). Empty warehouse shows an `empty-state`. Includes the
  `scan-zone` for barcode input. `data-testid="stock-table"`,
  `data-testid="scan-zone"`, `data-testid="home-empty"`.
- **SKU detail** (`SkuDetailPage`) , single narrow column; a card with the
  SKU's per-location quantities, batch/serial (tracking-code) detail, and
  status pills. No batches/serials shows a "not tracked" `empty-state`.
  Entry to the adjustment form. `data-testid="sku-detail"`.
- **Receive form** (`ReceivePage`) , record an inbound receipt: supplier,
  SKU, quantity, destination location. `field` inputs with persistent
  labels; primary "Receive" button. `data-testid="receive-form"`.
- **Pick form** (`PickPage`) , record an outbound pick: SKU, quantity,
  source location; refuses to overcommit (inline `field__error`). Primary
  "Pick" button. `data-testid="pick-form"`.
- **Adjust form** (`AdjustPage`) , adjust a SKU's stock level at a location;
  success shows an inline green flash. `data-testid="adjust-form"`.
- **Search** (`SearchPage`) , find a SKU/location; empty results show an
  `empty-state`. `data-testid="search"`, `data-testid="search-results"`.

## Navigation

Persistent `navbar` (app icon + "StockFlow" left, nav links right, active
link brand-red). Routes in `App.tsx` `<Routes>`:

| Screen | Path | Nav affordance |
| --- | --- | --- |
| Home / Stock by location | `/` | Navbar "Stock" (default) |
| SKU detail | `/sku/:skuId` | Row link from Home + search result |
| Receive | `/receive` | Navbar "Receive" |
| Pick | `/pick` | Navbar "Pick" |
| Adjust | `/sku/:skuId/adjust` | Button on SKU detail |
| Search | `/search` | Navbar "Search" |

Every page under `client/src/pages/` is wired into `App.tsx`; no unrouted
page. The scan zone on Home routes to the matched SKU detail on a successful
scan.

## User flows

1. **See stock at a location** , open Home -> scan the `stock-table` ->
   click a row -> land on SKU detail. (empty warehouse -> `empty-state`.)
2. **Scan a barcode on the floor** , Home `scan-zone` -> valid scan: green
   flash + row updates in place; invalid scan: red flash + persistent error
   toast. (product overview sign-off flow.)
3. **Receive inbound goods** , navbar "Receive" -> fill supplier / SKU /
   qty / location -> submit -> confirmation, stock goes up. Unknown SKU ->
   inline `field__error`.
4. **Pick for an order** , navbar "Pick" -> SKU / qty / source -> submit;
   overcommit -> inline `field__error` naming the field; success ->
   confirmation, stock drawn down.
5. **Adjust a stock level** , SKU detail -> "Adjust" -> change qty ->
   submit -> inline green flash, row updates.
6. **Find a SKU** , navbar "Search" -> query -> results (or `empty-state`)
   -> open SKU detail.
