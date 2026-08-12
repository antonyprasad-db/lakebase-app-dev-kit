# Record and view stock by SKU and location

## Summary

This feature provides the foundation for stock visibility: the ability to file and retrieve the stock level of a SKU at a physical location, see stock aggregated on a home screen table, and view a SKU's inventory across its locations. Stock records are identified by a unique (SKU, location) pair; the system enforces this uniqueness at write time by updating in place when the same pair is written again. Each stock record carries a combined tracking code and optional par level.

## Stories

- **S1-file-stock**: Create and retrieve a stock record for a (SKU, location) pair; handle collisions by updating in place.
- **S2-view-home-stock-table**: Display all stock records on the home screen as a calm, scannable table with quantities right-aligned and an explicit empty-state message.
- **S3-view-sku-detail**: View a single SKU's stock across all its locations, including tracking code and par level (displayed as "not tracked" if absent).

## Out of scope

- Adjusting quantities (that is a separate feature).
- Receiving inbound goods or recording outbound picks (separate features).
- Splitting tracking codes into separate location, batch, and serial fields (deferred to V2).
- Par level editing or management (read-only in this feature).
- Multi-warehouse support (V1 operates within a single warehouse).
- Barcode scanning UI integration (V1 relies on manual entry).

## Open questions

- Is there a default par level, or is the field always optional and displayed as "not tracked"?
- Should the stock table be sortable or filterable by SKU or location?
- Should the home screen also show a count of total unique SKUs or locations?
- Does the detail page for a SKU include any actions (e.g., edit quantity, mark as audited), or is it read-only in V1?
