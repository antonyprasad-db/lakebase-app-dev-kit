## Schema (Lakebase branch `experiment-s1-file-stock-record-exp1`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260710005729_create_stock_records_table | (alembic) |
| 20260710005839_add_stock_records_audit_columns | (alembic) |

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
  L created_at timestamp with time zone
  L actor character varying
