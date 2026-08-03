# S2-view-home-table

As a warehouse operator, I want to see a scannable table of stock by location showing SKU, location, and quantity, so that I can quickly check what is on each shelf.

## Scope

- The home screen renders a table with columns: SKU, location, quantity (right-aligned for scanability).
- The table retrieves all stock records from the database.
- An empty location (no stock recorded yet) shows an explicit "No stock at this location" message, never a blank page.
- Quantities are right-aligned for easy scanning.
