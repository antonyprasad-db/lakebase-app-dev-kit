# Architecture: F6 Split tracking code

Reuses the F1-stock-visibility layer convention verbatim: boundary=`app/routes` (react),
service=`app/services`, repository=`app/repositories`, models=`app/models`. No layer is
remapped or renamed; this feature adds no new layer. S1 is a schema-refactor story whose
whole surface lives below the boundary (Alembic migration + repository read paths), so its
ACs are all `Infra`. S2 is the read-side companion: it surfaces the S1-split
`batch_number`/`serial_number` through the React SPA stock view, so its ACs are all `E2E`
(SPA + boundary JSON + persisted DB state), adding no new persistence and no write path.

## Canon posture (per-category, covers both stories)

The reviewer flagged that S2's NFR categories were previously uncovered. Posture recorded
here so the canon covers every category this feature touches:

- **reliability** , data survives the migration (S1, PI4) AND the view renders a
  NULL/missing optional field cleanly as "none yet", never a blank or a null crash (S2).
- **data-integrity** , UNIQUE(sku, location) preserved (S1) AND the read path fabricates
  nothing: NULL shows as "none yet", populated fields show exactly the persisted value (S2).
- **testability** , real Lakebase-branch integration tests for all boundary/DB behavior
  (no mock/stub/in-memory, R4); the SPA render is additionally covered by the client's own
  component test harness.
- **maintainability** , the migration is reversible (S1) AND the retired `inventory_code`
  leaves no orphaned reference in the boundary serializer or the client component (S2).
- **observability** , migration-time integrity probe reports nonconforming-row count (S1);
  the read-only view adds no new domain event, so agent/role log observability stays the
  substrate invariant (S2).
- **usability** , the boundary is a React SPA + JSON API, never server-rendered HTML (R5);
  batch and serial render as two distinct labelled entries where the combined code used to
  appear (S2).

## Architectural Concerns Mapping

| Concern | Owner layer | Module | Notes |
|---|---|---|---|
| Schema change (add/backfill/drop columns) | Infra / migration | Alembic `migrations/versions/*` | Additive add + backfill + drop, all in one reversible revision |
| Delimiter parse of `inventory_code` | Service (backfill logic) | `app/services` | Segment 2 -> batch, segment 3 -> serial; >3 segments conform (extras ignored); unparseable -> NULL |
| Persistence / row survival (PI4) | Infra / migration | Alembic `migrations/versions/*` | Forward data-preservation guarantee; verified on the ISOLATED migration branch (seed pre-migration rows -> upgrade -> assert survival), not the shared UP-state branch |
| Domain entity shape | Models | `app/models/stock.py` | `batch_number`, `serial_number` nullable columns replace `inventory_code` |
| Integrity probe (nonconforming count) | Service | `app/services` | Reports count for review at accept time; no fabrication |
| Canonical location | Repository / schema | `app/repositories`, `stock` table | `location` untouched; UNIQUE(sku, location) preserved |
| Validation messages | Boundary | `app/routes` | N/A for S1 (no request surface); S2 is read-only, no write validation |
| Config in env (DATABASE_URL) | Infrastructure | scaffold defaults | Paired-branch `databricks_postgres`; not renamed |
| Field serialization (S2) | Boundary | `app/routes` | Emits `batch_number` + `serial_number`, NULL as JSON null, no `inventory_code` key |
| Presentation: distinct labels / "none yet" / no combined code (S2) | Client SPA | `client/` stock-view component | null -> "none yet"; two labelled entries; no reference to retired code; no server-rendered HTML |

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

### S2 (stock-view) test strategy

S2 is read-only and splits across two harnesses:
- **Boundary contract (real branch):** integration tests on the shared UP-state Lakebase
  branch assert the `app/routes` stock payload carries `batch_number` and `serial_number`,
  emits JSON null for an unpopulated field (AC2 data half), and contains no `inventory_code`
  key (AC3 data half). Real `databricks_postgres` via `DATABASE_URL`, no mock/stub/in-memory
  (R4). These reuse the S1 UP-state seed; no downgrade.
- **SPA render (client harness):** the React client's own component tests assert two
  separately labelled entries for populated batch/serial (AC1), the "none yet" indicator on
  the null branch (AC2 render half), and the absence of any combined-code element (AC3
  render half). This is R5's "client ships its own component tests" split.

All three S2 ACs are `E2E`: the acceptance truth is the operator seeing distinct labelled
fields, verified through the SPA over persisted branch state, not a below-boundary contract.

## Sign-off

Recommendation: **proceed**. Layers inherited from F1, service_backed=true, persistence
invariants and NFRs declared. S1's ACs are Infra (schema refactor); S2's three ACs
(AC1/AC2/AC3) are E2E (SPA stock view over persisted branch state) and each carries
per-AC architectural_notes. S2 adds no persistence, so no new persistence_invariants; it
reuses the S1 nullable-column policy (PI3). Canon posture recorded for every NFR category
the reviewer flagged (reliability, data-integrity, testability, maintainability,
observability, usability). , Architect Reviewer.
