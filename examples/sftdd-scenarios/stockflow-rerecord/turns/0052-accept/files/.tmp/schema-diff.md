## Schema (Lakebase branch `experiment-s3-sku-detail-view-exp1`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260727202444_create_stock_records_table | (alembic) |
| 20260727220143_add_tracking_code_to_stock_records | (alembic) |

### Schema diff: `experiment-s3-sku-detail-view-exp1` vs production

**SCHEMA CHANGES (Lakebase diff)**

~ TABLE stock_records (MODIFIED)
  + tracking_code character varying
