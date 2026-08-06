# Architecture , F1 Record and view stock by SKU and location

Service-backed feature: it persists stock records to the paired Lakebase branch
and carries write-time business rules (collision resolution, non-negative
quantity). This is the FIRST feature, so the layered layout declared here becomes
the project-wide convention every later feature inherits.

## Layering (project convention)

Inward dependencies only: boundary -> service -> repository -> models.

| Role | Module | Responsibility |
| --- | --- | --- |
| boundary | `app/routes/` | JSON API (React SPA under `client/` renders it); input validation; no business logic, no DB session. `renders_via: react`. |
| service | `app/services/` | Business rules: collision resolution (upsert), non-negative/overcommit rejection; owns the transaction boundary. |
| repository | `app/repositories/` | The ONLY layer touching the ORM/session; realizes queries and the atomic upsert. |
| models | `app/models/` (package) | One module per domain entity, e.g. `app/models/stock_record.py`. |

## Architectural Concerns Mapping

| Concern | Owner layer | Notes |
| --- | --- | --- |
| Input validation | boundary (`app/routes/`) | Names the offending field (PO preference). |
| Authn / authz | none (out of bounds for V1) | Explicitly excluded by NFR brief. |
| Business rules (collision, non-negative) | service | Never in boundary or domain. |
| Transaction management | service | Read-then-write upsert wrapped in one transaction (PI4). |
| Persistence / ORM session | repository | Sole ORM-touching layer. |
| Data-integrity constraints | DB schema (via models/migration) | Unique, NOT NULL, CHECK, reversibility (PI1..PI5). |
| Configuration | env (`DATABASE_URL`) | Twelve-factor; paired branch `databricks_postgres`, name unchanged. |
| Audit (timestamp + actor) | service -> models | Immutable timestamp/actor per R1; set at write, never mutated. |
| Logging / observability | substrate invariant | Every role emits to the agent log. |

## Pattern proposals

- Repository pattern isolates the ORM so the service and boundary stay
  persistence-agnostic (SRP + Data Intelligence Platform at the module boundary).
- Upsert-in-service with a DB composite-unique guard (PI1): the service expresses
  the intent, the constraint is the last line of defense against a duplicate.
- Models as a package (`app/models/`), one module per aggregate, so later
  features add entity modules without a flat-file collision.

## Risks

- Concurrent repeat-file on the same `(sku, location)`: relying on the service
  transaction plus the DB unique constraint (PI1/PI4). If the upsert is
  implemented as SELECT-then-INSERT without ON CONFLICT / row lock, a race could
  attempt a duplicate insert; the unique constraint turns that into a handled
  retry, never a stored duplicate. Test-strategist should cover the concurrent path.
- `inventory_code` is stored as a single combined string; if later stories need
  to decompose it (batch/serial), an additive migration is required , kept
  reversible per PI5.

## Decisions (PO adjudicates at Gate 2)

- **D1 , upsert vs reject on collision:** AC3 Then clause mandates update-in-place
  (no duplicate, no error). Recommendation: implement as service upsert backed by
  DB unique constraint. Adopted (matches AC3 + R3).
- **D2 , UI delivery:** React SPA + JSON boundary per R5. Recommendation: boundary
  `renders_via: react`, JSON only; no server-side templates. Adopted.
- **D3 , audit fields:** R1 requires immutable timestamp + actor per adjustment.
  Recommendation: set at write in the service, never mutated on upsert (preserve
  original created-at, append adjustment metadata). Adopted.

## Test strategy

Acceptance tests are REAL integration tests against the paired Lakebase branch
(pytest-bdd: Gherkin `.feature` + `tests/step_defs/test_*.py` + `tests/conftest.py`),
Alembic migrations applied to the branch first, FK-aware targeted-DELETE cleanup.
No mocks, stubs, or in-memory DB.

- AC1-file-stock-record , real-branch write persists the record (PI2 NOT NULL, PI3 CHECK).
- AC2-retrieve-stock-record , real-branch read-back returns stored values exactly.
- AC3-collision-resolved-at-write , real-branch repeat write collapses to one row (PI1 unique, PI4 transactional).
- Migration reversibility + data survival (PI5, R1) verified against the branch.
- React SPA covered by its own component tests under `client/`; API by the branch suite (R4).

## Sign-off

Recommendation: **proceed**. Layering, NFRs (R1..R5 covered), and persistence
invariants are defined; Gate-2 decisions carry recommended resolutions and all
proposed NFRs are accepted for the Human Proxy to validate.

, Architect Reviewer
