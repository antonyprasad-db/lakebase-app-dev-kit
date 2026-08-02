## Schema (Lakebase branch `experiment-s1-file-stock-exp1`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260801033642_create_stock_records | (alembic) |

### Schema diff: `experiment-s1-file-stock-exp1` vs production

**SCHEMA CHANGES (Lakebase diff)**

+ TABLE stock_records (CREATED)
  L id integer
  L sku character varying
  L location character varying
  L quantity integer
  L inventory_code character varying
  L created_at timestamp with time zone
  L updated_at timestamp with time zone
