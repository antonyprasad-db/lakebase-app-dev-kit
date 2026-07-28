# Architecture: F6 Split tracking code

Reuses the F1-stock-visibility layer convention verbatim: boundary=`app/routes` (react),
service=`app/services`, repository=`app/repositories`, models=`app/models`. No layer is
remapped or renamed; this feature adds no new layer. S1 is a schema-refactor story whose
whole surface lives below the boundary (Alembic migration + repository read paths), so its
ACs are all `Infra`.

## Architectural Concerns Mapping

| Concern | Owner layer | Module | Notes |
|---|---|---|---|
| Schema change (add/backfill/drop columns) | Infra / migration | Alembic `migrations/versions/*` | Additive add + backfill + drop, all in one reversible revision |
| Delimiter parse of `inventory_code` | Service (backfill logic) | `app/services` | Segment 2 -> batch, segment 3 -> serial; >3 segments conform (extras ignored); unparseable -> NULL |
| Persistence / row survival | Repository | `app/repositories` | Only layer touching the ORM/session; reads migrated rows for verification |
| Domain entity shape | Models | `app/models/stock.py` | `batch_number`, `serial_number` nullable columns replace `inventory_code` |
| Integrity probe (nonconforming count) | Service | `app/services` | Reports count for review at accept time; no fabrication |
| Canonical location | Repository / schema | `app/repositories`, `stock` table | `location` untouched; UNIQUE(sku, location) preserved |
| Validation messages | Boundary | `app/routes` | N/A for S1 (no request surface); inherited for S2 |
| Config in env (DATABASE_URL) | Infrastructure | scaffold defaults | Paired-branch `databricks_postgres`; not renamed |

## Pattern proposals

- Keep the ORM/session strictly in `app/repositories`; the backfill and probe logic is
  pure transformation in `app/services` operating over rows the repository yields, so the
  parse rule is unit-addressable and the migration stays thin (SRP, dependency-inversion).
- Model the domain change in `app/models/stock.py` (one module per entity, package form),
  not a flat `app/models.py`.
- Backfill executes inside the migration transaction so add + backfill + drop are atomic.

## Risks

- Delimiter parsing of >3-segment codes: treated as conforming (segments beyond serial
  ignored). If real data has meaningful trailing segments, backfill loses them silently.
- Two-segment codes (location-batch, no serial): batch backfills, serial stays NULL. If the
  PO wants those classed nonconforming instead, the probe count and NULL policy shift.
- Down-migration reconstruction cannot recover the original code for rows whose batch/serial
  were left NULL (nonconforming); reconstruction is lossy for those rows.

## Decisions (Gate 2, PO adjudicates)

- **Probe output = count only.** Recommendation: proceed as drafted (count of nonconforming
  rows), do not enumerate offending `inventory_code` values unless the PO asks now.
- **>3-segment codes conform.** Recommendation: treat as conforming, segment 2=batch,
  segment 3=serial, later segments ignored.
- **2-segment codes.** Recommendation: backfill batch, leave serial NULL (do not class the
  whole row nonconforming).

## Test strategy

Real-DB integration tests against the paired Lakebase branch (`databricks_postgres` via
`DATABASE_URL`), pytest-bdd with Alembic migrations applied to the branch first, FK-aware
targeted-DELETE cleanup. No mock/stub/in-memory DB. Coverage:
- AC1, AC2, AC3, AC4: run the up migration on seeded branch rows, assert backfill, NULL
  policy, location canonicality, and combined-column drop.
- AC5: assert the integrity probe returns the nonconforming count over a mixed seed.
- AC6: run up then down on the branch, assert `inventory_code` is reconstructed and restored.
- Persistence invariants PI1-PI4 each get a real-branch test.

## Sign-off

Recommendation: **proceed**. Layers inherited from F1, service_backed=true, persistence
invariants and NFRs declared, all six ACs annotated as Infra. , Architect Reviewer.
