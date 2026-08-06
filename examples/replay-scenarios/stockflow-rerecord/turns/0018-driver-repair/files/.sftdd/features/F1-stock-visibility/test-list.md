# Test list: F1-stock-visibility
Ordered for: design-momentum

- [x] T1: filing a stock level (unique uuid-suffixed sku/location, cleaned up after) for a SKU at a location durably persists a stock_records row on the branch DB capturing sku, location, quantity, and combined inventory_code  (AC1-file-stock-record)
- [x] T2: retrieving a previously filed record (seeded under a unique uuid-suffixed key, cleaned up after) reads back the stored quantity and combined inventory_code exactly as filed  (AC2-retrieve-stock-record)
- [x] T3: filing stock a second time for an already-filed (sku, location) pair (unique uuid-suffixed key, cleaned up after) updates the existing row in place so exactly one row remains, with no duplicate stored and no error surfaced  (AC3-collision-resolved-at-write)
- [x] T4: the routes/boundary module does not import the DB session; persistence lives only in the repository (layering contract)  (AC1-file-stock-record)
- [x] T5: the boundary returns JSON only and does no server-side template rendering (renders_via react, NFR-F1-5)  (AC1-file-stock-record)
- [x] T6: only the repository layer touches the ORM/session; the service and boundary contain no ORM imports (ORM-only persistence contract)  (AC1-file-stock-record)
- [x] T7: the connection string is sourced from the DATABASE_URL env var with no hardcoded connection string, pointing at the paired branch databricks_postgres (config-in-env, NFR-F1-7)  (AC1-file-stock-record)
- [x] T8: posting a body with an invalid/missing field to the boundary is rejected with an error payload that names the specific offending field rather than a generic bad-request (NFR-F1-6)  (AC1-file-stock-record)
- [x] T9: the service rejects an overcommitting/negative-quantity write at write time with no negative row persisted on the branch (NFR-F1-2 service-layer guard)  (AC1-file-stock-record)
- [x] T10: inserting two rows with the same (sku, location) directly against the branch DB raises a unique-constraint IntegrityError (verifies the migration realized PI1)  (AC3-collision-resolved-at-write)
- [x] T11: inserting a stock_records row with a NULL quantity (or NULL sku/location/inventory_code) directly against the branch DB is rejected by the NOT NULL constraint (verifies the migration realized PI2)  (AC1-file-stock-record)
- [x] T12: inserting a stock_records row with quantity = -1 directly against the branch DB is rejected by the CHECK (quantity >= 0) constraint (verifies the migration realized PI3)  (AC1-file-stock-record)
- [x] T13: the repository's read-existing-then-write upsert for a colliding (sku, location) runs in a single transaction against the branch so a concurrent repeat file resolves to one row and never stores two (verifies PI4)  (AC3-collision-resolved-at-write)
- [x] T14: the Alembic migration creating stock_records round-trips with a single-step downgrade -1 then upgrade head against an isolated branch and recreates the table + unique + check (verifies PI5 reversibility); marked @pytest.mark.migration  (AC1-file-stock-record)
- [x] T15: on an in-place upsert of an existing (sku, location) the original created_at timestamp is preserved unmodified (immutable audit timestamp, NFR-F1-1/R1)  (AC3-collision-resolved-at-write)
- [x] T16: the file-stock form renders its sku, location, quantity, and inventory_code fields plus its submit control with their data-testid seams (client component)  (AC1-file-stock-record)
- [x] T17: the stock-retrieval view renders the read-back quantity and combined inventory_code for a fetched record via its data-testid seams (client component)  (AC2-retrieve-stock-record)

## Deferred / skipped
- (none)
