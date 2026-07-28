## Schema (Lakebase branch `experiment-s1-split-and-backfill-migration-exp1`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260727202444_create_stock_records_table | (alembic) |
| 20260727220143_add_tracking_code_to_stock_records | (alembic) |
| 20260728000159_split_inventory_code_into_batch_and_ | (alembic) |

### Schema diff: `experiment-s1-split-and-backfill-migration-exp1` vs production

**SCHEMA CHANGES (Lakebase diff)**

~ TABLE stock_records (MODIFIED)
  + batch_number character varying
  + serial_number character varying
