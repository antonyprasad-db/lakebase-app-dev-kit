# F6 Split Tracking Code , Physical Schema

## Table: stock_records (evolved from F1)

Single persisted domain object (`app/models/stock.py`). This story refactors the
combined `inventory_code` column into two first-class columns via an expand/contract
(parallel-change) sequence. `id` PK, `UNIQUE(sku, location)`, and
`CHECK (quantity >= 0)` all carry over from F1 unchanged.

| column | type | nullable | notes |
|---|---|---|---|
| id | bigint | no | identity PK (F1) |
| sku | text | no | half of UNIQUE(sku, location) |
| location | text | no | canonical; never overwritten from code (AC3) |
| quantity | integer | no | preserved untouched |
| batch_number | text | **yes** | split segment 2; NULL for nonconforming (PI3, AC2) |
| serial_number | text | **yes** | split segment 3; NULL for nonconforming (PI3, AC2) |
| created_at | timestamptz | no | preserved |
| updated_at | timestamptz | no | preserved |

`inventory_code` (present after F1) is dropped by the up migration (AC4).

## Migration plan (S1-split-and-backfill-migration)

Expand -> backfill -> contract, all in one transaction so add+backfill is atomic:

1. `add_column batch_number text NULL`
2. `add_column serial_number text NULL`
3. backfill: split `inventory_code` on `-`; segment 2 -> batch_number, segment 3 -> serial_number. Conforming codes populate both (AC1); codes without those segments leave both NULL (AC2); `location` is never rewritten from the leading segment (AC3); no row is dropped (PI4). An integrity probe using the same parse rule counts unparseable rows for review before acceptance (AC5).
4. `drop inventory_code` (AC4).

### Reversibility (down path, AC6 / PI1)

`downgrade()` re-adds `inventory_code text`, reconstructs each value from
`location + '-' + batch_number + '-' + serial_number` (the join rule mirrors the
up-split rule), then drops `serial_number` and `batch_number`. Up-then-down
round-trips both the schema and every row. Delimiter-only parsing; no fabrication.

## Invariant realization

| invariant | realized by |
|---|---|
| PI1-migration-reversible | symmetric upgrade()/downgrade() in one transaction; down re-adds and reconstructs inventory_code (AC6) |
| PI2-sku-location-unique-preserved | UNIQUE(sku, location) / `uq_stock_records_sku_location` left intact; location column untouched (AC3) |
| PI3-batch-serial-nullable | batch_number and serial_number added NULLABLE, no default (AC2) |
| PI4-row-survival | backfill mutates only the two new columns; quantity/sku/location preserved and no row dropped on parse failure (AC1/AC2) |
