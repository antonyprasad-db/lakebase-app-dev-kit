# AC2 - Record carries the combined inventory code

**Given** a stock record filed with a single combined inventory tracking code (encoding location, batch, and serial together)
**When** that stock record is retrieved
**Then** the record includes the combined inventory code exactly as it was filed

V1 stores one combined `inventory_code`; splitting the fields apart is a later iteration.
