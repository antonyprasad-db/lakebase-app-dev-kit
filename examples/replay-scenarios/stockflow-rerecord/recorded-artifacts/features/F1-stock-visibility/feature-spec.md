# Record and view stock by SKU and location

## Summary

The foundational capability for StockFlow: record the stock level of a SKU at a physical location (with its combined tracking code) and read it back. It gives the warehouse team a way to file stock and see it again, at one warehouse.

## Stories

- **S1-file-stock** – File the stock level of one SKU at one location, with its combined `inventory_code`, resolving a repeat `(sku, location)` at write time rather than storing a duplicate or erroring.
- **S2-stock-by-location-table** – See a calm, scannable home table of stock by location (SKU, location, quantity right-aligned), with an explicit empty state.
- **S3-sku-detail-view** – See one SKU's stock across its locations, including its tracking code, with a clear "not tracked" state for untracked optional detail (par level).

## Out of scope

- Adjusting quantities and receiving inbound goods (their own features).
- Splitting the combined `inventory_code` into separate location / batch / serial fields (a later iteration; store and show the combined code for now).
- Anything beyond one warehouse.
- Multi-tenant isolation, accounting, shipping, and the product-level non-goals.

## Open questions

- **Uniqueness key scope:** the request says each `(sku, location)` pair is uniquely addressable. Is uniqueness scoped to a single warehouse for V1 (no cross-warehouse dimension yet), so `(sku, location)` alone is the key? Recommended: yes, single warehouse, `(sku, location)` is the key.
- **Collision resolution semantics:** at write time, should a repeat `(sku, location)` overwrite the existing record's quantity and tracking code (last-write-wins upsert), or is some other merge intended? Recommended: last-write-wins upsert on `(sku, location)`.
- **Empty vs. missing SKU on detail:** for a SKU with no stock at any location, does S3 show the same explicit "No stock" state as an empty location, and what does requesting an unknown SKU show? Recommended: unknown SKU shows a not-found state, a known SKU with no stock shows the explicit empty state.
- **Quantity input constraints on filing:** are quantities non-negative integers only, and what is the inline validation message when an invalid quantity is entered? Recommended: non-negative integers, inline field-named validation.
