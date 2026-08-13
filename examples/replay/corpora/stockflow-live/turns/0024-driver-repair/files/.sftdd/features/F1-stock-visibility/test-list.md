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

## Deferred / skipped
- (none)
