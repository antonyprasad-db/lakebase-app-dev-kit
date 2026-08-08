---
author: UX Designer
---

# StockFlow information architecture

Covers the full product intent in `product-overview.md` and
`design-brief.md` (home, SKU detail, receipt/pick/adjustment/cycle-count
forms, search). `F1-stock-visibility` implements **Home** and **SKU
detail** (read-and-record only); the form screens and search are named
here so the IA stays stable as later features land, but are not yet
built, marked **(planned)** below.

## Screens

### Home (stock-by-location table) – F1

The landing screen and entry point. A calm, scannable table of every
`(sku, location)` stock record: SKU, location, quantity (right-aligned,
`font_mono`, tabular figures). Purpose: "what do we have, and where,
right now." An empty warehouse renders an explicit empty state, never a
blank table body.

- `data-testid="stock-table"`: the table root.
- `data-testid="stock-row"`: one per `(sku, location)` record (repeat,
  distinguish by content, not by index alone).
- `data-testid="stock-empty-state"`: rendered instead of the table body
  when there is no stock anywhere yet.

### SKU detail – F1

Reached by selecting a row on Home. Shows one SKU's stock across every
location it's held at, including the `inventory_code` tracking code per
record. Purpose: "where does this specific SKU sit, and under what
tracking code." Optional detail that isn't tracked (par level) renders
an explicit "not tracked" label, never a blank region.

- `data-testid="sku-detail"`: the page root.
- `data-testid="sku-location-row"`: one per location the SKU is held
  at.
- `data-testid="tracking-code"`: the `inventory_code` value.
- `data-testid="par-level-not-tracked"`: rendered when par level is
  absent.

### Receipt form (planned)

Records an inbound delivery: a known supplier, a known quantity, a
chosen location. Reached from Home or SKU detail via a "Receive"
action. Purpose: increase stock at a location traceably.

- `data-testid="receipt-form"`, `data-testid="receipt-quantity-input"`,
  `data-testid="receipt-location-input"`,
  `data-testid="receipt-confirmation"` (success),
  `data-testid="receipt-error"` (validation, scoped to the offending
  field).

### Pick form (planned)

Records an outbound pick against a customer order: draws stock down at
a chosen location, refusing to overcommit. Reached from Home or SKU
detail via a "Pick" action.

- `data-testid="pick-form"`, `data-testid="pick-quantity-input"`,
  `data-testid="pick-confirmation"`,
  `data-testid="pick-overcommit-error"` (the specific "would
  overcommit" validation case named in the brief).

### Adjustment / cycle-count form (planned)

Reconciles a physical count against the system's recorded quantity for
a `(sku, location)`. Reached from SKU detail via an "Adjust" action. A
successful save is an inline green flash rather than a full navigation
(brief: "an inline green flash for an adjustment").

- `data-testid="adjustment-form"`, `data-testid="adjustment-flash"`
  (inline success), `data-testid="adjustment-error"`.

### Search (planned)

Global lookup by SKU, tracking code, or location, reached from the
persistent navbar. Resolves to the matching SKU detail or a
disambiguation list if more than one match.

- `data-testid="search-input"`, `data-testid="search-results"`,
  `data-testid="search-no-results"`.

## Navigation

- A persistent navbar (64px, per the design guide's Layout) hosts the
  brand mark, the Home link (the default/active entry point), and
  (once built) the search input.
- Home -> SKU detail: click/tap a `stock-row`; back returns to Home
  preserving scroll position.
- Home or SKU detail -> Receipt / Pick / Adjustment form (planned): a
  primary-action button (`radius-none`, brand-red) opens the relevant
  form; on success the form returns the user to the screen they came
  from with the updated row visible (no orphaned confirmation screen
  the user can't navigate away from).
- All routing is client-side (React Router); no full-page reloads
  between any of the screens above (design-brief, "UI delivery").
- No screen is more than one navigation away from Home; StockFlow is
  shallow by design (a warehouse operator scanning on the floor cannot
  afford deep menus).

## User flows

1. **See what we have** (Home, story `S2-browse-stock-table`): operator
   opens the app, lands on Home, scans the stock-by-location table.
   Empty warehouse -> `stock-empty-state`. This is the flow every other
   flow assumes as a starting point.
2. **Inspect one SKU** (SKU detail, story `S3-inspect-sku-detail`):
   operator selects a row on Home, reviews that SKU's stock across
   locations and its tracking code, confirms par level ("not tracked"
   if absent), returns to Home.
3. **File a stock record** (story `S1-file-stock-record`, not yet a
   dedicated screen in F1; exercised via the API/seed path the table
   in flow 1 renders): a `(sku, location)` record is created or
   updated and is immediately visible on Home without a page reload.
4. **Receive inbound goods** (planned, Receipt form): operator opens
   Receive from Home or SKU detail, enters supplier + quantity +
   location, submits; success returns to the origin screen with the
   row updated; a validation problem (unknown SKU) names the field
   inline.
5. **Pick for an order** (planned, Pick form): operator opens Pick,
   enters quantity; the system refuses an overcommitting pick with an
   inline error naming the quantity field; success updates the row in
   place.
6. **Reconcile a count** (planned, Adjustment/cycle-count form):
   operator opens Adjust from SKU detail, enters the counted quantity;
   success is an inline green flash on the same screen, not a
   navigation.
7. **Scan on the floor** (planned, cross-cutting across Receipt/Pick):
   a barcode scan resolves to a `(sku, location)` and quantity; success
   flashes green and updates the row in place; failure (unknown
   barcode, locked SKU) flashes the scan zone red and raises a
   persistent toast.
