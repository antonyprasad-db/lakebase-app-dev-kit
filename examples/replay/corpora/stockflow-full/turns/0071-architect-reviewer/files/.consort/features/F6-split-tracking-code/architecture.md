# F6 — Split the combined tracking code into batch and serial columns — Architecture

Schema refactor of the F1 stock table. This iteration (story S1) adds
`batch_number` and `serial_number` columns and backfills them from the
combined `inventory_code`, preserving every existing row. It inherits the
F1 layered layout unchanged; no layer is remapped or renamed.

## Architectural Concerns Mapping

| Concern | Owner layer | Where realized (F6) |
|---|---|---|
| Schema evolution / migration | Infrastructure (Alembic) | Additive, atomic add-and-backfill migration; paired downgrade reconstructs `inventory_code` |
| Data derivation (code parse) | Migration backfill step | Delimiter split of `inventory_code`; segment 2 -> batch, segment 3 -> serial (not fixed width) |
| Data durability (R1) | Migration transaction | Single-transaction ALTER+UPDATE; in-place UPDATE never DELETEs/mutates canonical fields (PI3, PI4) |
| ORM/session access | Repository (`app/repositories/`) | Only layer touching the session; probe read counting NULL rows |
| Unique identity (R3) | DB constraint | UNIQUE(sku, location) preserved (PI2); location not re-derived from code |
| Validation / business logic | Service (`app/services/`) | No new write logic in S1; deferred to S3 UI exposure |
| UI presentation | React SPA (`client/`) | S3 only: distinct batch/serial fields, 'not tracked' clean render for NULLs |
| Integrity observability | Integrity probe (repository read) | Post-migration count of nonconforming (NULL-batch/serial) rows for review (AC5) |

## Pattern proposals

- **Migration as the unit of change (S1).** All five S1 ACs are `Infra`
  contracts realized by one additive Alembic migration + a read-only
  integrity probe. No new boundary/service surface is required for S1;
  reuse of F1 layers is enough. Boundary/service work lands in S3.
- **Repository is the sole ORM boundary.** The integrity probe is a
  repository read (count where batch/serial IS NULL), not a raw query
  in the boundary or a migration-embedded report consumed by the app.
- **Nullable-by-design columns.** batch/serial are nullable so the
  nonconforming path (AC3) is a first-class state, not a constraint
  violation; NOT NULL stays on sku/location/quantity only.

## Risks

- **Down-migration correctness.** The reversibility contract (PI5) is
  end-state: the eventual `inventory_code` drop (S2) reconstructs the
  code from `location + batch + serial` on downgrade. For S1 the down
  path simply drops the two new columns; the reconstruction risk is
  carried into S2 and must not be assumed solved here.
- **Backfill on large tables.** Single-transaction backfill locks rows
  for the migration duration; acceptable at sprint-1 data volumes but a
  revisit point if the table grows.
- **Probe placement.** The integrity probe must be a read that the
  reviewer can run/observe before acceptance; if wired only as a test
  assertion it satisfies AC5 mechanically but not the "surface for
  review" intent — flagged for the PO.

## Decisions (for PO at Gate 2)

- **D1 — Probe delivery.** Recommend the integrity probe be a
  repository-level count exposed to the acceptance test AND recorded in
  the migration run log for human review, rather than a throwaway query.
  *Recommendation: proceed with repository read + logged count.*
- **D2 — S1 has no boundary surface.** Recommend S1 remain a pure
  schema/migration change; batch/serial are not exposed via the API or
  UI until S3. *Recommendation: proceed, defer boundary/UI to S3.*
- **D3 — Nullability of new columns.** Recommend batch/serial be
  nullable (AC3 requires NULL for nonconforming codes).
  *Recommendation: proceed with nullable columns.*

## Test strategy

Real-DB integration tests against the paired Lakebase branch (R4):
pytest-bdd Gherkin `.feature` + `tests/step_defs/`, Alembic migrations
applied to the branch first, FK-aware targeted-DELETE cleanup. No mocks,
stubs, or in-memory DB — a mocked database here is a design defect.

- **AC1** — parent-aware schema diff of `stock`: batch_number and
  serial_number present and addressable; location and inventory_code
  unchanged.
- **AC2** — seed a conforming code ("A12-B7-S001"), run migration,
  assert batch_number="B7", serial_number="S001" by delimiter.
- **AC3** — seed nonconforming codes ("X-1", "c"), assert batch/serial
  NULL and the row otherwise unchanged.
- **AC4** — capture row count + canonical sku/location/quantity before,
  assert identical after (no loss/corruption).
- **AC5** — seed a known conforming/nonconforming mix, run the integrity
  probe, assert the reported nonconforming count matches.

Each persistence invariant (PI1–PI5) is covered by a real-branch test as
above (PI4/PI3 via the AC4 before/after diff, PI5 via an upgrade/downgrade
round-trip).

## Sign-off

**Proceed.** S1 is a well-bounded additive schema refactor that reuses
the F1 layered layout unchanged and carries R1/R3/R4 through to
architecture.json; UI-facing R5 and clean-render are correctly deferred
to S3. All five ACs are `Infra` contracts verifiable on the paired
branch. Headless run: proposed NFRs recorded `hil_status: accepted` and
Gate-2 decisions D1–D3 resolved above for Human Proxy validation.

— Architect Reviewer
