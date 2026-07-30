# F5-cycle-count

**One-line ask:** Count a shelf and reconcile against the system.

**Rationale:** "Count what is on the shelf, and reconcile that count with what the system says is there" (product overview). Count what is physically on the shelf and reconcile the difference as an audited adjustment. Builds on F1 (the stock record) + F2 (the audited adjustment write path). Distinct from a bare adjustment: it records the observed count and the resulting reconciliation, not just a new number.

**NFRs:** R1 (immutable audit), R2 (never below zero).

**Size:** M. **Priority:** P1. **Suggested sprint:** sprint-2.

**E2E story:** Yes.
