# Architecture: F6-split-tracking-code

Split the combined `inventory_code` into first-class `batch_number` and `serial_number` columns on `stock_records`, backfilled by splitting on the hyphen delimiter (segment 2 = batch, segment 3 = serial), dropping the combined column, and surfacing a nonconforming-row count before acceptance. `service_backed: true` (persists domain data; schema migration on the stock aggregate).

## Layer assignment summary (S1-split-columns-migration)

All eight ACs are **Infra**: they assert schema contracts and data-transform guarantees on the `stock_records` table, realized by a single Alembic up-migration (with a paired downgrade) plus a read-only integrity probe. The migration is the owner module; the `app/models/` stock aggregate gains/loses the fields and `app/repositories/` is the only layer that later reads them via the ORM. No business logic lives in the boundary or service for this story; the parse rule is deterministic migration-owned logic. Layer layout is inherited verbatim from the F1 convention (boundary=`app/routes/` react, service=`app/services/`, repository=`app/repositories/`, models=`app/models/`).

## Architectural Concerns Mapping

| Concern | Owner layer | Notes |
| --- | --- | --- |
| Schema evolution (add/drop columns) | Migration (Alembic) | Additive-then-backfill-then-drop ordering (AC1, AC2, AC3); NFR-F6-6 |
| Data transform / parse rule | Migration data step | Hyphen split, null-safe branch (AC2, AC4); not service/boundary logic |
| Data preservation | Migration | No row deletes; every prior row survives (AC5, R1); PI3 |
| Migration reversibility | Migration downgrade() | Reconstruct inventory_code from location+batch+serial (AC7); PI3 |
| Addressing-key integrity | Migration + repository | location untouched, (sku, location) key preserved (AC8); PI2, R3 |
| Observability / review gate | Integrity probe (pre-flight query) | Nonconforming count surfaced (AC6); NFR-F6-5 |
| Persistence (ORM access) | Repository (`app/repositories/`) | Only layer touching the session; boundary/service never import it |
| Config in env | Alembic env | DATABASE_URL from post-checkout hook; databricks_postgres unchanged (NFR-F6-7) |
| Test against real branch | pytest-bdd on paired branch | R4 / NFR-F6-3; no mocks/in-memory |

## Pattern proposals

- **Migration-as-transform:** the up path is a strict sequence , add nullable columns (AC1), backfill by delimiter with a null-safe branch (AC2/AC4), then drop `inventory_code` (AC3). Ordering is the invariant; the drop must never precede a successful backfill.
- **Pre-flight integrity probe:** a read-only count query (AC6) executed for operator review before acceptance, kept separate from the mutating migration so it can run without side effects.
- **Symmetric downgrade:** `downgrade()` recreates `inventory_code` and reconstructs it from canonical `location` + `batch_number` + `serial_number` (AC7), returning the schema to its prior shape.
- **Model update in `app/models/`:** the stock aggregate module gains `batch_number`/`serial_number` and loses `inventory_code`; repository reads reflect the new shape (dependencies point inward, boundary never imports the session).

## Risks

- **Downgrade fidelity for nonconforming rows:** rows left NULL by AC4 cannot losslessly reconstruct their original `inventory_code` on downgrade (the original tail is unknown). The reconstruction (AC7) is defined for conforming rows; for NULL batch/serial the down path reconstructs from location alone. Flagged for PO awareness , reversibility is structural, not byte-perfect for previously-nonconforming codes.
- **Delimiter assumption:** segment 2/3 split assumes a stable `location-batch-serial` shape; codes with extra hyphens or empty segments are treated as nonconforming and counted (AC6) rather than partially parsed.
- **Backfill on large tables:** for sprint-1 volumes this is trivial; a future large dataset may need a batched backfill (out of scope for this story).

## Decisions (Gate 2, PO to adjudicate; headless recommendation recorded)

- **D1 , Reversibility for nonconforming rows:** Recommend accepting structural (not byte-perfect) reversibility; downgrade reconstructs from available canonical fields. **Recommendation: proceed.**
- **D2 , Probe blocking vs advisory:** the integrity probe (AC6) surfaces a count for review but does not block the migration automatically. Recommend advisory (surface + human accept), matching "surfaced before the change is accepted." **Recommendation: proceed.**
- **D3 , Nonconforming policy:** leave NULL, never guess or drop (AC4). **Recommendation: proceed** (aligns with R1 no-silent-loss).

## Test strategy

Real-DB integration tests against the paired Lakebase branch (R4 / NFR-F6-3), pytest-bdd with Alembic migrations applied to the branch first, FK-aware targeted-DELETE cleanup. No mocks, stubs, or in-memory substitutes. ACs verified through this suite:
- AC1, AC3 , schema shape after up-migration (columns present; inventory_code gone).
- AC2, AC4 , backfill correctness (conforming split; nonconforming NULL).
- AC5 , row-count preservation across upgrade.
- AC6 , integrity probe reports the nonconforming count.
- AC7 , upgrade/downgrade round-trip reconstructs inventory_code and restores schema.
- AC8 , location unchanged and (sku, location) key intact.

## Sign-off

**Recommendation: proceed.** Layer layout inherits the F1 project convention unchanged; all S1 ACs carry Infra `architectural_notes`; persistence invariants and NFRs (including all Required brief items R1, R3, R4) are declared. NFRs recorded as `accepted` under headless Human Proxy for PO validation at Gate 2.

, Architect Reviewer
