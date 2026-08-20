# AC6: Down migration reconstructs the combined inventory_code

**Given** a stock table already migrated to batch_number and serial_number columns
**When** the down migration runs
**Then** a combined inventory_code is reconstructed from the canonical location plus the split-out batch_number and serial_number, restoring the pre-migration schema shape
