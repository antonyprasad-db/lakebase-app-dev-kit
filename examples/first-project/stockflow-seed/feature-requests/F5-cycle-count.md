# Count a shelf and reconcile against the system

The team needs to count what is physically on a shelf and reconcile the difference with what the system says is there. Counting and reconciliation is a stated V1 need: the shelf and the record drift apart, and the team needs to bring them back together without editing quantities blind.

Concretely for this feature:

- Record a cycle count: a counted on-hand quantity for an existing `(sku, location)` stock record, captured as the number the operator actually sees on the shelf.
- Show the variance in place: the counted quantity next to the system quantity and the difference between them, so the difference is visible before anything is changed.
- Reconciling applies the counted quantity as the new on-hand value, reusing the stock row and the in-place update behavior from F1 and F2. It never drives the stored quantity below zero; a reconciliation to a negative value is rejected at write time and shown inline, naming the field.
- A count that matches the system (zero variance) is still a valid, recordable event: the operator confirms the shelf is correct without changing the quantity.
- Every count and every reconciliation keeps an unmodifiable record of the counted value, the resulting adjustment, when it happened, and who made it. The count is distinct from a bare F2 adjustment: it records what was physically observed, not just a new number.

Scope for this feature: single-record counts, keyed entry only. A full location-sweep count sheet and barcode-scanned counting come later.

Builds on F1-stock-visibility (the stock record) and F2-stock-adjustment (the audited, never-negative write path).
