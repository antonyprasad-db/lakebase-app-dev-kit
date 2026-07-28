## Schema (Lakebase branch `experiment-s1-file-stock-record-exp1`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260727202444_create_stock_records_table | (alembic) |

### Schema diff: `experiment-s1-file-stock-record-exp1` vs production

**SCHEMA CHANGES (Lakebase diff)**

+ TABLE alembic_version (CREATED)
  L version_num character varying

+ TABLE stock_records (CREATED)
  L id integer
  L sku character varying
  L location character varying
  L quantity integer
  L inventory_code character varying
