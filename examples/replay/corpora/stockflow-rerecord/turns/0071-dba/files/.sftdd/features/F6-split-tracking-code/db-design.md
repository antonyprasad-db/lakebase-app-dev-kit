# F6 Split Tracking Code , Physical DB Design

## Schema summary

One persisted domain object: `stock_records` (mirrors `app/models/`), evolved in place
from F1. This feature splits the combined `inventory_code` into two nullable segment
columns and drops the combined column via an expand/contract sequence.

| column | type | nullable | notes |
|---|---|---|---|
| id | uuid | no | pk, default `gen_random_uuid()` (F1) |
| sku | text | no | (sku, location) unique pair; unchanged |
| location | text | no | (sku, location) unique pair; never mutated (AC8) |
| batch_number | text | **yes** | new; batch segment (AC1/AC2), NULL when nonconforming (AC4) |
| serial_number | text | **yes** | new; serial segment (AC1/AC2), NULL when nonconforming (AC4) |
| quantity | integer | no | CHECK >= 0, inherited from F1, unmodified |
| created_at | timestamptz | no | F1 |
| updated_at | timestamptz | no | F1 |

Constraints unchanged from F1: PK on `id`, composite unique on `(sku, location)`,
CHECK `quantity >= 0`.

## Per-story migration plan , S1-split-columns-migration (expand/contract)

1. **add_column (expand):** add `batch_number` and `serial_number`, both `text NULLABLE`.
   Purely additive, no rows touched.
2. **alter_column (backfill):** parse `inventory_code` as `location-batch-serial`; write the
   batch/serial segments to the new columns for conforming rows, leave NULL for
   nonconforming rows (AC2, AC4). No row deleted (AC5). `location` is never rewritten from
   the code (AC8). A pre-acceptance probe counts still-NULL rows to surface the
   nonconforming count for operator review (AC6).
3. **drop (contract):** drop `inventory_code` only after backfill completes (AC3, NFR-F6-6).

**Reversibility (AC7):** downgrade re-adds `inventory_code`, reconstructs its value from
`location + batch_number + serial_number`, then drops the two segment columns , restoring
the pre-migration schema shape. No up-step deletes rows, so the round-trip preserves every
record.

## Invariant realization

- **PI1-batch-serial-nullable** , `batch_number` and `serial_number` declared `NULLABLE`;
  the migration imposes no NOT NULL, so nonconforming codes persist as NULL (AC4).
- **PI2-location-key-preserved** , the `(sku, location)` unique constraint and both key
  columns are carried over untouched; the backfill writes only the two new columns and
  never mutates `location` (AC8).
- **PI3-rows-preserved** , additive-then-backfill-then-drop up path deletes no rows (AC5);
  the downgrade reconstructs `inventory_code` and restores the prior shape (AC7).

Verified via real paired-branch Alembic migration integration tests (never a mock),
per NFR-F6-3.
