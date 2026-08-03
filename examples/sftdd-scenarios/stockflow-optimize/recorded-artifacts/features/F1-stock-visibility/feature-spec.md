# Record and view stock by SKU and location

## Summary

File the stock level of one SKU at one location, identify it with a combined tracking code, and retrieve it later. A SKU can hold stock at multiple locations; each (sku, location) pair is uniquely addressable and resolved at write time (no duplicates stored). The system displays stock in a calm, scannable table by location and provides a SKU detail view showing that SKU's stock across all locations.

## Stories

- **S1-record-stock**: File stock for a SKU at a location with a combined tracking code
- **S2-view-stock-table**: Browse all stock on a home screen table (SKU, location, quantity); show explicit "No stock at this location" for empty locations
- **S3-view-sku-detail**: See a SKU's stock across its locations with tracking codes; show "not tracked" for optional fields like par level

## Out of scope

- Adjusting quantities after initial record (separate feature)
- Receiving inbound goods (separate feature)
- Multiple warehouses in this iteration (V1 is single-warehouse)
- Splitting the combined tracking code into location, batch, and serial fields (future iteration)
- Fulfillment or picking (separate feature)

## Open questions

None at breakdown; all boundaries are explicitly stated in the feature request.
