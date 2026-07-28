# F1-stock-visibility , Physical DB Design

## Schema summary

One persisted domain object (`app/models/stock_record.py`) maps to one table: `stock_records`.

| column | type | nullable | default | notes |
|---|---|---|---|---|
| id | bigint | no | identity | surrogate PK |
| sku | text | no | , | filed SKU (AC1) |
| location | text | no | , | storage location (AC1) |
| quantity | integer | no | , | filed quantity, CHECK >= 0 |
| inventory_code | text | no | , | combined tracking code (AC1) |
| created_at | timestamptz | no | now() | creation timestamp, survives migrations (R1) |
| updated_at | timestamptz | no | now() | refreshed on in-place refile (AC2) |

Constraints: PK `(id)`; composite UNIQUE `(sku, location)`; CHECK `quantity >= 0`. No foreign keys (single-table feature).

## Per-story migration plan

### S1-file-stock-record , `create_table stock_records`

Single additive `create_table`. The Alembic `upgrade()` creates the table with all columns, the composite unique, and the check; `downgrade()` drops the table. The pair is symmetric and reversible, and rows written before this migration are untouched (satisfies PI4 / R1). No expand/contract split is needed since this is the initial create.

## Invariant realization

- **PI1-unique-sku-location** , composite `UNIQUE (sku, location)` (`uq_stock_records_sku_location`). A repeat filing collides and the service resolves it as an in-place update (AC2), never a duplicate.
- **PI2-not-null-core-fields** , `NOT NULL` on `sku`, `location`, `quantity`, `inventory_code`; a filing missing any core field is rejected at write time (AC1).
- **PI3-quantity-non-negative** , `CHECK (quantity >= 0)` (`ck_stock_records_quantity_non_negative`), backing NFR2 / R2 at the schema level.
- **PI4-migration-reversible** , the `create_table` migration ships a working `downgrade()` (drop table) and preserves pre-existing records across the additive change (R1).

All schema decisions are verifiable against the paired `databricks_postgres` branch with Alembic applied first (NFR4); no mock or in-memory substitute is used.
