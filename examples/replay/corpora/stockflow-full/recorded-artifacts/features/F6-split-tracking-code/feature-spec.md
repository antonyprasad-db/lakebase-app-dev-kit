# Split the combined tracking code into batch and serial columns

## Summary

Refactors the V1 `inventory_code` schema from a hyphen-delimited combined code into separate `batch_number` and `serial_number` columns. The migration backfills all existing stock records from the combined code, validates data integrity, and drops the obsolete column. Users then see batch and serial as distinct fields in the UI wherever the combined code was previously shown.

## Stories

- S1-add-and-backfill-columns – Add batch_number and serial_number columns, backfill from inventory_code, probe for nonconforming rows
- S2-drop-combined-code – Drop the combined inventory_code column and provide reversible down-migration
- S3-expose-batch-serial-in-stock-ui – Display batch and serial as separate fields in stock detail and list views

## Out of scope

- Changing the primary unique key UNIQUE(sku, location); location remains canonical and unchanged in this iteration
- Parsing by fixed width; the parser splits on delimiter ("-") only
- Retroactive location extraction from the inventory_code (the leading segment is not treated as authoritative for location)
- UI filtering or sorting by batch or serial (those are user-facing behaviors deferred to a later story)

## Open questions

- After backfill, what is the threshold for nonconforming row count that should trigger a rejection or warning in the integrity probe? Is the count surfaced for manual review before deploy, or is deployment prevented at a certain count?
- For codes that do not parse as location-batch-serial (e.g., "X-1", "c"), is the preferred behavior to set batch_number and serial_number to NULL, or should the probe reject the migration if any nonconforming row is found?
- Should the down-migration reconstruct inventory_code exactly as it was before, or in a canonicalized format (e.g., location + "-" + batch + "-" + serial with NULLs omitted)?
