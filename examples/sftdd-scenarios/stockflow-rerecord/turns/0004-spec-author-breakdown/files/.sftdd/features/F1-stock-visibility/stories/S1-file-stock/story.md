# S1-file-stock

**As a** warehouse team member
**I want to** file the stock level of one SKU at one location with its combined `inventory_code`, and retrieve it later
**So that** we have a durable record of what is on a shelf that we can read back.

Scope: recording a `(sku, location)` stock record through a UI, storing the combined tracking code, and resolving a repeat `(sku, location)` at write time (no duplicate row, no error page).
