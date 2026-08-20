# Split tracking code into batch and serial columns

## Summary

The V1 `inventory_code` combined location, batch, and serial into a single hyphen-delimited string, making batch and serial opaque and un-queryable. This feature refactors the schema to make batch_number and serial_number first-class columns, backfills all existing data safely, and exposes them as distinct fields throughout the API and UI. Every existing stock row survives the migration, and malformed codes receive NULL values with a count surfaced for review.

## Stories

- S1-perform-batch-serial-schema-migration: Alembic migration to add batch_number and serial_number columns, backfill from inventory_code, handle malformed codes, verify integrity, drop inventory_code column
- S2-expose-batch-serial-in-api: Update API responses to return batch_number and serial_number as separate fields
- S3-display-batch-serial-separately: Update UI to display batch and serial as separate fields in stock list and forms (E2E)

## Out of scope

- Location is NOT recreated as a column; it remains canonical and part of the UNIQUE(sku, location) constraint
- The leading segment of inventory_code is NOT repurposed as a location column; location stays unchanged
- Codes with missing batch or serial segments (e.g., "X-1" or bare "c") are backfilled with NULL, not guessed or dropped
- The refactor does not change the inbound or outbound transaction recording; only the stock record schema and display
- Multi-warehouse distribution is not addressed by this feature

## Open questions

- Should the API response include both batch_number/serial_number AND the reconstructed inventory_code for backward compatibility with existing clients, or only the new fields?
- Are there any external systems or reports that depend on the inventory_code format that require migration support or deprecation warnings?
- What is the acceptable threshold of non-conforming rows that would trigger a rollback or manual investigation before the migration is accepted?
