# F6 Split Tracking Code — Physical DB Design

## Table summary

`stock_records` (existing from F1) is refactored in place. The combined `inventory_code`
is split into two nullable columns and then dropped:

| column | type | nullable | notes |
|--------|------|----------|-------|
| id | bigint | no | PK (identity), unchanged |
| sku | text | no | part of UNIQUE(sku, location) |
| location | text | no | canonical; part of UNIQUE(sku, location); reused in downgrade |
| quantity | integer | no | CHECK quantity >= 0 (from F1) |
| batch_number | text | yes | 2nd segment of legacy code (new) |
| serial_number | text | yes | 3rd segment of legacy code (new) |

- PK: `id`
- UNIQUE: `(sku, location)` (`uq_stock_records_sku_location`) — untouched
- CHECK: `quantity >= 0`

## Migration plan (S1) — expand/contract, single transaction

1. **add_column** — `batch_number text NULL`, `serial_number text NULL` (additive first).
2. **alter_column (data backfill)** — for well-formed 3-segment `inventory_code`
   (`location-batch-serial`), set `batch_number = split_part(inventory_code,'-',2)`,
   `serial_number = split_part(inventory_code,'-',3)`. Short/malformed codes leave both
   NULL. Then run an integrity **COUNT probe** of NULL rows, emitted to the migration log
   for operator review before the drop is accepted.
3. **drop** — drop `inventory_code` only after the probe (AC4 → AC5 ordering).

The entire up migration runs in one transaction: all rows survive with unchanged
identity and canonical location, or the whole thing rolls back.

**Downgrade (reversible):** re-add `inventory_code text NULL`, reconstruct it as
`location || '-' || batch_number || '-' || serial_number` (NULL where batch/serial are
NULL), then drop `batch_number`/`serial_number` — restoring the pre-migration shape for a
clean round trip.

## Invariant realization

- **PI1-migration-atomic** — whole up migration wrapped in a single transaction; row
  count and identity preserved or full rollback (AC3).
- **PI2-batch-serial-nullable** — `batch_number`/`serial_number` declared NULLABLE;
  malformed codes backfill to NULL, no row dropped (AC2).
- **PI3-migration-reversible** — expand/contract sequencing; downgrade re-adds and
  reconstructs `inventory_code` from canonical `location` + batch + serial (AC6).
- **PI4-unique-sku-location-preserved** — `UNIQUE(sku, location)` and `location` are
  never altered or replaced across up/down (R3).

Verified against the paired Lakebase branch (Alembic applied first), never a mock (NFR-F6-4).
