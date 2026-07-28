# Record and view stock by SKU and location

## Summary

The foundational capability of StockFlow: record the stock level of one SKU at one physical location, along with its combined tracking code, and read it back. A SKU may hold stock at more than one location; each `(sku, location)` pair is its own uniquely addressable record. This is read-and-record only.

## Stories

- **S1-file-stock-record** – File the stock level of a SKU at a location (quantity + combined `inventory_code`), with `(sku, location)` collisions resolved at write time rather than duplicated or errored.
- **S2-stock-by-location-table** – See a calm, scannable home table of stock by location (SKU, location, quantity right-aligned), with an explicit empty state.
- **S3-sku-detail-view** – See one SKU's stock across its locations, including its tracking code, with untracked optional detail shown explicitly.

## Out of scope

- Adjusting quantities (a separate feature).
- Receiving inbound goods (a separate feature).
- Splitting the combined `inventory_code` into separate location/batch/serial fields (a later iteration).
- Multi-warehouse operation beyond the single location addressing described here.

## Open questions

- These questions seed the Architect's Gate 1 adjudication; they are not resolved here.
- (none raised at breakdown; ACs will surface any boundary questions per story)
