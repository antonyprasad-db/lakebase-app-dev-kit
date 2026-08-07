---
author: Spec Author
sprint: 1
date: 2026-08-07
---

# Feature Proposals — Sprint 1

**Context:** No code exists yet. The PO's V1 goal is the simplest runnable increment
that lets a warehouse operator see and adjust stock at one warehouse. The sprint
candidates below are ordered by dependency and demonstrability. Sprint 1 should
close with working software the PO can use; proposed P0/P1 items form that
increment.

The product is a **React + TypeScript SPA** backed by a **FastAPI JSON API**
(see product overview). Every user-facing candidate below requires both an API
layer and a rendered UI story; E2E (UI) stories are noted accordingly.

---

## FP1 · Core inventory record — file, view, and adjust stock

**Stable id:** `FP1`
**One-line ask:** A warehouse operator can file a stock entry for a SKU at a
location, view its current quantity, and adjust it up or down.

**Rationale:**
Maps directly to the PO's primary V1 requirement: "File, retrieve, and adjust
the stock level of one SKU at one location." Delivers the foundational domain
model `(sku, location, quantity)` with the `(sku, location)` uniqueness
guarantee (NFR R3) and the non-negative quantity guard (NFR R2). The audit
trail for every adjustment (timestamp + actor, NFR R1) also lands here.
Nothing else in V1 can be built without this in place.

**E2E (UI) story needed:** Yes — stock-list page showing all entries and an
inline form to file a new entry or adjust an existing one. The stock row
updates in place after a successful adjustment (NFR R5: no full-page reload,
optimistic update).

**Priority:** P0 — must land in sprint 1. This is the demonstrable increment
the PO reviews to decide sprint 2.

---

## FP2 · Multi-location stock view for a SKU

**Stable id:** `FP2`
**One-line ask:** A warehouse operator can see every location at which a given
SKU is held, with per-location quantities, on a single SKU detail page.

**Rationale:**
Maps to "hold stock for the same SKU at multiple locations within one
warehouse." FP1's schema already stores multiple `(sku, location)` rows; this
feature surfaces them in the UI and makes the stock list meaningful beyond a
single row. The SKU detail page is the natural home for inbound receipt and
outbound pick flows (FP3/FP4) when those land in a later sprint.

**E2E (UI) story needed:** Yes — SKU detail page reachable from the stock list,
showing a per-location breakdown table. Empty state when no location holds the
SKU; clean render when optional fields (batch, serial) are absent (NFR
preference: no null crash).

**Priority:** P1 — natural extension of FP1, adds real demonstrability
(operator can navigate from list → detail). Fits in sprint 1 if FP1 completes
with time to spare; otherwise the first candidate for sprint 2.

---

## FP3 · Inbound receipt recording

**Stable id:** `FP3`
**One-line ask:** A receiving operator can record that a known supplier
delivered a known quantity of a SKU to a chosen location, and see stock rise
at that location immediately.

**Rationale:**
Maps to "record inbound receipts: a known supplier delivers a known quantity,
and stock goes up at a chosen location." Depends on FP1's stock model and
upsert semantics. Adds supplier identity and a receipt audit record (NFR R1:
unmodifiable timestamp + actor tied to the receipt event, distinct from a
freeform adjustment). The receipt form is a primary operator workflow; without
it, stock can only grow via manual adjustments.

**E2E (UI) story needed:** Yes — receipt form page; after a successful
submission the stock row at the target location updates in place (R5); inline
validation if quantity is zero or location is unspecified.

**Priority:** P2 — important for V1 completeness; depends on FP1 being stable.
Likely sprint 2 unless sprint 1 finishes FP1 + FP2 early.

---

## FP4 · Outbound pick with overcommit guard

**Stable id:** `FP4`
**One-line ask:** A pick operator can record that a customer order drew stock
from a location, and the system rejects the pick if it would reduce quantity
below zero.

**Rationale:**
Maps to "record outbound picks: a customer order draws stock down at a chosen
location, with the system refusing to overcommit" and enforces NFR R2 (no
stored negative, no silently allowed double-allocation). Depends on FP1 for
the stock model and the non-negative invariant. The overcommit rejection path
is the primary safety guarantee of the V1 product.

**E2E (UI) story needed:** Yes — pick form page; inline error message naming
the field and stating available quantity when the pick would overcommit (NFR
preference: specific validation messages); on success the stock row updates in
place (R5).

**Priority:** P2 — completes the V1 picture alongside FP3; more complex than
FP3 due to the rejection path. Recommended for sprint 2 after FP1 and FP2
are stable, unless the PO wants overcommit protection in sprint 1.

---

## Open questions for the PO

1. **Sprint 1 scope:** Should sprint 1 commit to FP1 + FP2 (see and adjust
   stock, multi-location view) and defer FP3/FP4 to sprint 2, or does the PO
   want the pick overcommit guard (FP4) in sprint 1 to demonstrate the safety
   story?

2. **Tracking-code field:** The overview says "each unit is identified by a
   single tracking code that encodes location, batch, and serial together."
   Should the sprint 1 model store this as a single opaque string field on the
   inventory record, or is it only relevant when recording individual unit
   movements (receipts/picks in FP3/FP4)?

3. **Actor identity (NFR R1):** NFR R1 requires an unmodifiable actor on every
   adjustment. With no authentication in V1 (NFR out-of-bounds), what should
   "actor" be — a free-text operator name the user types, a fixed system label,
   or omitted until auth lands?

4. **Supplier and order records:** FP3 and FP4 reference "a known supplier" and
   "a customer order." Are suppliers and orders managed entities (their own
   pages/lists) in V1, or are they free-text reference strings on the
   receipt/pick record?
