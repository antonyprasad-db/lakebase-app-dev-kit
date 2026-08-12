# AC3 - Re-filing the same pair updates in place

**Given** a stock record already exists for a given SKU at a given location
**When** a warehouse operator files the same SKU at the same location again with a different quantity
**Then** the existing record is updated in place with the new quantity, exactly one record for that (SKU, location) pair exists, no duplicate record is created, and no error page is shown

Each `(sku, location)` pair is uniquely addressable; the collision is resolved at write time, never stored as a duplicate and never surfaced as an error page.
