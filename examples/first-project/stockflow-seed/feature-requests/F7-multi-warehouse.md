# Operate across multiple warehouses

The team needs to run more than one warehouse from a single deployment, without each warehouse needing its own copy of the system. Today every stock record is addressed by `(sku, location)`; that has no room for "the same location name in a different building".

Concretely for this feature:

- Introduce a warehouse as a first-class dimension of stock addressing. A stock record is uniquely addressable by `(warehouse, sku, location)`; the same `(sku, location)` pair may exist in more than one warehouse without collision.
- Existing sprint-1 and sprint-2 stock records survive the change with no loss: they are assigned to a single default warehouse so every prior record stays valid and readable.
- The operator picks (or is scoped to) a warehouse, and the stock-by-location table, the SKU detail, and the receive / pick / adjust / count forms all operate within that warehouse. Cross-warehouse totals are out of scope for this feature.
- No two warehouses share stock: a pick, receipt, adjustment, or count in one warehouse never moves quantity in another.

Builds on F1-stock-visibility (the stock model this extends) and every write path from F2 through F5 (each becomes warehouse-scoped).
