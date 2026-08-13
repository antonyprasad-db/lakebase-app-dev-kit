# Test list: F1-stock-visibility
Ordered for: design-momentum

- [x] T1: filing a valid stock record (sku, location, non-negative quantity, inventory_code) for a fresh pair persists it and shows a confirmation  (AC1-record-filed-and-confirmed)
- [x] T2: retrieving a previously filed (sku, location) pair returns the stored sku, location, quantity, and inventory_code exactly as filed  (AC2-filed-record-read-back)
- [x] T3: inserting a stock_records row missing one of sku, location, quantity, or inventory_code raises a NOT NULL IntegrityError against the branch DB (verifies the migration realized PI2)  (AC1-record-filed-and-confirmed)
- [x] T4: the app/routes boundary module does not import the DB session or ORM models; persistence code lives only in StockRepository (layering contract)  (AC1-record-filed-and-confirmed)
- [x] T5: submitting a filing with a negative quantity is rejected with an inline error that names the quantity field, and no negative row is stored  (AC5-negative-quantity-rejected-with-field-named-error)
- [x] T6: inserting a stock_records row with quantity < 0 directly raises a CHECK-constraint violation against the branch DB (verifies the migration realized PI3)  (AC5-negative-quantity-rejected-with-field-named-error)
- [x] T7: refiling the same (sku, location) pair with a different quantity resolves to exactly one row holding the new quantity; no duplicate row is stored  (AC3-refile-resolves-to-single-row)
- [x] T8: inserting two stock_records rows with the same (sku, location) pair directly raises a unique-constraint IntegrityError against the branch DB (verifies the migration realized PI1)  (AC3-refile-resolves-to-single-row)
- [x] T9: refiling an existing (sku, location) pair returns a confirmation of the filed record and never an error page  (AC4-refile-confirmed-not-errored)
- [x] T10: the DB connection resolves from the injected DATABASE_URL env var (databricks_postgres on the paired branch); no hardcoded DSN or app-specific DB name (config-in-env)  (AC1-record-filed-and-confirmed)
- [x] T11: the file-stock API boundary returns a JSON response, not server-rendered HTML, for the filing confirmation (SPA JSON boundary contract)  (AC1-record-filed-and-confirmed)
- [x] T12: the Alembic migration creating stock_records applies and single-step-reverses cleanly (downgrade -1, upgrade head, @pytest.mark.migration on an isolated branch), preserving pre-existing seeded rows (verifies PI4)  (AC1-record-filed-and-confirmed)
- [x] T13: opening the home stock-by-location table lists each filed record as a row showing its SKU, its location, and its quantity  (AC1-table-lists-filed-stock)
- [x] T14: viewing a location with no filed stock records shows the explicit "No stock at this location" message instead of a blank page  (AC4-empty-state-shown)
- [x] T15: a single SKU filed at two different locations appears in the table as two distinct rows, each showing its own location and its own quantity  (AC3-same-sku-shown-per-location)
- [x] T16: the quantity column's cells carry the design-guide right-align class/data-testid seam and render right-aligned (client component/Playwright harness)  (AC2-quantities-right-aligned)
- [x] T17: the stock-table read boundary (app/routes) does not import the DB session or ORM models; read persistence is only in StockRepository (layering contract for the read path)  (AC1-table-lists-filed-stock)
- [x] T18: opening the SKU detail view for a filed SKU lists a row for each location it is filed at, each showing that location's own quantity  (AC1-detail-lists-sku-locations)
- [x] T19: the SKU detail view for a selected SKU shows only that SKU's rows; a different SKU filed at the same or other locations never appears in the list  (AC2-detail-scoped-to-selected-sku)
- [x] T20: each row of the SKU detail view shows the tracking code (inventory_code) that was filed for that sku/location pair  (AC3-detail-shows-tracking-code)
- [x] T21: a row for a sku/location filed without a par level shows an explicit "not tracked" indicator, while a row filed with a par level shows that numeric value (par_level is a nullable domain field)  (AC4-untracked-par-level-shown)
- [x] T22: the additive Alembic migration adding the nullable par_level column to stock_records applies and single-step-reverses cleanly (downgrade -1, upgrade head, @pytest.mark.migration on an isolated branch), and pre-existing rows filed before the migration survive with par_level null after upgrade (verifies PI4 for this additive change)  (AC4-untracked-par-level-shown)
- [x] T23: the SKU-detail read boundary (app/routes) does not import the DB session or ORM models; read persistence is only in StockRepository (layering contract for the detail read path)  (AC1-detail-lists-sku-locations)

## Deferred / skipped
- (none)
