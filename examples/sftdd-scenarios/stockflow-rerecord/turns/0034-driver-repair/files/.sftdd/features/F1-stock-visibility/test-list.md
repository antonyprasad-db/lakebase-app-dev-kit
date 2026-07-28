# Test list: F1-stock-visibility
Ordered for: design-momentum

- [x] T1: filing a new (sku, location) with a quantity and inventory_code through the JSON boundary persists a stock_records row that is retrievable with the filed quantity and inventory_code  (AC1-file-new-record)
- [x] T2: filing the same (sku, location) again with a different quantity and tracking code updates the single existing row in place, leaving no second row and returning no error  (AC2-refile-updates-existing)
- [x] T3: submitting a filing on the SPA screen renders an explicit success confirmation naming that the stock was filed, rather than leaving the operator on an unchanged form  (AC3-save-confirmation-shown)
- [x] T4: filing a negative quantity through the boundary is rejected at write time (the service enforces quantity >= 0), so no row is persisted  (AC1-file-new-record)
- [x] T5: filing with a missing core field returns a structured field-named validation error identifying the offending field, not a generic bad request  (AC1-file-new-record)
- [x] T6: the boundary module (app/routes/) does not import the DB session; persistence is reachable only through the repository (app/repositories/ is the sole ORM/session owner)  (AC1-file-new-record)
- [x] T7: the stock boundary returns a JSON payload and never server-rendered HTML (the SPA/JSON-API split, boundary renders_via react)  (AC3-save-confirmation-shown)
- [x] T8: the database connection is sourced from DATABASE_URL in the environment and the database name stays databricks_postgres (config-in-env, no hard-coded connection string)  (AC1-file-new-record)
- [x] T9: inserting two stock_records rows with the same (sku, location) raises an IntegrityError against the branch DB, verifying the migration realized the composite unique constraint (PI1)  (AC2-refile-updates-existing)
- [x] T10: inserting a stock_records row missing any of sku, location, quantity, or inventory_code is rejected by a NOT NULL constraint against the branch DB, verifying the migration realized PI2  (AC1-file-new-record)
- [x] T11: inserting a stock_records row with quantity < 0 is rejected by the CHECK (quantity >= 0) constraint against the branch DB, verifying the migration realized PI3  (AC1-file-new-record)
- [x] T12: a single-step down-then-up round-trip (alembic downgrade -1 then upgrade head) of the stock_records create_table migration succeeds, verifying the migration has a working reversible downgrade (PI4)  (AC1-file-new-record)
- [x] T13: with several stock_records rows seeded across locations on the branch DB, the read boundary returns a JSON array with one entry per row, each carrying its sku, location, and quantity from the real branch through repository and service  (AC1-table-lists-stock-rows)
- [x] T14: given a list of stock records, the SPA stock-by-location table renders exactly one row per record and each row shows that record's SKU, location, and quantity via their data-testid seams  (AC1-table-lists-stock-rows)
- [x] T15: the quantity cell in the SPA table carries its right-align design-guide class / data-testid seam (asserting the stable contract, not an inline style attribute) so quantities line up for scanning  (AC2-quantity-right-aligned)
- [x] T16: for a location holding no stock_records rows on the branch DB, the read boundary returns an empty JSON array (never a 404 or blank body), so the client can render an empty state  (AC3-empty-state-shown)
- [x] T17: given an empty stock collection for a location, the SPA page renders the explicit "No stock at this location" message instead of a blank page or an empty table  (AC3-empty-state-shown)
- [x] T18: the stock read boundary (app/routes/) returns a JSON payload and never server-rendered HTML for the stock-by-location listing (SPA/JSON-API split, boundary renders_via react)  (AC1-table-lists-stock-rows)

## Deferred / skipped
- (none)
