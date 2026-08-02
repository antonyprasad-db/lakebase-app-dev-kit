# Physical schema , F1-stock-visibility

Realizes the architect's `persistence_invariants[]` for `app/models/stock_record.py`. One persisted domain object -> one table (`stock_records`).

## Tables

### stock_records
Single table holding one row per (sku, location) pair.

| column | type | nullable | default | notes |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | surrogate PK |
| sku | text | no | , | addressing key |
| location | text | no | , | addressing key |
| inventory_code | text | no | , | combined code, stored as filed |
| quantity | integer | no | , | stock level |
| created_at | timestamptz | no | now() | immutable (NFR-F1-1) |
| updated_at | timestamptz | no | now() | bumped on in-place upsert |

- Primary key: `id`.
- Unique constraint: `(sku, location)`.
- Check: `quantity >= 0`.

## Migration plan (per story)

### S1-file-stock , create_table stock_records
Additive create only. `upgrade()` creates the table with the composite unique constraint and the non-negative check; `downgrade()` drops the table. Nothing pre-existing is altered, so any prior records survive (R1).

## Invariant realization mapping

- **PI1-sku-location-unique** , composite `UNIQUE (sku, location)` (+ matching unique index). At most one row per pair; a repeat write collapses to that row (AC3).
- **PI2-quantity-not-null** , `NOT NULL` on `sku`, `location`, `inventory_code`, `quantity`.
- **PI3-quantity-non-negative** , `CHECK (quantity >= 0)` (`ck_stock_records_quantity_non_negative`); backs R2 rejection at the DB.
- **PI4-upsert-atomic** , the service wraps read-existing-then-write in one transaction; the DB unique constraint (PI1) is the ultimate guard so a concurrent repeat file cannot store two rows. No schema construct beyond the unique constraint is needed; realization is transactional in the service/repository.
- **PI5-migration-reversible** , the Alembic migration authored from the `create_table` change is additive with a working `downgrade()` that drops the table, preserving records created before it (R1).
