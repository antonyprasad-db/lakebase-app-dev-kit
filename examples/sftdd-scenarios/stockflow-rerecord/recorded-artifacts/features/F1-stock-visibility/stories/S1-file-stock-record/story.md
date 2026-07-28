# S1-file-stock-record

As a warehouse operator I want to file the stock level and combined tracking code of a SKU at a physical location through a screen, resolving any existing `(sku, location)` record rather than duplicating it, so that the system holds one authoritative record of what is on each shelf.

Scope: a user-facing (E2E) form to record `(sku, location, quantity, inventory_code)`; a repeat filing of the same `(sku, location)` pair updates the existing record instead of creating a duplicate or showing an error page.
