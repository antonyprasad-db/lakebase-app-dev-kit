# S2-stock-by-location-table

**As a** warehouse team member
**I want to** see a calm, scannable home table of stock by location showing SKU, location, and right-aligned quantity
**So that** I can read at a glance what is on the shelves across locations.

Scope: the home screen stock-by-location table (SKU, location, quantity right-aligned) with an explicit "No stock at this location" empty state, never a blank page.

**Independence:** distinct from S1. S1 delivers the write path and single-record retrieval only. S2 adds the home overview screen that lists all stock across locations and its explicit empty state, which S1's build does not produce.
