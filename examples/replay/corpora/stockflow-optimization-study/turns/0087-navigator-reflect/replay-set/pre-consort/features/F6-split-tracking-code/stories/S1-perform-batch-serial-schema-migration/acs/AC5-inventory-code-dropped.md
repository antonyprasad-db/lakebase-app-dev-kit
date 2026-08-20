# AC5: Combined inventory_code column is dropped

**Given** a migrated stock table with batch_number and serial_number populated
**When** the up migration has completed
**Then** the combined inventory_code column no longer exists on the stock record
