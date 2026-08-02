## Schema (Lakebase branch `experiment-s1-split-columns-migration-exp1`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260801033642_create_stock_records | (alembic) |
| 20260801065232_split_inventory_code_columns | (alembic) |

### Schema diff: `experiment-s1-split-columns-migration-exp1` vs production

**SCHEMA CHANGES (Lakebase diff)**

~ TABLE stock_records (MODIFIED)
  + batch_number character varying
  + serial_number character varying
