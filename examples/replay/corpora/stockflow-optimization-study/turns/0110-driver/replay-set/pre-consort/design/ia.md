# StockFlow Information Architecture

Screens, navigation, and primary flows for the StockFlow SPA. Every screen
maps to a concrete `App.tsx` route and a nav affordance; every flow seeds an
E2E scenario.

## Screens

- **Home , Stock by location** (`/`) , the landing view. A calm, scannable
  `stock-table` in a `card`: SKU, location, quantity (right-aligned mono
  tabular), and a stock-state `badge`. A location with no stock renders the
  `empty-state`. Hosts the `scan-zone` for floor barcode input.
- **SKU detail** (`/sku/:skuId`) , single 960px column of `card` panels for
  one SKU: quantities across locations, batch/serial (tracking-code) detail,
  and stock-state pills. No batch/serial data renders "not tracked", never a
  blank region. Entry points to the receipt / pick / adjustment forms.
- **Receive** (`/receive`) , inbound receipt form (supplier, SKU, location,
  quantity). Success lands on a confirmation; overcommit/unknown-SKU errors
  inline.
- **Pick** (`/pick`) , outbound pick form (SKU, location, quantity). Refuses
  to overcommit; validation shows inline next to the offending field.
- **Adjust** (`/adjust`) , stock adjustment / cycle-count form. Success can
  land as an inline green flash; validation inline.
- **Search** (`/search`) , find a SKU/location; empty result renders the
  `empty-state` with a guiding CTA. Feeds SKU detail.

## Navigation

- **Navbar** (`.navbar`, persistent 64px) is the primary nav: app icon +
  "StockFlow" (links to `/`), right-side links to Home, Search, Receive,
  Pick, Adjust. Active link uses brand red.
- **Routing** (`App.tsx` `<Routes>`):
  - `/` , Home
  - `/search` , Search
  - `/sku/:skuId` , SKU detail (reached from Home rows and Search results)
  - `/receive` , Receive
  - `/pick` , Pick
  - `/adjust` , Adjust
- **Entry points** , scan-zone on Home routes a matched barcode to the SKU
  detail or the relevant form; SKU detail buttons deep-link into Receive /
  Pick / Adjust prefilled with the SKU.

## User flows

1. **Scan-to-view** , operator scans a barcode in the Home scan-zone →
   green flash, stock row updates in place (or red flash + persistent toast
   on unknown/locked). *(story: view/adjust stock)*
2. **Receive inbound** , Navbar → Receive → fill supplier/SKU/location/qty →
   save → confirmation, stock rises at the location. *(story: record receipts)*
3. **Pick outbound** , Navbar → Pick → fill SKU/location/qty → save; an
   overcommit is refused with an inline error naming the quantity field.
   *(story: record picks without overcommit)*
4. **Adjust / cycle-count** , Home or SKU detail → Adjust → enter counted qty
   → inline green flash on save. *(story: count and reconcile)*
5. **Find a SKU** , Navbar → Search → query → result list (or empty-state) →
   SKU detail. *(story: know what/where/how much)*
6. **Inspect a SKU** , Home row / Search → SKU detail → quantities by
   location + batch/serial ("not tracked" when absent). *(story: retrieve stock)*
