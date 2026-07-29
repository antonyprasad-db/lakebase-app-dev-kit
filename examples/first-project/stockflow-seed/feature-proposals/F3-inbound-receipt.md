# F3-inbound-receipt

**One-line ask:** Record an inbound receipt from a supplier, increasing stock at a chosen location.

**Rationale:** "Receive inbound goods from a supplier and put them somewhere recoverable" (product overview). Standard warehouse inbound workflow: a known supplier delivers a known quantity and stock goes up at a chosen location. An additive migration preserves prior records. Distinct from a bare adjustment (F2): it carries supplier and receipt intent, not just a new number.

**NFRs:** R1 (audit + additive migration preserves prior records).

**Size:** M. **Priority:** P0. **Target sprint:** sprint-2 (carried over from sprint-1). **Status:** carried-over.

**E2E story:** Yes.
