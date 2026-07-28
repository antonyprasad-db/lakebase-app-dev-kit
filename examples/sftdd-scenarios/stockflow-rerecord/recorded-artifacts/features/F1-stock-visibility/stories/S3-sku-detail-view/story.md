# S3-sku-detail-view

As a warehouse operator I want to open a single SKU's detail view showing its stock across all its locations including each record's tracking code, with untracked optional detail shown as an explicit "not tracked", so that I can see everything known about one SKU in one place without a null crash or blank region.

Scope: the user-facing (E2E) SKU detail screen that groups one SKU's records across locations, shows the combined `inventory_code`, and renders "not tracked" for an untracked optional field (e.g. par level).

Independence: S2 shows a flat multi-SKU home list; S3 adds the per-SKU drill-down with tracking code and explicit "not tracked" state, which S1 and S2 do not build.
