# S2-stock-by-location-table

As a warehouse operator I want to see a calm, scannable home table of stock by location showing SKU, location, and right-aligned quantity, with an explicit empty state when a location holds no stock, so that I can read at a glance what is on the shelves without a blank or confusing screen.

Scope: the user-facing (E2E) home screen that lists recorded stock rows and shows an explicit "No stock at this location" state rather than a blank page.

Independence: S1 builds only the filing form; S2 adds the read-back list view and empty state, which S1's build does not produce.
