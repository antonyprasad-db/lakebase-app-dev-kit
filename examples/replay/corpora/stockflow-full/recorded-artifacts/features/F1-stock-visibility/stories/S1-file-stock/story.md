# S1-file-stock

As a warehouse operator, I want to file the stock level of a SKU at a physical location, so that I can record what is on the shelf and retrieve it later.

## Scope

- Create a stock record for a (SKU, location) pair with a quantity and combined tracking code.
- Retrieve the stock record for that pair.
- Handle collisions: when the same (SKU, location) pair is filed again, update the existing record in place; never create a duplicate or show an error.
