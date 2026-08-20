# S1: File stock record

As a warehouse operator
I want to file the stock level for a SKU at a physical location
So that the system records what is on the shelf and can report it back

## Details

Filing a stock record includes:
- Identifying the SKU (product identifier)
- Identifying the physical location (warehouse shelf/bin)
- Specifying the quantity on hand
- Recording the tracking code (combined location, batch, serial identifier)

The system handles the case where a (SKU, location) pair already has a record: it updates the existing record in place rather than creating a duplicate. No duplicate records are ever stored, and the user sees no error page—just one authoritative record per pair.
