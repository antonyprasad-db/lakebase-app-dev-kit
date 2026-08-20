# S3: View SKU detail

As a warehouse operator
I want to see a single SKU's stock across all its locations
So that I can check inventory for one product and know what tracking codes are in use

## Details

The detail view for a SKU displays:
- All locations where this SKU is stocked
- The quantity at each location
- The tracking code for each location
- Optional fields (like par level) that are not yet tracked show a clear "not tracked" label, never a blank region or a system crash

This view is accessible from the home table and provides SKU-specific inventory summary.
