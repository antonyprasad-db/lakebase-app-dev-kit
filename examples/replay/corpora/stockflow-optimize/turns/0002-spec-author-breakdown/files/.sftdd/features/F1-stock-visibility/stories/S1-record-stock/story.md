# S1-record-stock

## User Story

As a warehouse operator, I want to file stock for a SKU at a location, so I can record what is on the shelf and have it persist in the system.

## Scope

Record one stock entry with SKU, location, quantity, and a combined inventory_code (tracking code that encodes location, batch, and serial). If a (SKU, location) pair already exists, replace it (resolve collision at write time; never store duplicates or show an error page).
