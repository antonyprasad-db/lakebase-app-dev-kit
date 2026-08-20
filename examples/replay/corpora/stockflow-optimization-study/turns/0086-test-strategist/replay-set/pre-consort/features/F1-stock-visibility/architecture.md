---
author: Architect Reviewer
feature: F1-stock-visibility
gate: plan (Gate 2)
---

# Architecture — F1 Record and view stock by SKU and location

This is the **first feature**; the layered layout declared here becomes the
project-wide convention every later feature inherits. Chosen deliberately.

## Layering (canonical, project-wide)

Inward dependency direction only: boundary -> service -> repository -> models.

| Role        | Module            | May import        | Responsibility |
|-------------|-------------------|-------------------|----------------|
| boundary    | `app/routes/`     | service           | HTTP JSON endpoints; request validation; no DB session, no business logic |
| service     | `app/services/`   | repository, models| Business logic; transactional boundary for read-or-create/upsert |
| repository  | `app/repositories/`| models           | The ONLY layer touching the ORM/session; realizes the upsert |
| models      | `app/models/` (package) | —           | One module per domain object (`app/models/stock_record.py`); ORM entities |

`service_backed: true` — the feature persists domain entities (`stock_records`)
and carries write-collision business logic, so boundary + service + repository +
a `models/` package are all declared. The boundary returns JSON (React SPA
renders it, R5), so no `renders_via` on the boundary.

## Architectural Concerns Mapping

| Concern            | Owner layer                 | Notes |
|--------------------|-----------------------------|-------|
| Input validation   | boundary (`app/routes`)     | Field-named messages (R5 preference) |
| Authn / Authz      | none (out of bounds V1)     | Explicitly excluded by nfrs.md |
| Business rules     | service (`app/services`)    | No-negative guard, read-or-create decision |
| Transactions       | service                     | Wraps the upsert; never in the domain |
| Persistence / ORM  | repository (`app/repositories`) | Only layer with the DB session |
| Data integrity     | schema (`stock_records`)    | Unique(sku,location), CHECK qty>=0, NOT NULL |
| Logging / observability | cross-cutting (substrate)| Per-role agent log; app logging in a cross-cutting service |
| UI rendering       | React SPA (`client/`)       | JSON API boundary, client-side render (R5) |

## Pattern proposals

- **Repository upsert** for AC3: the unique (sku, location) constraint (PI1) is
  the authority; the repository performs an idempotent insert-or-update so a
  repeat filing updates in place rather than duplicating or erroring.
- **Combined tracking code** (`inventory_code`) is a plain persisted attribute on
  the stock model — no parsing/decoding at write time; stored exactly as supplied
  (AC2).
- Service owns the transactional boundary and the no-negative guard (R2), keeping
  the boundary thin and the domain rule out of the route handler.

## Risks

- The `inventory_code` encodes location/batch/serial together; if later stories
  need to query by its parts this denormalized field may need decomposition.
  Recorded now, not resolved.
- Upsert semantics (does a repeat filing REPLACE or ACCUMULATE quantity?) — AC3
  says "updated in place with the newly filed values", read as REPLACE. Confirm
  at Gate 2 (see Decisions).

## Decisions (for PO adjudication at Gate 2)

1. **Repeat-filing semantics** — replace the quantity with the newly filed value
   (not accumulate). *Recommendation: replace*, per AC3 "updated in place with the
   newly filed values".
2. **inventory_code nullability** — optional on filing (AC2 supplies it, AC1 does
   not). *Recommendation: nullable column*, defaulting to empty / "not tracked"
   per the PO's missing-detail preference.

## Test strategy

Acceptance tests are **real integration tests against the paired Lakebase branch**
(`databricks_postgres` via `DATABASE_URL`), pytest-bdd, Alembic migrations applied
to the branch first, FK-aware targeted-DELETE cleanup — never mocked/in-memory (R4).
- AC1 — file creates record: assert persisted (sku, location, quantity).
- AC2 — record stores tracking code: round-trip `inventory_code` exact value.
- AC3 — same pair updates in place: repeat filing leaves exactly one row, updated.
- Persistence invariants PI1–PI4 each get a real-branch test (unique collision,
  NOT NULL rejection, CHECK qty>=0 rejection, migration reversibility). PI4/NFR-F1-1:
  since this migration first CREATES stock_records, the reversibility test asserts
  **schema-recreation** — after upgrade the table and its PI1/PI2/PI3 constraints
  exist, and downgrade cleanly drops the table — NOT row survival across the
  create-table round-trip (a downgrade drops the table, so row-survival is
  unsatisfiable here; that guarantee applies only to later purely-additive migrations).

### S2-view-home-stock-table (home table view)

All three ACs are **E2E**, UI-facing over the established layers (no new server
logic; the boundary returns JSON per R5, the React SPA under `client/` renders it).
- AC1 — table lists stock: real-branch integration test seeds records and asserts
  the boundary's collection response, plus a client component test asserting one
  row per record carrying SKU/location/quantity.
- AC2 — quantities right-aligned: pure client presentation; client component test
  asserts the quantity column cells are right-aligned (no DB interaction needed).
- AC3 — empty state shown: real-branch integration test asserts the boundary
  returns an empty collection over a truncated table, plus a client component test
  asserting the explicit "No stock at this location" empty-state renders (never a
  blank page). Covers NFR-F1-7 (clean render across populated/empty paths).

## Sign-off

**Recommendation: proceed.** Layering, service_backed declaration, persistence
invariants, and NFR coverage (R1–R5 + preferences) are in place for
S1-file-stock-record and S2-view-home-stock-table (all E2E over the established
layers, adding NFR-F1-7 for clean home-table rendering). Headless: proposed NFRs
recorded for Human Proxy validation.

— Architect Reviewer
