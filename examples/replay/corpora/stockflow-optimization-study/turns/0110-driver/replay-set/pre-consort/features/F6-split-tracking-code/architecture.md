# F6 Split tracking code — Architectural review

Feature: `F6-split-tracking-code`. Story reviewed: `S1-perform-batch-serial-schema-migration`.
`service_backed: true` — the feature refactors a persisted schema (a real Alembic migration over the `stock_records` table). Layer layout INHERITED from the F1-stock-visibility convention (boundary=`app/routes/`, service=`app/services/`, repository=`app/repositories/`, models=`app/models/`); no layer remapped or renamed.

## Architectural Concerns Mapping

| Concern | Owner layer | Notes |
|---|---|---|
| Schema change / migration | Infrastructure (Alembic migration `migrations/versions/`) | Add batch_number/serial_number, backfill, drop inventory_code, reversible downgrade. Not runtime code. |
| Code parsing / backfill transform | Migration script (one-time data op) | Hyphen-split of inventory_code lives in the migration, NOT in service/models. |
| Data integrity / no-loss | Repository schema + migration transaction | Atomic migration (PI1); UNIQUE(sku, location) preserved (PI4). |
| Validation | API boundary (`app/routes/`) | Unchanged by S1; relevant to S2/S3 field exposure. |
| Observability (integrity probe) | Migration / operational tooling | COUNT of NULL batch/serial surfaced to the migration log (AC4). Never domain logic. |
| Persistence / ORM access | Repository (`app/repositories/`) | Only layer touching the session; runtime reads of the new columns land here in S2. |
| Presentation | React SPA (`client/`) over JSON boundary | S3 renders batch/serial separately; NULLs show "not tracked". |
| Transactions | Migration (single transaction) | The add+backfill+drop runs atomically or rolls back. |

## Layer assignment summary (S1)

All six S1 ACs are **Infra** — they assert contracts on the data-store shape and the Alembic migration, not on an HTTP boundary or UI. AC1/AC2 cover the backfill transform (well-formed extraction and the NULL-not-guess branch, enabled by the nullable columns PI2); AC3 is the atomic no-data-loss guarantee (PI1); AC4 is the migration-time integrity probe (observability); AC5 is the final drop of inventory_code; AC6 is the reversible downgrade (PI3). The parsing rule is deliberately confined to the migration so no runtime layer inherits legacy-code-format logic.

## Pattern proposals

- **Migration as the single owner of the transform.** The hyphen-split backfill is a one-time data operation; it stays in the Alembic revision, keeping the runtime service/repository/models free of legacy-format parsing (SRP — the domain models see only first-class batch_number/serial_number).
- **Gated destructive step.** Order the up migration add -> backfill -> probe (AC4) -> drop (AC5) so the irreversible drop runs only after integrity is observed.
- **Symmetric reversibility.** downgrade() reconstructs inventory_code from location + batch + serial and restores the column set, giving a clean rollback point.

## Risks

- **Non-conforming volume unknown.** If a large share of codes are malformed, backfilling them to NULL may exceed an acceptable review threshold (see Open question / Decision 3). The probe surfaces the count but does not itself block.
- **Down-migration lossiness.** If a code was originally malformed (NULL batch/serial), the reconstructed inventory_code on downgrade cannot perfectly restore the original malformed string. The reversibility guarantee is schema-shape + well-formed-code fidelity, not byte-exact restoration of previously-malformed codes — the round-trip test must assert this scoped guarantee, and the PO should confirm it is acceptable.
- **Location assumption.** Reconstruction on downgrade assumes location is canonical and available; this holds because location is out of scope for change, but the migration must read it, not the (dropped) inventory_code.

## Decisions (for PO at Gate 2)

1. **Backward-compat field in API (from spec Open question).** *Recommendation:* return only the new batch_number/serial_number fields (not a reconstructed inventory_code) — resolved in S2; flagged here as it shapes whether the down-path reconstruction logic is reused at runtime. Recommend NOT reusing it at runtime.
2. **External inventory_code dependents.** *Recommendation:* none known in scope; treat as a deprecation note, not a migration blocker. PO to confirm no external report depends on the combined format.
3. **Non-conforming threshold that triggers rollback.** *Recommendation:* the integrity probe (AC4) reports the count; adopt a manual review gate (operator inspects the count before accepting) rather than an automatic numeric threshold for V1. PO to set a hard threshold if one is required.

## Test strategy

Real-DB integration tests against the paired Lakebase branch (databricks_postgres via DATABASE_URL) — pytest-bdd with Gherkin `.feature` + `tests/step_defs/test_*.py`, Alembic migration applied to the branch first, FK-aware targeted-DELETE cleanup. No mocks, stubs, or in-memory substitutes (R4). Coverage:
- AC1/AC2: seed well-formed and malformed codes, run up migration, assert extracted segments and NULLs.
- AC3: seed the full row set, migrate, assert row count and identity/location unchanged (PI1).
- AC4: seed a known conforming/non-conforming mix, assert the probe count equals the actual NULL count.
- AC5: post-migration schema inspection asserts inventory_code is gone.
- AC6: full up-then-down round trip asserts inventory_code reconstructed and column set restored (PI3), scoped per the down-migration-lossiness risk.

## Sign-off

**Recommendation: proceed.** Layer assignments (all Infra for S1), inherited layer layout, `service_backed: true`, four persistence invariants, and eight NFRs (R1–R5 covered plus observability/rollout/render additions) are proposed for PO adjudication at Gate 2. No cross-cutting concern is left without an owner.

— Architect Reviewer
