# Test list: F6-split-tracking-code
Ordered for: design-momentum

- [x] T1: After the up migration, the batch_number column in stock_records is defined as nullable in the real-branch schema (information_schema.columns IS_NULLABLE = YES)  (AC1-wellformed-code-backfilled)
- [x] T2: After the up migration, the serial_number column in stock_records is defined as nullable in the real-branch schema (information_schema.columns IS_NULLABLE = YES)  (AC1-wellformed-code-backfilled)
- [x] T3: A row whose inventory_code is a well-formed three-segment hyphen-delimited string has batch_number equal to the second segment after the backfill step  (AC1-wellformed-code-backfilled)
- [x] T4: A row whose inventory_code is a well-formed three-segment hyphen-delimited string has serial_number equal to the third segment after the backfill step  (AC1-wellformed-code-backfilled)
- [x] T5: A row whose inventory_code has fewer than three hyphen-delimited segments has batch_number equal to NULL after the backfill step, with no exception raised  (AC2-malformed-code-backfills-null)
- [x] T6: A row whose inventory_code has fewer than three hyphen-delimited segments has serial_number equal to NULL after the backfill step, with no exception raised  (AC2-malformed-code-backfills-null)
- [x] T7: After the up migration completes, the count of rows in stock_records equals the count before the migration for the test's own seeded rows (delta is zero)  (AC3-all-rows-survive)
- [x] T8: After the up migration completes, each seeded row retains its original id value  (AC3-all-rows-survive)
- [x] T9: After the up migration completes, each seeded row retains its original location value  (AC3-all-rows-survive)
- [x] T10: After the up migration completes, the UNIQUE constraint on (sku, location) exists on stock_records in the real-branch schema  (AC3-all-rows-survive)
- [x] T11: Given any migration step fails partway, when the migration rolls back, the stock_records table is left exactly as it was before the migration started  (AC3-all-rows-survive)
- [x] T12: The migration reads its database connection exclusively from the DATABASE_URL environment variable; no connection string is hardcoded in any migration file  (AC3-all-rows-survive)
- [x] T13: Given a known mix of conforming and non-conforming inventory_codes, when the up migration completes its backfill, then the integrity probe reports a count of NULL batch_number/serial_number rows equal to the actual number of non-conforming rows  (AC4-integrity-probe-count)
- [x] T14: After the up migration completes, the inventory_code column does not exist in the stock_records schema on the real branch  (AC5-inventory-code-dropped)
- [x] T15: After a single-step downgrade then upgrade of this migration on the real branch, the stock_records schema matches the expected post-upgrade shape (batch_number, serial_number present; inventory_code absent)  (AC6-migration-reversible)
- [x] T16: After a single-step downgrade of this migration, rows seeded before the up migration are still present in stock_records with their original id values  (AC6-migration-reversible)
- [x] T17: Given the up migration has been applied, when the down migration runs, then inventory_code is re-added and reconstructed from canonical location, batch_number, and serial_number for each row  (AC6-migration-reversible)

## Deferred / skipped
- (none)
