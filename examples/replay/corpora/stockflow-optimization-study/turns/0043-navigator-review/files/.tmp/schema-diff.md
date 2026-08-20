## Schema (Lakebase branch `feature-f1-stock-visibility`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260819190000_create_stock_records | (alembic) |

### Schema diff: `feature-f1-stock-visibility` vs production

**SCHEMA CHANGES (Lakebase diff)**

+ TABLE stock_records (CREATED)
  L id bigint
  L sku text
  L location text
  L quantity integer
  L tracking_code text
