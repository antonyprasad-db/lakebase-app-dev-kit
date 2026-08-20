## Schema (Lakebase branch `staging`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260819190000_create_stock_records | (alembic) |

### Schema diff: `staging` vs production

**SCHEMA CHANGES (Lakebase diff)**

+ TABLE alembic_version (CREATED)
  L version_num character varying

+ TABLE stock_records (CREATED)
  L id bigint
  L sku text
  L location text
  L quantity integer
  L tracking_code text
