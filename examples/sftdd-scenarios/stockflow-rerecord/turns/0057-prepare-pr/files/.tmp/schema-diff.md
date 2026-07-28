## Schema (Lakebase branch `feature-f1-stock-visibility`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260727202444_create_stock_records_table | (alembic) |
| 20260727220143_add_tracking_code_to_stock_records | (alembic) |

### Schema diff: `feature-f1-stock-visibility` vs production

**SCHEMA CHANGES (Lakebase diff)**

+ TABLE stock_records (CREATED)
  L id integer
  L sku character varying
  L location character varying
  L quantity integer
  L inventory_code character varying
  L tracking_code character varying
