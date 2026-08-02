# S3-sku-detail-view

**As a** warehouse team member
**I want to** open a SKU detail view showing that SKU's stock across all its locations including its tracking code
**So that** I can inspect one SKU in depth, not just scan the whole-warehouse overview.

Scope: a per-SKU detail screen listing that SKU's stock by location with its combined `inventory_code`, and a clear "not tracked" state for untracked optional detail (par level), never a blank region or null crash.

**Independence:** distinct from S1 and S2. S1 is the write path; S2 is the whole-warehouse overview table. S3 adds a SKU-scoped drill-down surfacing the tracking code and the "not tracked" optional-detail state, which neither prior story's build produces.
