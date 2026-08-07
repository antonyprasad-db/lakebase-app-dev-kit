---
author: Spec Author
---

# Sprint proposals — StockFlow V1 (first runnable increment)

The next-sprint candidates only: the simplest coherent increment that
lets the team **see and adjust stock at one warehouse** in the browser,
per the PO's V1 intent. Each is framed as a user-facing SPA increment;
all are user-facing and need an **E2E (UI) story** driving the rendered
React SPA against the real server. The PO commits and prioritizes; the
Architect sizes. Later capabilities (multi-warehouse, counting/
reconciliation, splitting the tracking code) are deliberately deferred
to a future `/plan` once V1 is in real use.

## F1 — Stock at a location: file, retrieve, adjust

**Ask:** An operator can record a SKU's stock level at a physical
location, see it, and adjust the quantity, watching the row update in
place.

**Rationale:** This is the core of the PO's V1 ("the simplest thing that
lets the team see and adjust stock at one warehouse") and the spine
every other V1 capability builds on. Serves the "know what they have, in
what quantity, at which location" need. Exercises R1 (records survive,
adjustments keep an unmodifiable timestamp + actor), R3 (unique
`(sku, location)`), R5 (SPA, in-place row update), and R2's
non-negative floor for manual adjustments.

**UI / E2E:** Yes — index page listing stock rows (with explicit empty
state), a SKU-at-location detail view, and an adjustment form that
updates the affected row in place. E2E story required.

**Priority:** Must — foundational; nothing else demos without it.

## F2 — Inbound receipts

**Ask:** An operator records that a known supplier delivered a known
quantity of a SKU, and stock goes up at a chosen location.

**Rationale:** Directly from V1 ("record inbound receipts"). Serves
"receive inbound goods and put them somewhere recoverable". Adds a
distinct behavior beyond F1 (supplier + quantity increases stock at a
location) rather than a raw adjustment.

**UI / E2E:** Yes — a receipt form (supplier, SKU, quantity, location)
that on success confirms and moves the stock row. E2E story required.

**Priority:** Should — the primary way stock enters the system.

## F3 — Outbound picks with no overcommit

**Ask:** An operator picks stock for a customer order, drawing it down
at a chosen location, and the system refuses to overcommit.

**Rationale:** From V1 ("record outbound picks ... refusing to
overcommit"). Serves "pick goods without overcommitting what is
actually there". Directly exercises R2 (a pick that would overcommit is
rejected at write time, never a stored negative) and the preference for
a clear, field-named validation message on rejection.

**UI / E2E:** Yes — a pick form that decrements the row on success and
shows an inline, field-named rejection when the quantity exceeds
available. E2E story required.

**Priority:** Should — the primary way stock leaves the system;
completes the "watch stock move" demo loop.

## Notes for the PO / Architect

- **Multiple locations per SKU** (V1 bullet) is folded into F1's data
  shape (stock is per `(sku, location)`), not a separate feature.
- **Single combined tracking code** (location+batch+serial in one code)
  is a V1 constraint that touches F1–F3; whether it is captured now or
  deferred is an open scope question for the PO.
- Recommend committing F1 first as its own runnable increment, then F2
  and F3, so each sprint lands demonstrable working software.
