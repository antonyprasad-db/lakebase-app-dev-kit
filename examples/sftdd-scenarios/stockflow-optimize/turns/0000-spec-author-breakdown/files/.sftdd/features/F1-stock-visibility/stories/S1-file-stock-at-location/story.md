# S1-file-stock-at-location

As a warehouse operator, I want to record the stock level of a SKU at a physical location with its tracking code, so that the system knows what is on the shelf and can retrieve it later.

## Scope

- A form accepts SKU, location, quantity, and a combined tracking code (location + batch + serial encoded together for V1).
- Submit persists a unique `(sku, location)` record; if the pair already exists, the new record replaces it (no error, no duplicate).
- The operator sees confirmation that the record was saved.
