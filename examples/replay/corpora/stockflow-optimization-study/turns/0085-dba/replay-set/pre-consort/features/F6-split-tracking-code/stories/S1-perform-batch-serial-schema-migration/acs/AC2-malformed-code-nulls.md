# AC2: Non-conforming code leaves batch and serial NULL

**Given** a stock record whose inventory_code lacks a batch or serial segment (for example "X-1" or a bare "c")
**When** the up migration runs
**Then** batch_number and serial_number for that record are left NULL rather than guessed, defaulted, or dropped, and the row is preserved
