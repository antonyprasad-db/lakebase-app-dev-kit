# F8-barcode-scan

**One-line ask:** Barcode-driven receive, pick, and adjust.

**Rationale:** Barcode scan as the primary warehouse-floor input (design brief): a green flash and in-place row update on success, a red flash and persistent toast on failure, with perceived response under ~200ms from scan event to UI update. The keyed-entry forms from F2 through F5 gain a scan path.

**NFRs:** R2 (writes still respect the no-overcommit / never-negative rules).

**Size:** M. **Priority:** P2. **Target sprint:** sprint-3. **Status:** planned.

**E2E story:** Yes.
