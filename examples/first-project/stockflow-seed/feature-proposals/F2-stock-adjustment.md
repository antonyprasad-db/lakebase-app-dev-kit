# F2-stock-adjustment

**One-line ask:** Adjust the stock level of a SKU at a location.

**Rationale:** "Adjust the stock level of one SKU at one location" (product overview). The write path that makes inventory trustworthy: correct an on-hand quantity with an immutable audit trail (timestamp + actor) and the never-negative rule, surfaced through inline, field-naming validation. Enables cycle-count reconciliation (F5) later.

**NFRs:** R1 (immutable audit), R2 (never below zero).

**Size:** S. **Priority:** P0. **Target sprint:** sprint-2 (carried over from sprint-1). **Status:** carried-over.

**E2E story:** Yes.
