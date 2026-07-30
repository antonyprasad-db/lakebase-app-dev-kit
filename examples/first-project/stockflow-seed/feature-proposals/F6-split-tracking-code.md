# F6-split-tracking-code

**One-line ask:** Split the combined tracking code into batch and serial columns.

**Rationale:** The V1 `inventory_code` (introduced in F1) is a hyphen-delimited location-batch-serial code (for example "A12-B7-S001"). S1 already has `location` as its own column (part of UNIQUE(sku, location)), so this iteration extracts ONLY `batch_number` + `serial_number` (not a duplicate location column), parses by delimiter via split_part (seed data is variable-width, not fixed-width, and some codes such as "X-1" or a bare "c" do not conform), keeps `location` canonical (the code's leading segment does not reliably match it), then drops `inventory_code`. This is the canonical schema refactor the Product Owner demos after sprint 1. R1 requires every sprint-1 row to survive: an integrity probe surfaces nonconforming codes (batch/serial left NULL) rather than dropping data blindly. The parent-aware schema diff on the paired Lakebase branch is the proof.

**NFRs:** R1 (no data loss), R3 (single unambiguous identity).

**Size:** L. **Priority:** P1. **Suggested sprint:** sprint-2 (leads: the schema baseline the rest of the sprint forks from).

**Example migration:** `.sftdd/release/migration-examples/split_inventory_code.sql`.

**E2E story:** Yes.
