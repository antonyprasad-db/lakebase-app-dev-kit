# Test list: F6-split-tracking-code
Ordered for: design-momentum

- [x] T1: after the up-migration runs against the branch DB, stock_records exposes batch_number and serial_number as its own separately addressable columns  (AC1-batch-serial-columns-added)
- [x] T2: the boundary (app/routes) and service (app/services) modules do not import the DB session; the session is used only in app/repositories (layering contract)  (AC1-batch-serial-columns-added)
- [x] T3: Alembic sources DATABASE_URL from the environment with no hardcoded connection string and does not rename databricks_postgres (config-in-env, NFR-F6-7)  (AC1-batch-serial-columns-added)
- [x] T4: the migration integration suite binds DATABASE_URL of the paired Lakebase branch and uses no in-memory or mocked DB substitute (NFR-F6-3)  (AC1-batch-serial-columns-added)
- [x] T5: inserting a stock row (uuid-suffixed sku/location) with NULL batch_number and NULL serial_number succeeds against the branch DB, proving the migration added the columns NULLABLE with no NOT NULL constraint (realizes PI1)  (AC4-nonconforming-code-left-null)
- [x] T6: backfill of a well-formed code "A12-B7-S001" (seeded on a uuid-suffixed sku/location) writes segment 2 to batch_number and segment 3 to serial_number  (AC2-conforming-code-split)
- [x] T7: backfill of a nonconforming code such as "X-1" (seeded on a uuid-suffixed sku/location) leaves batch_number and serial_number NULL and the row still exists afterward  (AC4-nonconforming-code-left-null)
- [x] T8: after the up-migration completes, the combined inventory_code column no longer exists on stock_records while batch_number and serial_number are populated  (AC3-combined-code-dropped)
- [x] T9: the migration populates batch_number/serial_number in the backfill step strictly before the inventory_code drop executes (additive-then-backfill-then-drop ordering, NFR-F6-6)  (AC3-combined-code-dropped)
- [x] T10: seed a known set of sprint-1 rows (uuid-marked, including a nonconforming code) before the migration, run @pytest.mark.migration upgrade, and assert every one of the seeded rows is still present afterward (data preservation, NFR-F6-1)  (AC5-all-rows-preserved)
- [x] T11: a seeded row's location value (uuid-suffixed) is byte-for-byte unchanged after the migration and is not overwritten from the code's leading segment (AC8)  (AC8-location-unchanged)
- [x] T12: after the migration, inserting two rows with the same (sku, location) uuid-suffixed pair raises an IntegrityError against the branch DB, proving the F1 (sku, location) unique key survives the split (realizes PI2)  (AC8-location-unchanged)
- [x] T13: seed a uuid-marked mix of conforming and nonconforming codes, run the pre-acceptance integrity probe, and assert the reported nonconforming count for the test's own seeded rows equals its seeded nonconforming rows (scoped delta, never an absolute whole-table total; NFR-F6-5)  (AC6-nonconforming-count-surfaced)
- [x] T14: single-step round-trip on the branch DB (@pytest.mark.migration): after downgrade -1 the inventory_code column is reconstructed from location + batch_number + serial_number and the prior schema shape is restored, then upgrade head returns to the split schema (realizes PI3)  (AC7-migration-reversible)

## Deferred / skipped
- (none)
