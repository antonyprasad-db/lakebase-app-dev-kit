---
author: Spec Author
role: planning
---

# Sprint proposals , StockFlow V1 foundation

Candidate features for the **next sprint only**: the first runnable,
demonstrable increment that lets the warehouse team *see and adjust
stock at one warehouse* (the PO's stated V1 spine). Everything past the
no-overcommit pick is left for a later `/plan` once V1 is in real use.

The **UI track is ON**: StockFlow is delivered as a React + TypeScript
SPA (R5), so every candidate below is framed as a user-facing increment
and flags the **E2E (UI) story** it needs , the operator must be able
to drive it in the rendered SPA against the real paired branch, not an
API-only slice.

Priority reflects build order on one growing codebase: FP1 is the
foundation FP2 and FP3 build on. The PO owns the final backlog and
prioritization; these are input, not a committed sprint.

---

## FP1 , Stock level at a location (foundation)

**Ask:** File a SKU at a physical location with a starting quantity,
retrieve current stock (home/index list + a per-SKU detail view), and
adjust a stock level up or down, with the same SKU held at multiple
locations within one warehouse.

**Rationale:** Directly serves the overview's "Know what they have, in
what quantity, at which physical location, at any point in time" and the
V1 bullets *file/retrieve/adjust one SKU at one location* and *hold
stock for the same SKU at multiple locations*. Establishes the
`(sku, location)` addressing that **R3** (unique per pair, collision
resolved at write time) depends on, the audit fields (**R1**:
timestamp + actor on every adjustment), and the "never below zero"
floor (**R2**). Nothing else can be received or picked until stock rows
exist.

**UI / E2E:** Yes , needs an E2E (UI) story. Home/index list (with an
explicit empty state), SKU detail view, and an adjustment form; the
adjusted row updates **in place** (R5, optimistic + reconciled). Missing
optional detail (par/batch/serial) shows "not tracked", never a blank.

**Rough size / priority:** Largest; must land first. **P0.**

---

## FP2 , Record an inbound receipt

**Ask:** Record that a known supplier delivered a known quantity of a
SKU; stock goes **up** at a chosen location (creating the stock row if
none exists there yet).

**Rationale:** Serves the overview's "Receive inbound goods from a
supplier and put them somewhere recoverable" and the V1 bullet on
inbound receipts. Depends on FP1's stock rows and exercises the R3
write-time collision path (receiving into an existing `(sku, location)`
updates in place). Preserves the R1 audit trail on the resulting
increase.

**UI / E2E:** Yes , needs an E2E (UI) story. A receipt form (supplier,
SKU, location, quantity) reached client-side; on submit the affected
stock row moves in place, a confirmation is shown, and invalid input is
reported inline naming the field (R5, validation preference).

**Rough size / priority:** Medium. **P1.**

---

## FP3 , Record an outbound pick (no overcommit)

**Ask:** Record a customer order drawing stock **down** at a chosen
location, with the system refusing to overcommit beyond available
quantity.

**Rationale:** Serves "Pick goods off the shelf ... without
overcommitting" and the V1 outbound-pick bullet. This is the feature
that proves **R2**: a pick that would drive a location below zero is
rejected at write time , never a stored negative, never a silent
double-allocation. Depends on FP1 (and typically stock put there by
FP2) so there is quantity to draw down and refuse.

**UI / E2E:** Yes , needs an E2E (UI) story. A pick form; a valid pick
moves the row down in place with confirmation, and an over-quantity pick
is rejected with a clear inline message naming the shortfall (R2 + R5).

**Rough size / priority:** Medium. **P1** (after FP2 so there is stock
to pick).

---

## Notes for the PO / Architect

- **Single tracking code (location+batch+serial encoded together) is a
  deliberate V1 simplification** the overview flags for later revisit;
  proposals above do not split those fields.
- **Out of this sprint (deferred to a later `/plan`):** counting /
  cycle-count reconciliation, multi-warehouse operation, supplier and
  SKU master-data management as standalone features, and everything in
  the product-level non-goals (no auth, no shipping/label integration,
  no accounting).
- **Open sizing question for the PO:** whether FP1 must ship all three
  of file + view + adjust to be demonstrable, or whether view + adjust
  of a seeded SKU is an acceptable first demo with "file a new SKU"
  folded into FP2's create-on-receipt path. Raising it here rather than
  deciding it.
