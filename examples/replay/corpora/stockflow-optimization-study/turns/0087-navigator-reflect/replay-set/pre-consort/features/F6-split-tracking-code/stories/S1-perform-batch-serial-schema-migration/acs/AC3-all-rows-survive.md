# AC3: Every stock row survives the migration unchanged

**Given** the full set of sprint-1 stock records prior to the migration
**When** the up migration runs to completion
**Then** every stock row still exists with the same identity and unchanged canonical location — the row count is unchanged and no row is lost or corrupted
