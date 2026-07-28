# AC1-file-new-record

**Given** no stock record exists for a given SKU at a given location
**When** the operator files that SKU at that location with a quantity and a combined tracking code (inventory_code) through the filing screen
**Then** a stock record for that `(sku, location)` pair now exists and is retrievable, carrying the filed quantity and the filed inventory_code
