# Architecture , F1-stock-visibility

Feature: record and view stock by SKU and location. Service-backed: it persists domain entities (`stock_records`) and carries business logic (upsert-on-collision, no negative stock). This is the FIRST feature, so the layered layout declared here becomes the project-wide convention.

## Layering summary

React SPA (`client/`) -> JSON boundary (`app/routes/`) -> service (`app/services/`) -> repository (`app/repositories/`) -> models package (`app/models/`, one module per entity). Dependencies point strictly inward. The boundary never touches the DB session; the repository is the sole ORM/session owner; business logic never lives in the boundary or the client. `renders_via: react` on the boundary: it returns JSON, the SPA renders it (per R5).

| Role | Module | Owns |
| --- | --- | --- |
| boundary | `app/routes/` | HTTP request/response, input validation, field-named errors; returns JSON |
| service | `app/services/` | business rules (upsert-on-collision, quantity >= 0), transaction boundary |
| repository | `app/repositories/` | all ORM reads/writes against the session |
| models | `app/models/` (package) | `app/models/stock_record.py` domain entity |

## Architectural Concerns Mapping

| Concern | Owner layer | Notes |
| --- | --- | --- |
| Input validation | boundary (`app/routes/`) | field-named messages (pref); rejects missing core fields before service |
| Business rules (upsert, no-negative) | service (`app/services/`) | collision resolves to update; quantity >= 0 |
| Transactions | service | never in the domain/models |
| Persistence / ORM access | repository (`app/repositories/`) | only layer with a session |
| Audit (timestamp + actor) | service writes, models store | R1: adjustment carries unmodifiable timestamp + actor |
| Config (DATABASE_URL) | infrastructure (`app/database.py`) | env-sourced; database name fixed to databricks_postgres |
| UI rendering / feedback | React SPA (`client/`) | success confirmation, optimistic in-place row update |

## Pattern proposals

- Repository pattern isolates ORM behind `app/repositories/stock_repository.py`; the service depends on an interface-shaped repository (SRP + Data Intelligence Platform).
- Upsert-on-collision lives in `stock_service.py`, not in the route and not in the model, so the collision rule is unit- and integration-testable independent of HTTP.
- Models as a package (`app/models/stock_record.py`) so later features add sibling entity modules without a flat `models.py` growing unbounded.

## Risks

- The existing scaffold ships a flat `app/models.py`; realizing the `app/models/` package requires moving it. Flagged so the build lane converts it deliberately rather than leaving a flat module that violates the convention.
- R2 (no overcommit) is only partially exercised by S1 (filing enforces quantity >= 0); the pick/adjustment overcommit path belongs to a later story. Recorded so it is not assumed covered here.
- Audit fields (timestamp + actor) are required by R1 but there is no auth in V1 (out of bounds), so "actor" must come from a non-auth source (e.g. an operator field on the form). Surfaced for PO adjudication.

## Decisions (Gate 2, PO adjudicates; recommendation given)

- **D1 , actor source for the R1 audit field without auth.** Recommendation: capture an operator identifier on the filing form and persist it; do not block V1 on an auth system (auth is out of bounds).
- **D2 , upsert semantics on refile (AC2).** Recommendation: full-replace of quantity + inventory_code for the existing `(sku, location)` row (the story says "updated in place to the newly filed values"), not a merge/increment.
- **D3 , models layout.** Recommendation: adopt `app/models/` package now (first feature sets the convention) rather than the scaffold's flat `app/models.py`.

## Test strategy

Real-DB integration tests against the paired Lakebase branch (`databricks_postgres`), never mocked/stubbed/in-memory (R4). Python: pytest-bdd (`.feature` + `tests/step_defs/test_*.py` + `tests/conftest.py`), Alembic migrations applied to the branch first, FK-aware targeted-DELETE cleanup. The React SPA ships its own component tests (client harness) for the confirmation UI.

- **AC1-file-new-record** , branch integration test: file a new `(sku, location)`, assert the row exists and is retrievable with the filed quantity + inventory_code (exercises PI2, PI3).
- **AC2-refile-updates-existing** , branch integration test: file the same pair twice, assert one row updated in place, no duplicate, no error (exercises PI1).
- **AC3-save-confirmation-shown** , client component/E2E test: submit surfaces an explicit success confirmation; distinct from the persistence assertions.
- **Persistence invariants** PI1 (unique), PI2 (not-null), PI3 (check), PI4 (migration reversible) each get a dedicated real-branch test.

## Sign-off

Recommendation: **proceed**. Layering assigned, NFRs R1-R5 carried into `architecture.json` (all proposed, recorded accepted for the headless Human Proxy), persistence invariants declared, decisions surfaced for Gate 2. , Architect Reviewer
