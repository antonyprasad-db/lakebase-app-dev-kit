---
author: Spec Author
---

# Feature proposals (StockFlow, next sprint)

Candidate features for the **next sprint only**: the first runnable,
demonstrable increment the PO named in the overview, "the simplest
thing that lets the team see and adjust stock at one warehouse." Later
V1 capabilities (multi-location, receipts, picks, tracking code) are
deliberately held for subsequent sprints so this sprint's learning
folds into the next `/plan`.

UI track is ON: StockFlow ships as a React + TypeScript SPA (design
brief + R5). Every candidate below is a user-facing increment a
warehouse operator performs in a real browser on the tablet, so each
needs an **E2E (UI) story** driving the rendered SPA against the real
server on the paired branch, not an API-only slice.

This is the PO's INPUT. The PO prioritizes and authors the
`feature-request.md`; I do not.

## Candidates

### FP1 - See stock by location (home view)
- **Ask:** An operator opens StockFlow and sees a calm, scannable
  table of what stock is held, in what quantity, at which location, for
  one warehouse.
- **Rationale:** Overview "Know what they have, in what quantity, at
  which physical location, at any point in time" and V1 "retrieve the
  stock level." Design brief home stock-by-location table. Serves R5
  (SPA, client-side routed) and the preference for an explicit empty
  state.
- **E2E (UI) story:** Yes, primary. Operator loads the home route and
  reads the stock table (incl. the explicit empty state when no stock).
- **Priority:** Highest (foundation; everything else navigates from
  here).

### FP2 - File a stock record for a SKU at a location
- **Ask:** An operator files a new SKU with a starting quantity at a
  chosen location and immediately sees it appear in the stock view.
- **Rationale:** V1 "File ... the stock level of one SKU at one
  location." Design brief form (single narrow column) with
  no-silent-failure validation. Serves R3 (unique `(sku, location)`
  addressing) and the named-field validation preference.
- **E2E (UI) story:** Yes. Operator completes the file form in the
  browser, lands on a confirmation, and sees the new row in the table.
- **Priority:** High (nothing to see or adjust until stock can be
  filed).

### FP3 - Adjust the stock level of a SKU at a location
- **Ask:** An operator adjusts the quantity of an existing SKU at a
  location and watches the stock row move in place.
- **Rationale:** V1 "adjust the stock level of one SKU at one
  location" and the overview's demo bar ("scan a real barcode and see
  the stock level move in real time"). Serves R5 (row updates in place,
  optimistic + reconciled), R2 (never below zero), and R1 (adjustment
  keeps an unmodifiable timestamp and actor).
- **E2E (UI) story:** Yes. Operator adjusts from the SKU detail /
  adjustment form and sees the affected row update in place with a
  green flash; an over-decrement below zero is rejected inline.
- **Priority:** High (completes the "see AND adjust" increment the PO
  set as the V1 bar).

## Held for later sprints (NOT this sprint)

- Multiple locations for the same SKU within one warehouse.
- Inbound receipts (known supplier, known quantity).
- Outbound picks with no-overcommit enforcement.
- Single tracking code encoding location/batch/serial.
- Cycle count and reconciliation; multi-warehouse.

## Open questions for the PO (prioritization / scope)

- Is FP1+FP2+FP3 the right first increment, or should the first sprint
  be even thinner (e.g. FP1+FP2 only, deferring adjust)?
- For FP3, is barcode-scan input in scope this sprint, or is a typed
  SKU/quantity form sufficient for the first demonstrable increment
  (scan feedback landing in a later sprint)?
- Single warehouse assumed throughout this sprint; confirm no
  warehouse selector is expected yet.
