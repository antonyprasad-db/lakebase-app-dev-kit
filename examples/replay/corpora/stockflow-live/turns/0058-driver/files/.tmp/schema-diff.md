## Schema (Lakebase branch `experiment-s3-inspect-sku-detail-exp1`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260710005729_create_stock_records_table | (alembic) |
| 20260710005839_add_stock_records_audit_columns | (alembic) |
| 20260710015046_add_par_level_to_stock_records | (alembic) |

### Schema diff: `experiment-s3-inspect-sku-detail-exp1` vs production

**SCHEMA CHANGES (Lakebase diff)**

~ TABLE stock_records (MODIFIED)
  + par_level integer
