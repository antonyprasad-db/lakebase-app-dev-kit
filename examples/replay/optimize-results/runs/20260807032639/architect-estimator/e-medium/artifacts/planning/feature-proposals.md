# Sprint candidate features (StockFlow)

Candidates for the **next sprint only**: the first coherent, demonstrable
increment of V1, "the simplest thing that lets the team see and adjust
stock at one warehouse." UI track is ON, so every candidate below is a
user-facing increment deliverable end to end as an **E2E (UI) story** (a
real browser interaction on the SPA, not just a JSON endpoint). The
Product Owner sizes and commits the backlog; the Architect sizes each.

Recommended sprint slice: **FP1 + FP2** as the foundational usable core
(see and change stock at one location). FP3 through FP5 are ranked
follow-on candidates; the PO cuts the line.

## FP1: File and view stock for a SKU at a location

- **Ask:** As a warehouse worker, I can file a stock record (SKU,
  location, quantity, tracking code) and then see it listed, so I know
  what is on the shelf and where.
- **Rationale:** The floor of everything ("Know what they have, in what
  quantity, at which physical location"); nothing downstream is
  demonstrable without a stock record that renders. Serves overview
  "File, retrieve... the stock level of one SKU at one location" and
  NFR R3 (unique `(sku, location)`).
- **E2E (UI) story:** YES. Empty state ("No stock yet, add the first
  one") to a filed row visible on an index/detail page, filed via a form
  with visible labels and inline validation.
- **Priority:** P0 (sprint-1 foundation).

## FP2: Adjust a stock level in place

- **Ask:** As a warehouse worker, I can adjust the quantity of an
  existing stock row and watch the row update in place, so I can correct
  what the system says without a full page reload.
- **Rationale:** Delivers the PO's headline demo ("scan a real barcode
  and see the stock level move in real time"); exercises NFR R5
  (optimistic in-place update, no reload) and R2 (never below zero) and
  R1 (adjustment keeps timestamp + actor).
- **E2E (UI) story:** YES. Adjust action on a stock row, row quantity
  moves in place, rejection of a below-zero adjustment shown inline.
- **Priority:** P0 (sprint-1 foundation, depends on FP1).

## FP3: Record an inbound receipt

- **Ask:** As a warehouse worker, I can record that a known supplier
  delivered a known quantity, and stock goes up at a chosen location, so
  inbound goods land somewhere recoverable.
- **Rationale:** Serves "Receive inbound goods from a supplier and put
  them somewhere recoverable." Distinct from FP2: a receipt is a
  supplier-attributed inbound event, not a bare correction.
- **E2E (UI) story:** YES. Receipt form (supplier, SKU, location,
  quantity), confirmation on success, target stock row increased.
- **Priority:** P1.

## FP4: Record an outbound pick with no-overcommit

- **Ask:** As a warehouse worker, I can pick a quantity for a customer
  order and draw stock down at a chosen location, and the system refuses
  a pick that would overcommit, so we never promise stock we do not
  have.
- **Rationale:** Serves "Pick goods off the shelf... without
  overcommitting"; the observable enforcement of NFR R2 (overcommit
  rejected at write time).
- **E2E (UI) story:** YES. Pick form, stock row drawn down on success,
  clear inline rejection naming the shortfall when quantity exceeds
  available.
- **Priority:** P1.

## FP5: Hold the same SKU at multiple locations

- **Ask:** As an inventory manager, I can hold and view stock for the
  same SKU across multiple locations within one warehouse, so I see the
  full picture of one SKU spread across shelves.
- **Rationale:** Serves "Hold stock for the same SKU at multiple
  locations within one warehouse"; a distinct viewing/aggregation slice
  beyond FP1's single-row filing (e.g. a SKU detail view listing every
  location that holds it).
- **E2E (UI) story:** YES. SKU detail view listing multiple location
  rows for one SKU, each independently addressable.
- **Priority:** P2.

## Open questions for the Product Owner

- Sprint size: commit FP1+FP2 only, or pull FP3/FP4 into the same
  sprint? (PO owns the backlog cut.)
- Is there a single warehouse assumed for this sprint, with
  multi-warehouse deferred entirely (overview lists it as a need but V1
  scope reads single-warehouse)?
- Should the tracking code (location+batch+serial encoded together) be
  validated for a format in V1, or accepted as an opaque string?
