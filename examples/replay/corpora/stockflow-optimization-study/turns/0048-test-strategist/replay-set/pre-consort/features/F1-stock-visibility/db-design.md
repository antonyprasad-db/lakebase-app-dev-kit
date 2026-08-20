# F1-stock-visibility , Physical DB Design

## Tables

### `stock_records`
Mirrors the `app/models/` domain object for a filed stock level. One row per (SKU, location) pair.

| column | type | null | notes |
|---|---|---|---|
| `id` | bigint | no | surrogate PK, identity |
| `sku` | text | no | SKU identity (AC1) |
| `location` | text | no | physical location (AC1) |
| `quantity` | integer | no | filed level (AC1); `>= 0` |
| `inventory_code` | text | yes | combined tracking code stored verbatim (AC2) |

- **PK**: `id`
- **Unique**: `(sku, location)` composite
- **Check**: `ck_stock_records_quantity_non_negative` = `quantity >= 0`
- **Index**: `uq_stock_records_sku_location` (unique, backs the upsert lookup)

## Per-story migration plan

**S1-file-stock-record** , single additive `create_table` for `stock_records`. No pre-existing table is altered or dropped; `downgrade()` drops the new table cleanly, so the migration is fully reversible and preserves existing inventory rows (PI4/R1). The composite unique constraint enables the repository's `ON CONFLICT (sku, location)` upsert so a repeat filing updates in place (AC3) rather than inserting a duplicate or erroring.

## Invariant realization

| invariant | physical construct |
|---|---|
| PI1-unique-sku-location | `UNIQUE (sku, location)` + unique index `uq_stock_records_sku_location` |
| PI2-required-columns-not-null | `NOT NULL` on `sku`, `location`, `quantity` |
| PI3-quantity-non-negative | `CHECK (quantity >= 0)` `ck_stock_records_quantity_non_negative` |
| PI4-migration-reversible | additive `create_table` with a clean `drop` downgrade; no data mutation on upgrade |

All constraints are verified against the real paired Lakebase branch via integration tests (never a mock).
