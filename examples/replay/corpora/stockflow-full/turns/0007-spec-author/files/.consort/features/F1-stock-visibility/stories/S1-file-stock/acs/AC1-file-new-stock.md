# AC1 - File a new stock record

**Given** no stock record yet exists for a given SKU at a given physical location
**When** a warehouse operator files that SKU at that location with a quantity
**Then** a stock record for that (SKU, location) pair exists, and retrieving it returns the SKU, location, and quantity exactly as filed

The core file-and-read-back round trip: recording what is on the shelf and getting it back later.
