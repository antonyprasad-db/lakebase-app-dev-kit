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
| Persistence / row survival (PI4) | Infra / migration | Alembic `migrations/versions/*` | Forward data-preservation guarantee; verified on the ISOLATED migration branch (seed pre-migration rows -> upgrade -> assert survival), not the shared UP-state branch |
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
- AC1, AC2, AC3, AC4, AC5: `kind:behavior` tests on the SHARED verify branch in its UP
  state (migration already applied). Assert backfill, NULL policy, location canonicality,
  combined-column drop, and the integrity-probe count over a mixed seed. These never run a
  downgrade.
- AC6 (down-migration reconstruction): MUST be a `kind:fitness` test marked
  `@pytest.mark.migration` on an ISOLATED ephemeral Lakebase branch that applies up then
  `alembic downgrade -1` and asserts `inventory_code` is reconstructed from
  location+batch+serial for conforming rows and the combined column is restored.
  Canon rule: do NOT downgrade the shared verify branch , doing so drops
  batch_number/serial_number and re-adds inventory_code, breaking every UP-state test
  (AC1-AC5). The reconstruction assertion is absorbed into that single isolated migration
  fitness test, not the shared-branch behavior suite. Reconstruction is lossy for
  nonconforming (NULL) rows, so the round-trip covers conforming rows only.
- Persistence invariants: PI2 (UNIQUE(sku, location) preserved) and PI3 (batch/serial
  nullable) are SCHEMA-SHAPE invariants observable in the migrated table, so they get
  real-branch tests on the shared UP-state branch. PI4 (row survival across the up
  migration) is a MIGRATION-FORWARD data-preservation guarantee: verifying it requires
  seeding pre-migration rows and then running the up migration, which the shared UP-state
  branch cannot do (the migration is already applied there, so pre-migration rows cannot be
  seeded and there is no in-flight migration to observe). PI4 is therefore verified by the
  SAME isolated ephemeral `@pytest.mark.migration` fitness test as AC6/PI1 (seed a mixed
  pre-migration seed -> `alembic upgrade` -> assert every seeded row is still present with
  quantity/sku/location intact), NOT on the shared branch. PI1 (migration_reversible) is
  likewise covered by that isolated fitness test, never on the shared branch.
  Resolution note (reflection gate reflect-testlist-defect): the T9 PI4-row-survival test
  correctly lives on the isolated migration branch; this architecture is updated to route
  PI4 there so the doc and the test list agree.

## Sign-off

Recommendation: **proceed**. Layers inherited from F1, service_backed=true, persistence
invariants and NFRs declared, all six ACs annotated as Infra. , Architect Reviewer.
