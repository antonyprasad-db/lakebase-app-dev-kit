# F4-outbound-pick

**One-line ask:** Pick stock for a customer order without overcommitting available quantity.

**Rationale:** "Pick goods off the shelf for a customer order without overcommitting what is actually there" (product overview). Draws stock down at a location and is the primary home of the no-overcommit rule: a pick beyond available is rejected at write time, never a stored negative and never a silent double-allocation. Closes the basic in-and-out loop for the warehouse.

**NFRs:** R2 (no overcommit, no negative), R1 (audit).

**Size:** M. **Priority:** P0. **Suggested sprint:** sprint-2.

**E2E story:** Yes.
