# Search stock by SKU and location

As the stock table grows, the team needs to find a SKU or a location quickly instead of scrolling and scanning by eye. This is the findability surface the design brief calls for.

Concretely for this feature:

- Search stock by SKU and by location from the home view. Entering a SKU or a location narrows the stock-by-location table to the matching rows.
- A search with no matches shows an explicit empty state ("No stock matches that SKU or location"), never a blank page.
- Search is read-only: it filters and finds; it never changes a stock level, and it reuses the existing stock records from F1 with no new write path or schema change.
- Search reflects the current stock state, including rows created or changed by receipts, picks, adjustments, and counts.

Builds on F1-stock-visibility (the stock records and the home table it searches over).
