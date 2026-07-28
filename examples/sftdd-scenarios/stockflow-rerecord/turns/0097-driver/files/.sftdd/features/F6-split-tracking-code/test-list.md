# Test list: F6-split-tracking-code
Ordered for: design-momentum

- [x] T1: a conforming inventory_code (location-batch-serial) backfills batch_number from segment 2 and serial_number from segment 3 on the migrated table (shared UP-state branch)  (AC1-conforming-code-backfilled)
- [x] T2: a nonconforming code lacking a batch/serial segment leaves batch_number and serial_number NULL while its row (quantity, sku, location) remains present (shared UP-state branch)  (AC2-nonconforming-code-left-null)
- [x] T3: location retains its original canonical value and is never overwritten from the code's leading segment after the migration (shared UP-state branch)  (AC3-location-stays-canonical)
- [x] T4: the retired inventory_code column no longer exists on stock_records while batch_number and serial_number are first-class queryable columns (shared UP-state branch)  (AC4-combined-code-retired)
- [x] T5: inserting two stock_records with the same (sku, location) raises a unique-constraint IntegrityError against the branch DB, proving UNIQUE(sku, location) survived the migration unchanged  (AC3-location-stays-canonical)
- [x] T6: inserting a stock_records row with NULL batch_number and NULL serial_number commits successfully against the branch DB, proving both columns carry no NOT NULL constraint  (AC2-nonconforming-code-left-null)
- [x] T7: the integrity probe reports the count of nonconforming rows over a mixed seed, scoped to the test's own marker SKUs (delta / filtered count, never an absolute whole-table total) on the shared UP-state branch  (AC5-integrity-probe-reports-nonconforming-count)
- [x] T8: the down migration re-adds inventory_code and reconstructs it as location-batch-serial for conforming rows; verified on an isolated ephemeral branch by alembic upgrade then downgrade -1 (@pytest.mark.migration), seeding idempotently, never downgrading the shared verify branch  (AC6-down-migration-reconstructs-code)
- [x] T9: on an isolated ephemeral branch, seed a mixed pre-migration seed (conforming + nonconforming rows) with per-run-unique SKUs, run alembic upgrade, then assert every seeded row survives with quantity/sku/location intact; @pytest.mark.migration, never on the shared UP-state branch  (AC1-conforming-code-backfilled)
- [x] T10: for a stock position with both batch and serial populated, the stock view renders a batch entry and a serial entry as two separately labelled fields, each showing its own value via its data-testid seam  (AC1-distinct-labelled-fields)
- [x] T11: the app/routes stock payload for a populated row carries batch_number and serial_number as two distinct fields (real branch UP-state)  (AC1-distinct-labelled-fields)
- [x] T12: for a stock position whose batch or serial is null, the stock view renders an explicit 'none yet' indicator in that field rather than leaving it blank  (AC2-empty-field-shows-none-yet)
- [x] T13: the app/routes stock payload emits JSON null for an unpopulated batch_number/serial_number, passing the NULL through untouched (real branch UP-state)  (AC2-empty-field-shows-none-yet)
- [x] T14: the stock view renders no combined tracking-code element anywhere; the batch and serial entries are the only surface for that identity  (AC3-combined-code-no-longer-shown)
- [x] T15: the app/routes stock payload contains no inventory_code key, proving the retired combined-code column is not serialized (real branch UP-state)  (AC3-combined-code-no-longer-shown)
- [x] T16: the app/routes stock boundary returns JSON data only and never server-rendered HTML (R5 usability contract), verified against the response content-type/body  (AC1-distinct-labelled-fields)

## Deferred / skipped
- (none)
