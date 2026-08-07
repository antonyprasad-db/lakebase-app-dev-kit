---
author: Spec Author
---

# Sprint candidate features — StockFlow V1

The next coherent usable increment: **see and adjust stock at one
warehouse**. These four candidates together are the simplest thing the
PO can put into real use and review before deciding the next sprint.
Each is user-facing; the product is an SPA (R5), so every candidate is
delivered end to end as an **E2E (UI) story** — a real browser
interaction against the real server, not an API alone. This is the PO's
input for backlog commitment; the PO owns final priority and scope.

## F1 — View and adjust stock for a SKU at a location

- **Ask:** An operator opens the app, sees stock rows (SKU, location,
  quantity), files a new SKU-at-location stock level, and adjusts an
  existing quantity, watching the affected row move in place.
- **Rationale:** The foundational capability of the whole product overview
  ("know what they have, in what quantity, at which location") and the
  first V1 bullet. Nothing else can be demonstrated without it.
- **Priority:** P0 (foundation; everything builds on this row).
- **E2E (UI) story:** **Required.** Home/list view, file form, inline
  adjust with optimistic in-place row update (R5); empty state when no
  stock yet.

## F2 — Hold the same SKU at multiple locations

- **Ask:** An operator files and views stock for one SKU across several
  locations within one warehouse, each location its own row.
- **Rationale:** Second V1 bullet; enforces the `(sku, location)`
  uniqueness invariant (R3) as a user-visible behavior — same SKU at a
  new location is a new row, same pair updates in place.
- **Priority:** P0 (small extension of F1; proves the addressing model).
- **E2E (UI) story:** **Required.** SKU detail view listing per-location
  rows; filing a duplicate `(sku, location)` updates the existing row
  rather than creating a duplicate.

## F3 — Record an inbound receipt

- **Ask:** An operator records that a known supplier delivered a known
  quantity of a SKU to a chosen location, and stock goes up there.
- **Rationale:** Third V1 bullet ("receive inbound goods and put them
  somewhere recoverable"). First stock-movement flow on top of F1/F2.
- **Priority:** P1 (depends on the stock row existing).
- **E2E (UI) story:** **Required.** Receipt form (supplier, SKU,
  location, quantity) with inline validation naming the offending field;
  successful save lands on confirmation and the target row's quantity
  rises.

## F4 — Record an outbound pick without overcommitting

- **Ask:** An operator records a pick that draws stock down at a chosen
  location for a customer order; the system refuses to pick more than is
  available.
- **Rationale:** Fourth V1 bullet plus R2 (never negative, never
  overcommit) surfaced as observable behavior — a rejected over-pick
  shows an inline message and leaves the quantity unchanged.
- **Priority:** P1 (depends on stock existing to draw down).
- **E2E (UI) story:** **Required.** Pick form with the no-overcommit
  rejection shown inline; a valid pick lands on confirmation and the row
  quantity falls in place.

## Notes for the PO

- All four candidates share the `(sku, location)` stock record; the PO
  should confirm F1–F2 land before F3–F4 draw on them.
- Deferred beyond this sprint (open for the next `/plan`): multi-warehouse
  operation, physical counts / reconciliation, and splitting the single
  tracking code into location/batch/serial — all explicitly "beyond V1"
  or later in the overview.
