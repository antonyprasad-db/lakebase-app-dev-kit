---
author: Spec Author
---

# Sprint feature proposals — StockFlow

Candidate features for the **next sprint**: the first runnable, demonstrable
increment that lets the team *see and adjust stock at one warehouse*. This is
the PO's input for committing a backlog, not a frozen scope. UI track is ON —
every candidate below is a user-facing capability and needs an **E2E (UI)
story** (a real browser interaction against the SPA), not an API alone.

Recommended sprint boundary: **P1 + P2** form the minimal usable increment the
PO asked for ("the simplest thing that lets the team see and adjust stock at
one location"). P3 and P4 are the natural next slices if the sprint has room;
otherwise fold them into the following `/plan`.

## FP1 — See stock levels

- **Ask:** An operator opens the app and sees the stock levels on hand — each
  SKU at each location with its quantity — with an explicit empty state before
  any stock exists, and can open one to view its detail.
- **Rationale:** Serves the product's first need ("know what they have, in what
  quantity, at which physical location, at any point in time") and the V1 goal
  "retrieve the stock level of one SKU at one location." The foundational read
  surface everything else builds on. Supports NFR R5 (SPA home + detail
  navigation, no full-page reload).
- **E2E (UI):** YES — home index page (grid) + SKU/location detail view, with
  the empty state.
- **Priority:** P1 (foundation).

## FP2 — File and adjust a stock level

- **Ask:** An operator files a stock level for a SKU at a chosen location, and
  adjusts that quantity up or down, watching the affected row move in place.
  Filing the same `(sku, location)` again updates the existing record rather
  than creating a duplicate.
- **Rationale:** Delivers the V1 core "file, retrieve, and adjust the stock
  level of one SKU at one location" and "hold stock for the same SKU at
  multiple locations." Exercises the write path, the in-place optimistic update
  (R5), the no-negative rule (R2), the unique `(sku, location)` collision rule
  (R3), and the immutable timestamp/actor on each adjustment (R1).
- **E2E (UI):** YES — the file/adjust form and the in-place row update on the
  detail/home view; inline validation naming the offending field.
- **Priority:** P1 (foundation; completes "see and adjust").

## FP3 — Record an inbound receipt

- **Ask:** An operator records that a known supplier delivered a known quantity
  of a SKU to a chosen location, and stock at that location goes up.
- **Rationale:** Serves "receive inbound goods from a supplier and put them
  somewhere recoverable" and the V1 goal "record inbound receipts." Builds
  distinctly on FP2 by adding a supplier-attributed increase, not a raw manual
  adjustment.
- **E2E (UI):** YES — receipt form; on submit, confirmation and the target
  stock row increases in place.
- **Priority:** P2.

## FP4 — Record an outbound pick (no overcommit)

- **Ask:** An operator records a customer-order pick that draws a quantity of a
  SKU down at a chosen location; a pick that would overcommit available stock is
  refused with a clear message, and stock never goes negative.
- **Rationale:** Serves "pick goods off the shelf for a customer order without
  overcommitting" and the V1 goal "record outbound picks … refusing to
  overcommit." Directly exercises NFR R2 at write time. Distinct from FP2/FP3 —
  the observable behavior is the rejection of an overcommitting pick.
- **E2E (UI):** YES — pick form; on submit, either the row decreases in place or
  an inline overcommit rejection message is shown.
- **Priority:** P2.

## Notes for the PO

- All four are single-warehouse. Multi-warehouse operation (overview §"Operate
  across multiple warehouses") and physical count/reconciliation are deferred —
  candidates for a later `/plan`, not this sprint.
- Open question for the PO: is the sprint scoped to the minimal "see and adjust"
  increment (FP1+FP2), or does it also commit the receipt/pick flows (FP3+FP4)?
  Each is independently demonstrable, so the boundary is the PO's call.
- The single tracking code that encodes location/batch/serial together is V1's
  agreed simplification (overview §"What I want in V1"); no splitting of those
  fields this sprint.
