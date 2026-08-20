# Record and view stock by SKU and location

## Summary

Foundation for warehouse stock visibility: operators file a SKU's stock level at a physical location and retrieve it in a scannable table. Each (SKU, location) pair is unique; writes to the same pair update in place without duplication. Stock records include a combined tracking code for identification and are displayed across home screen and detail views.

## Stories

- S1-file-stock-record: Warehouse operator files a stock record for a SKU at a location with quantity and tracking code
- S2-view-home-stock-table: Warehouse operator views all stock on the home screen in a scannable table
- S3-view-sku-detail: Warehouse operator views a single SKU's stock across all its locations

## Out of scope

- Adjusting quantities after initial filing (separate feature)
- Receiving inbound goods from suppliers (separate feature)
- Picking goods for orders (separate feature)
- Multi-warehouse operations (V1 is single warehouse)
- Splitting tracking code into separate location, batch, serial fields (future iteration)

## Open questions

- Should the file-stock form be accessible from the home screen, from a dedicated entry page, or via programmatic API call during a scanning workflow?
- Should the home table be sorted by any default order, or configurable?
- Does the SKU detail view show a button or link to file/update stock for that specific SKU, or is that only from the form entry point?
- What happens if a user attempts to file stock with a SKU or location that doesn't exist in the system yet—does the system create these records on the fly, or must they be pre-defined?
