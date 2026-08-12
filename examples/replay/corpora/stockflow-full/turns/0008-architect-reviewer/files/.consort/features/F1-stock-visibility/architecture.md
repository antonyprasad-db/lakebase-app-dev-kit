# Architecture — F1 Record and view stock by SKU and location

**Layer-assignment summary (S1-file-stock):** All three ACs live at the **API** boundary — a
file (write) followed by a read against the JSON stock endpoint, verified through the pytest-bdd
integration suite against the paired Lakebase branch. AC1 covers first-write + read-back, AC2 the
round-trip of the combined `inventory_code`, AC3 the write-collision (upsert) path on the
`(sku, location)` key. The feature is **service_backed** and persists a `stock` table, so it
declares the canonical layered layout below — this is the **first feature**, so this role → module
layout becomes the project-wide convention.

## Canonical layered layout (project convention)

| Role | Module | May import |
|------|--------|-----------|
| boundary | `app/routes/` (renders_via: react — JSON API, React SPA under `client/`) | service |
| service | `app/services/` | repository, models |
| repository | `app/repositories/` (only layer touching the ORM/session) | models |
| models | `app/models/` (package; one module per domain object, e.g. `app/models/stock.py`) | — |

Dependencies point inward (boundary → service → repository → models). The boundary never opens a DB
session; business logic never lives in the boundary or in templates. Defended by the layering
fitness test.

## Architectural Concerns Mapping

| Concern | Owner layer | Notes |
|---------|-------------|-------|
| Request/payload validation | API boundary (`app/routes/`) | Field-named messages (PO preference); rejects malformed file requests. |
| Business logic (upsert / collision resolution) | Service (`app/services/`) | Find-or-update on `(sku, location)`; owns the transaction (PI4). |
| Persistence / ORM access | Repository (`app/repositories/`) | Sole holder of the DB session; no logic beyond CRUD. |
| Domain shape | Models (`app/models/stock.py`) | Stock entity + column definitions. |
| Data integrity (uniqueness, non-negative, NOT NULL) | Database schema | PI1–PI3, enforced by constraints, not the domain. |
| Transactions | Service layer | Single atomic upsert; never the domain/boundary. |
| Migration durability | DB / Alembic | Additive, reversible, preserves prior records (PI5, R1). |
| Auth / authz | N/A — out of bounds for V1 (per `nfrs.md`). |
| Logging / observability | Substrate invariant (not feature-owned). |

## Pattern proposals (SOLID-driven boundaries)

- A single `StockRepository` owning all `stock` table access; the service depends on its interface,
  not the session (DIP). Upsert exposed as one repository method so the collision path is testable
  in isolation.
- `StockService` orchestrates file/read and owns the transaction boundary; the route stays thin.
- `Stock` model in its own module `app/models/stock.py` (package form, ready for sibling domain
  objects — batch/adjustment — in later stories).

## Risks

- **Upsert vs. insert race:** the atomic-upsert design (PI4) leans on the DB unique constraint (PI1)
  as the backstop. If the service does read-then-write without an upsert or `ON CONFLICT`, a
  concurrent double-file could violate the constraint and surface an error — AC3 forbids the error
  page. The build must use a genuine upsert, not read-modify-write.
- **`inventory_code` semantics:** stored opaque (no parsing/CHECK). If later stories need to derive
  location/batch/serial from it, that decoding belongs in the service, not the boundary — revisit
  then.
- **Non-negative floor (PI2/R2):** the pick/overcommit flow is out of S1 scope, but the CHECK
  constraint is realized in this migration; ensure it does not reject legitimate S1 files.

## Decisions (for PO at Gate 2, with recommendation)

1. **Upsert semantics for refile (AC3):** recommend a true DB-level upsert (`INSERT ... ON CONFLICT
   DO UPDATE`) on the `(sku, location)` unique constraint, in one transaction. *Recommend: adopt.*
2. **`inventory_code` stored as an opaque string (no decode) in S1:** recommend yes — S1 only asserts
   round-trip; defer any structured decode. *Recommend: adopt.*
3. **Realize the non-negative CHECK (PI2) now vs. defer to the pick story:** recommend realize now so
   the invariant is in the schema from the first migration. *Recommend: adopt.*

## Test strategy

Real-DB integration tests only (NFR R4): pytest-bdd Gherkin `.feature` files + `tests/step_defs/`
+ `tests/conftest.py`, Alembic migrations applied to the paired Lakebase branch first, FK-aware
targeted-DELETE cleanup. No mocks, stubs, or in-memory DB. AC1, AC2, AC3 are each verified through
this suite at the API boundary. Persistence invariants PI1–PI5 each get a real-branch test owned by
the Test Strategist/DBA (uniqueness collision, non-negative CHECK, NOT NULL, atomic-upsert
no-duplicate, migration up/down reversibility). The React SPA (`client/`) ships its own component
tests per R5.

## Sign-off

**Recommendation: proceed** to test-list construction once the PO adjudicates the three decisions
above and accepts the proposed NFRs. Layer assignments are unambiguous (all API), the layered layout
is declared as the project convention, and no cross-cutting concern is left without an owner.

— Architect Reviewer
