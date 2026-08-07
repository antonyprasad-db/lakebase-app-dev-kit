---
author: Spec Author
---

# StockFlow — sprint candidate features

Candidate features for the **next sprint only**: the first runnable,
demonstrable increment (V1) that lets the warehouse team see and adjust
stock at one warehouse. The UI track is ON, so each candidate is framed
as a user-facing increment; every candidate below needs an **E2E (UI)
story** (Playwright driving the SPA against the real paired branch), not
an API-only slice. These are the PO's input for committing a backlog;
the PO prioritizes and authors the `feature-request.md`.

Candidates are listed in build order. Each builds on the growing
codebase started by F1.

## F1-stock-at-location — File, retrieve, and adjust stock

**Ask (one line):** An operator can file a SKU's stock at a physical
location, retrieve the current level, adjust it up or down, and hold the
same SKU at multiple locations in one warehouse.

**Rationale:** Directly serves the V1 core ("File, retrieve, and adjust
the stock level of one SKU at one location" and "Hold stock for the same
SKU at multiple locations"). Serves NFR R3 (unique `(sku, location)`
addressing), R1 (records survive, adjustments carry timestamp + actor),
R5 (SPA row-in-place update), and the "know what they have, in what
quantity, at which location" product need. Foundation every other
candidate builds on.

**E2E (UI) story:** yes — index/list page, SKU-at-location detail, and
an adjust form; a scan/adjust updates the affected row in place.

**Rough priority:** P0 (must-have foundation; nothing else runs without
the stock record and its read/adjust surface).

## F2-inbound-receipts — Record inbound receipts

**Ask (one line):** An operator records a receipt — a known supplier
delivers a known quantity — and stock goes up at a chosen location.

**Rationale:** Serves the V1 bullet "Record inbound receipts" and the
product need "Receive inbound goods from a supplier and put them
somewhere recoverable." Depends on F1's stock record; adds the inbound
movement that raises stock.

**E2E (UI) story:** yes — a receipt form (supplier, quantity, location)
whose submission raises the stock row in place.

**Rough priority:** P1 (completes the "stock goes up" half of V1;
depends on F1).

## F3-outbound-picks — Record outbound picks with no overcommit

**Ask (one line):** An operator records a pick for a customer order that
draws stock down at a chosen location, and the system refuses to
overcommit beyond available quantity.

**Rationale:** Serves the V1 bullet "Record outbound picks … with the
system refusing to overcommit" and NFR R2 (never below zero, never
overcommit; rejected at write time). Depends on F1's stock record; adds
the outbound movement and the no-overcommit guard.

**E2E (UI) story:** yes — a pick form whose submission lowers the stock
row in place, and shows an inline, field-named rejection when the pick
would overcommit.

**Rough priority:** P1 (completes the "stock goes down" half of V1;
depends on F1).

## Notes for the PO

- The single tracking code that encodes location + batch + serial
  together is accepted as-is for V1 (per the overview); splitting those
  fields is explicitly a later iteration and is not proposed here.
- Product-level non-goals (no auth, no carrier/label/shipping, no
  multi-tenant, no accounting) hold; none of the above touch them.
- If the sprint must be smaller, F1 alone is a usable, demonstrable
  increment (see + adjust stock); F2 and F3 are the natural next slices.
