# StockFlow Information Architecture

Screens, navigation, and primary flows for the StockFlow SPA. Each
screen maps to a concrete `App.tsx` route and a nav affordance; each
flow seeds >=1 E2E scenario.

## Screens

- **Home , Stock by location** (`/`) , the calm scannable stock table:
  SKU, location, quantity (right-aligned mono), and a stock-state pill
  per row. Entry point and default landing. Empty state when no stock.
  `data-testid="home-stock-table"`.
- **SKU detail** (`/sku/:sku`) , single narrow content column: the
  SKU's stock across locations, batch/serial tracking-code detail, and
  actions (Receive, Pick, Adjust). "not tracked" empty region when a SKU
  has no batch/serial detail. `data-testid="sku-detail"`.
- **Receive** (`/sku/:sku/receive`) , inbound-receipt form: supplier,
  location, quantity. Lands on a confirmation on success.
  `data-testid="receive-form"`.
- **Pick** (`/sku/:sku/pick`) , outbound-pick form: location, quantity;
  refuses to overcommit with an inline field error.
  `data-testid="pick-form"`.
- **Adjust** (`/sku/:sku/adjust`) , cycle-count / adjustment form: new
  count per location; success shows an inline green flash.
  `data-testid="adjust-form"`.
- **Search** (`/search`) , SKU/barcode search + the primary scan zone;
  a scan resolves to the SKU detail or flashes red on an unknown
  barcode. `data-testid="search-view"`.

## Navigation

- **Navbar** (persistent, all screens): app icon + "StockFlow" -> Home;
  right-side links -> Home (`/`) and Search (`/search`); active link in
  brand-red.
- **Routing** (`App.tsx` `<Routes>`): `/` Home, `/search` Search,
  `/sku/:sku` SKU detail, `/sku/:sku/receive` Receive,
  `/sku/:sku/pick` Pick, `/sku/:sku/adjust` Adjust.
- Home rows link to SKU detail. SKU detail hosts the Receive / Pick /
  Adjust action buttons (route into the forms). Forms return to SKU
  detail (or confirmation) on success. Search + scan resolve into SKU
  detail.

## User flows

1. **See stock** , land on Home, scan the stock-by-location table, click
   a row -> SKU detail. (empty-state path: no stock -> empty state CTA.)
2. **Receive inbound** , SKU detail -> Receive -> enter supplier /
   location / quantity -> save -> confirmation, stock up.
3. **Pick outbound** , SKU detail -> Pick -> enter location / quantity
   -> save; overcommit attempt -> inline field error naming quantity.
4. **Adjust / cycle count** , SKU detail -> Adjust -> new count -> save
   -> inline green flash, row updates in place.
5. **Scan on the floor** , Search -> scan barcode; success -> green
   flash + resolve to SKU detail; unknown/locked -> red flash +
   persistent error toast.
