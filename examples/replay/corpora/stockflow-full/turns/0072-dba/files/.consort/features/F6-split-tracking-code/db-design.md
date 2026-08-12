# F6 Split Tracking Code — Physical Schema (DBA)

Physical realization of the architect's `persistence_invariants[]` for story
`S1-add-and-backfill-columns`. Single persisted domain object: `app/models/stock.py` -> `stock` table.

## Table summary

`stock` carries forward F1 unchanged and adds two split columns:

| column | type | null | notes |
|---|---|---|---|
| id | uuid | no | PK, `gen_random_uuid()` |
| sku | text | no | canonical, part of UNIQUE(sku, location) |
| location | text | no | canonical addressing, NOT re-derived from code (R3) |
| quantity | integer | no | default `0`, CHECK >= 0 |
| inventory_code | text | yes | original combined code, retained for reversibility |
| batch_number | text | **yes** | segment 2 of code; NULL when nonconforming |
| serial_number | text | **yes** | segment 3 of code; NULL when nonconforming |

Constraints unchanged from F1: PK(id), UNIQUE(sku, location) (`uq_stock_sku_location`),
CHECK(quantity >= 0).

## Migration plan (S1)

One additive Alembic migration, run as a single transaction:

1. `ADD COLUMN batch_number text NULL`, `ADD COLUMN serial_number text NULL` — no default, no NOT NULL.
2. Backfill in-place UPDATE: `batch_number = split_part(inventory_code,'-',2)`,
   `serial_number = split_part(inventory_code,'-',3)`, parsed by hyphen delimiter (not fixed
   width); an absent/empty segment yields NULL. Never DELETEs, never mutates sku/location/quantity.
3. Integrity probe (read-only): `COUNT(*) WHERE batch_number IS NULL AND serial_number IS NULL`,
   surfaced for human review before acceptance.

**Downgrade:** `drop_column('serial_number')`, `drop_column('batch_number')`. Split identity is
reconstructible from the retained `inventory_code` + canonical `location`, so the drop loses no data.

## Invariant realization

- **PI1-batch-serial-nullable** — `batch_number`/`serial_number` declared NULLABLE with no default; nonconforming codes rest at NULL (AC3). sku/location/quantity stay NOT NULL.
- **PI2-sku-location-unique-preserved** — UNIQUE(sku, location) and the `location` column left untouched by the migration; location is not re-derived from the code (R3).
- **PI3-add-backfill-atomic** — ADD COLUMN + backfill UPDATE in one Alembic transaction; a failed run rolls back wholesale (AC4, R1).
- **PI4-every-row-preserved** — backfill is an in-place UPDATE only; no DELETE, no rewrite of canonical fields. Verified by before/after row-count + sku/location/quantity diff on the paired branch (AC4).
- **PI5-migration-reversible** — paired downgrade drops the two columns; end-state reversibility guaranteed by reconstructing from `inventory_code` + `location` (R1).
