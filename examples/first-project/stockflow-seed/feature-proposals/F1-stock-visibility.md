# F1-stock-visibility

**One-line ask:** Record and view stock by SKU and location.

**Rationale:** "Know what they have, in what quantity, at which physical location, at any point in time" (product overview). Foundational for V1: file and retrieve a SKU's stock per `(sku, location)`, with a home stock-by-location table and a SKU detail view. Multi-location holding for one SKU falls out of the `(sku, location)` model. Nothing else in the warehouse works until stock can be recorded and read back.

**NFRs:** R3 (unique `(sku, location)`), R1 (data survives migrations).

**Size:** M. **Priority:** P0. **Suggested sprint:** sprint-1.

**E2E story:** Yes.
