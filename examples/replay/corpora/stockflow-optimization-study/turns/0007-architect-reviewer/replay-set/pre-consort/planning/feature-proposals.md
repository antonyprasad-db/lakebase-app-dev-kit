---
author: Spec Author
---

# Sprint candidate features — StockFlow V1 (first usable increment)

Candidates for the next sprint ONLY: the simplest runnable increment that
lets the team see and adjust stock at one warehouse (product-overview
"What I want in V1"). Each is framed as a user-facing SPA increment; the
UI track is ON, so every candidate below needs an **E2E (UI) story** — a
real browser interaction against the SPA, not just an API. The PO owns
priority and the committed backlog.

## F1-stock-visibility

- **Ask:** An operator can file a stock record (a SKU at a location, with
  quantity and its single tracking code) and see the current stock rows
  for a warehouse, including the same SKU held at multiple locations.
- **Rationale:** product-overview "Know what they have, in what quantity,
  at which location" and "Hold stock for the same SKU at multiple
  locations". This is the foundation every other candidate reads/writes;
  it establishes the stock row the whole app is built around. Serves R3
  (unique `(sku, location)`), R5 (SPA), and the empty-state/clean-render
  preferences.
- **E2E (UI) story:** YES — file form + stock list/detail rendered in the
  SPA, including the explicit empty state ("No items yet, add the first
  one").
- **Rough priority:** highest — nothing else is demonstrable without it.

## F2-adjust-stock

- **Ask:** An operator can adjust the stock level of a SKU at a location
  and watch that row move in place.
- **Rationale:** product-overview "file, retrieve, and adjust the stock
  level"; the PO's sign-off bar is "scan a real barcode and see the stock
  level move in real time". Serves R5 (optimistic in-place row update),
  R1 (each adjustment keeps an unmodifiable timestamp + actor), and R2
  (never a stored negative).
- **E2E (UI) story:** YES — adjustment form/control, optimistic row
  update reconciled against the server response, inline validation.
- **Rough priority:** high — this is the increment the PO reviews to sign
  off the sprint.

## F3-inbound-receipt

- **Ask:** An operator records an inbound receipt (a known supplier
  delivers a known quantity) and stock goes up at a chosen location.
- **Rationale:** product-overview "Record inbound receipts". Distinct
  from a raw adjustment: it captures supplier + delivered quantity as a
  receipt event. Serves R1 (durable, timestamped movement record).
- **E2E (UI) story:** YES — receipt form (supplier, SKU, location,
  quantity) with confirmation on success and inline field-named errors.
- **Rough priority:** medium.

## F4-outbound-pick

- **Ask:** An operator records an outbound pick for a customer order that
  draws stock down at a location, and the system refuses to overcommit
  beyond available quantity.
- **Rationale:** product-overview "Record outbound picks ... refusing to
  overcommit". Directly serves R2 (pick rejected at write time, never a
  stored negative, never a double-allocation) with a clear named
  validation message.
- **E2E (UI) story:** YES — pick form plus the observable rejection path
  (overcommit attempt shows an inline error, stock unchanged) as well as
  the success path (stock drawn down in place).
- **Rough priority:** medium — completes the see/receive/pick loop that
  makes V1 genuinely usable.

## Notes for the PO

- Ordering suggestion: F1 → F2 → (F3, F4). F2's optimistic-row-update is
  what meets the "scan and watch it move" sign-off bar; F3/F4 add the
  inbound/outbound movement events on top of the established stock row.
- The single tracking code encoding location/batch/serial is kept as ONE
  field for V1 per the overview; splitting it is explicitly a later
  iteration, not this sprint.
- Open scope question for the PO: is a single default warehouse assumed
  for this sprint, with multi-warehouse deferred? The overview lists
  multi-warehouse as a need but V1 as "one warehouse".
