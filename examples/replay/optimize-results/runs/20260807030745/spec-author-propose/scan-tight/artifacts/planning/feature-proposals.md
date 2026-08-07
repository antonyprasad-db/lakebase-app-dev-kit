---
author: Spec Author
---

# Sprint candidate features , StockFlow, next increment

This proposes the candidates for the **next sprint only**: the smallest
coherent, demonstrable increment on a codebase that currently has
nothing built. The PO's stated first milestone is "the simplest thing
that lets the team **see and adjust stock at one warehouse**," and the
sign-off bar is a warehouse operator scanning a barcode and watching the
stock level move in real time. So this sprint is scoped to **the stock
record itself , file it, retrieve it, and adjust it in place**, rendered
in the SPA.

The UI track is ON (React + TypeScript SPA, Playwright E2E per R5), so
every candidate below is framed as a user-facing increment and each
needs an **E2E (UI) story** driving the rendered SPA against the real
paired-branch DB.

Inbound receipts, outbound picks (no-overcommit), and multi-warehouse
operation are named in the overview but are **deferred to later
sprints**: each is its own usable increment, and the PO folds each
sprint's learning into the next `/plan`. They are listed under "Deferred"
so the PO can see the runway, not commit them now.

---

## F1-stock-record , file & retrieve a stock record

**One-line ask:** A warehouse user can file a stock record (a tracking
code identifying a SKU at a location, with a quantity) and retrieve the
current stock levels, including for the same SKU held at more than one
location within the warehouse.

**Scope:** Create a stock record and read it back; list stock records
and view a single SKU's levels across its locations; hold the same SKU
at multiple locations as distinct records keyed by `(sku, location)`;
render an explicit empty state when nothing is filed yet and "not
tracked" for absent optional detail (par/batch/serial). Filing the same
`(sku, location)` again resolves at write time to a single record, never
a stored duplicate (R3).

**Rationale:** This is the domain foundation , the overview's "know what
they have, in what quantity, at which physical location." Nothing else in
the sprint is usable without a stock record to see. Exercises R3
(unique `(sku, location)`) and R1 (records persist across migrations).

**E2E (UI) story:** Yes , operator loads the SPA, sees the stock list /
SKU detail rendered client-side, and the empty/"not tracked" states.

**Rough priority:** P0 (must land first; everything else builds on it).

---

## F2-adjust-stock-in-place , adjust a stock level

**One-line ask:** A warehouse user can adjust the quantity of an existing
stock record and watch that row update in place in the SPA, with the
adjustment recorded against an unmodifiable timestamp and actor.

**Scope:** Change the quantity of an existing `(sku, location)` record;
the affected row updates in place (optimistic update reconciled against
the server response, per R5) rather than a full-page reload; an
adjustment that would drive the level below zero is rejected at write
time with a clear, field-naming validation message (R2, validation
preference); each adjustment keeps an unmodifiable timestamp and actor
(R1). This is the "scan a barcode and see the stock level move in real
time" demo the PO signs off on.

**Rationale:** Delivers the second half of the PO's first milestone
("see **and adjust** stock"). Distinct from F1: F1 files and reads;
F2 mutates an existing record and adds the never-below-zero rule and the
audit trail. Exercises R2 (no negative stock) and R5 (in-place update).

**E2E (UI) story:** Yes , operator adjusts a quantity and the rendered
row moves in place; the below-zero rejection shows inline.

**Rough priority:** P1 (depends on F1; together they are the
demonstrable increment).

---

## Deferred to later sprints (runway, not this sprint's backlog)

Listed so the PO sees where this is heading; do **not** commit these now.

- **Inbound receipts** , a known supplier delivers a known quantity;
  stock goes up at a chosen location. Its own usable increment.
- **Outbound picks** , a customer order draws stock down at a chosen
  location, with the system refusing to overcommit (the no-overcommit
  rule at order scale, building on F2's never-below-zero foundation).
- **Multi-warehouse operation** , operating across more than one
  warehouse from one deployment.

## Open questions for the PO (sizing / boundary)

- Is filing a stock record's initial quantity a separate action from
  adjusting it, or is "file at quantity N" simply the first adjustment?
  (Affects whether F1 and F2 share a write path.)
- For V1, who is the "actor" recorded on an adjustment (R1), given there
  is no authentication in V1 (NFR out-of-bounds)? A free-text operator
  name, a fixed placeholder, or something else?
- Should this sprint include a way to seed/reset a known stock state for
  demo and testing, or is that purely test-harness plumbing outside the
  feature backlog?
