# Split the combined tracking code into batch and serial columns

## Summary

The V1 `inventory_code` bundles location, batch, and serial into one opaque hyphen-delimited string, so nothing can query or validate batch and serial on their own. This feature pulls batch and serial into their own first-class columns, backfills them from the existing codes, retires the combined column, and keeps `location` canonical, all as a reversible migration in which every existing stock row survives.

## Stories

- **S1-split-and-backfill-migration** - Reversibly add `batch_number` and `serial_number`, backfill them by delimiter-parsing `inventory_code`, surface an integrity-probe count of nonconforming rows, and drop the combined column while `location` stays canonical.
- **S2-batch-serial-fields-in-stock-view** - Show batch and serial as distinct labelled fields in the stock view wherever the combined code used to appear, with an explicit "none yet" for empty fields.

## Out of scope

- Recreating a `location` column: `location` is already its own column (part of `UNIQUE(sku, location)`) and stays canonical and unchanged; this iteration extracts only batch and serial.
- Guessing, defaulting, or inferring batch/serial for codes that do not parse as location-batch-serial: those are left NULL, never fabricated or dropped.
- Fixed-width parsing: the backfill splits on the hyphen delimiter only (segment 2 = batch, segment 3 = serial).
- Any change to how new stock is filed or to filing validation rules; this is a schema refactor of existing data.

## Open questions

- Recommended resolution (S1 as drafted): the integrity probe surfaces only a count of nonconforming rows for review. If the Product Owner wants the offending `inventory_code` values enumerated (not just counted) before acceptance, that is a scope addition to raise now.
- Recommended resolution: codes with more than three segments (extra hyphens beyond location-batch-serial) are treated as conforming, with segment 2 as batch and segment 3 as serial and later segments ignored. Confirm this rather than treating them as nonconforming.
- Recommended resolution: a code with exactly two segments (location-batch, no serial) backfills batch from segment 2 and leaves serial_number NULL. Confirm whether a missing serial alone should instead classify the whole row as nonconforming.
