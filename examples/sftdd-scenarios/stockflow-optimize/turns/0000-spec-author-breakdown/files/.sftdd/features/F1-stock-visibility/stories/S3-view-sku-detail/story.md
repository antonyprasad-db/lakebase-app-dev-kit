# S3-view-sku-detail

As a warehouse operator or inventory manager, I want to see all locations where a SKU is stocked, including the tracking code for each location, so that I can drill into a specific SKU and see its complete distribution across the warehouse.

## Scope

- A detail page shows a single SKU with a list of its stock records across all locations.
- Each record displays: location, quantity, and tracking code.
- An optional field (par level) that is not tracked shows a clear "not tracked" label, never a blank region or null crash.
- The operator can navigate to this page from the home table.
