# Barcode-driven receive, pick, and adjust

The warehouse floor works by barcode scanner, not keyboard. The team needs the receive, pick, adjust, and count flows to accept a scan as their primary input, so an operator can work one-handed with a scanner and a tablet.

Concretely for this feature:

- A barcode scan is the primary input to the receive, pick, adjust, and cycle-count flows. Scanning a known code identifies the SKU (and location where the code carries it) and focuses the flow on that stock row; keyed entry stays available as the fallback.
- A successful scan flashes the scan zone green and updates the affected stock row in place, with no full-page reload.
- A scan that fails (an unknown barcode, a locked SKU) flashes the scan zone red and shows a persistent toast naming the problem, never a silent no-op.
- The scan-to-update interaction feels immediate: perceived response under about 200ms from the scan event to the UI update.
- Every scanned write keeps the same audit trail and the same no-overcommit / never-negative rules as its keyed equivalent; the scan is an input method, not a new write path.

Builds on the keyed forms from F2-stock-adjustment, F3-inbound-receipt, F4-outbound-pick, and F5-cycle-count, adding a scan path to each.
