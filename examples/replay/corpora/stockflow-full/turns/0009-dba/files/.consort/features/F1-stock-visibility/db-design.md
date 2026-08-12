# F1 Stock Visibility — Physical Schema (db-design)

## Tables

### `stock`
One row per uniquely addressable (SKU, location) pair. Mirrors `app/models/stock.py`.

| column | type | null | default | notes |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | surrogate PK |
| sku | text | no | — | identifying pair (AC1) |
| location | text | no | — | identifying pair (AC1) |
| quantity | integer | no | 0 | on-shelf count (AC1) |
| inventory_code | text | yes | — | combined tracking code as filed (AC2) |

- PK: `id`
- UNIQUE: `(sku, location)` (also materialized as unique index `uq_stock_sku_location`)
- CHECK: `ck_stock_quantity_nonnegative` — `quantity >= 0`

## Migration plan (per story)

**S1-file-stock** — `create_table stock`: single additive `op.create_table` with the
composite unique constraint and non-negative check. Reversible: `downgrade` is
`op.drop_table('stock')`.

## Invariant realization mapping

| invariant | realized by |
|---|---|
| PI1-stock-sku-location-unique | UNIQUE `(sku, location)` / index `uq_stock_sku_location` |
| PI2-stock-quantity-nonnegative | CHECK `ck_stock_quantity_nonnegative (quantity >= 0)` |
| PI3-stock-required-fields-not-null | `sku`, `location`, `quantity` all NOT NULL |
| PI4-refile-upsert-atomic | unique `(sku, location)` enables `INSERT ... ON CONFLICT (sku, location) DO UPDATE` — one atomic upsert, no duplicate row (AC3) |
| PI5-migration-reversible | additive `create_table` upgrade preserves existing records; `drop_table` downgrade reverses cleanly |
