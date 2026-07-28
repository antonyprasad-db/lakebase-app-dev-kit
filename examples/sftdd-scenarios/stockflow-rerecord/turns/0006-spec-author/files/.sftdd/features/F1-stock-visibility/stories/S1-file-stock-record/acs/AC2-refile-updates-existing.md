# AC2-refile-updates-existing

**Given** a stock record already exists for a given SKU at a given location
**When** the operator files that same SKU at that same location again with a different quantity and tracking code
**Then** the existing record is updated in place to the newly filed values, no second record for that `(sku, location)` pair is created, and no error page is shown
