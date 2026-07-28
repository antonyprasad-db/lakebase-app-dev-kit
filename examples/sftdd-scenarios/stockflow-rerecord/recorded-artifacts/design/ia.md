# StockFlow Information Architecture

## Screens

### Home (Stock-by-Location)
**Route:** `/`  
**Purpose:** Show the warehouse operator an at-a-glance view of all stock quantities by SKU and location. The primary read surface; launching point for all transactional flows.

Key elements:
- Navbar with app name + search entry point
- Stock table: SKU code, description, location, quantity (right-aligned, monospace), stock-level badge (ok/low/out)
- Per-row action links: "Receive", "Pick", "Adjust"
- Empty state when no stock exists
- Loading state during data fetch

`data-testid` seams: `home-page`, `stock-table`, `sku-row` (on every row), `empty-state`, `loading-state`, `nav-search-btn`

### SKU Detail
**Route:** `/sku/:sku`  
**Purpose:** Show all stock holdings for a single SKU across all locations, plus tracking code detail (batch/serial). Launching point for SKU-scoped transactions.

Key elements:
- SKU name + code header
- Stock-by-location table (same column layout as home)
- Tracking detail section: if no batch/serial tracked, explicit "Not tracked" (never blank)
- Action buttons: Receive, Pick, Adjust (all scoped to this SKU)

`data-testid` seams: `sku-detail-page`, `stock-table`, `sku-row`, `tracking-detail`, `empty-state`, `loading-state`

### Receive Form
**Route:** `/receive` or `/sku/:sku/receive`  
**Purpose:** Record an inbound shipment -- a supplier delivers a quantity, stock goes up at a chosen location.

Key elements:
- SKU field (barcode-scannable), location field, quantity field, supplier reference (optional)
- Visible labels on all fields
- Scan zone for barcode input
- Submit ("Receive") primary button
- Inline validation errors per field
- Success confirmation on submit

`data-testid` seams: `receive-form`, `scan-zone`, `sku-field`, `location-field`, `quantity-field`, `submit-btn`, `sku-field-error`, `quantity-field-error`, `location-field-error`, `feedback-message`

### Pick Form
**Route:** `/pick` or `/sku/:sku/pick`  
**Purpose:** Record an outbound pick -- a customer order draws stock down at a chosen location. System refuses to overcommit.

Key elements:
- SKU field (barcode-scannable), location field, quantity field, order reference (optional)
- Overcommit guard: inline field error before submit if requested qty > on-hand
- Submit ("Pick") primary button
- Success confirmation on submit

`data-testid` seams: `pick-form`, `scan-zone`, `sku-field`, `location-field`, `quantity-field`, `submit-btn`, `sku-field-error`, `quantity-field-error`, `location-field-error`, `overcommit-error`, `feedback-message`

### Adjustment Form
**Route:** `/adjust` or `/sku/:sku/adjust`  
**Purpose:** Manually correct a stock quantity (reconcile counted vs system value).

Key elements:
- SKU field, location field, new quantity or delta (configurable), reason note
- Submit ("Save Adjustment") primary button
- Inline green flash on success (does not navigate away)
- Inline error on validation failure

`data-testid` seams: `adjustment-form`, `sku-field`, `location-field`, `quantity-field`, `submit-btn`, `sku-field-error`, `quantity-field-error`, `feedback-message`

### Cycle Count Form
**Route:** `/cycle-count`  
**Purpose:** Structured count: operator walks a location, scans or types counted quantities per SKU, system shows variance vs recorded stock.

Key elements:
- Location selector
- Row per SKU at that location: counted qty input, system qty shown read-only, variance indicator
- Submit ("Submit Count") primary button
- Variance review confirmation before final commit

`data-testid` seams: `cycle-count-form`, `location-field`, `count-row` (per row), `counted-qty-field`, `variance-indicator`, `submit-btn`, `feedback-message`

### Search
**Route:** `/search?q=`  
**Purpose:** Find a SKU or location by name, code, or barcode scan.

Key elements:
- Search input (auto-focused, barcode-scannable)
- Results list: SKU code + description, on-hand total
- Empty state when no results match

`data-testid` seams: `search-page`, `search-input`, `search-results`, `search-result-row`, `empty-state`, `loading-state`

## Navigation

**Navbar** (64px, persistent across all screens):
- App name / logo (links to Home)
- Search icon/button (`data-testid="nav-search-btn"`) -- opens Search screen
- No secondary nav items in V1

**Routing model** (React Router, client-side, no full-page reloads):
```
/                          -> Home (stock-by-location)
/sku/:sku                  -> SKU Detail
/receive                   -> Receive Form (no pre-filled SKU)
/sku/:sku/receive          -> Receive Form (SKU pre-filled)
/pick                      -> Pick Form (no pre-filled SKU)
/sku/:sku/pick             -> Pick Form (SKU pre-filled)
/adjust                    -> Adjustment Form (no pre-filled SKU)
/sku/:sku/adjust           -> Adjustment Form (SKU pre-filled)
/cycle-count               -> Cycle Count Form
/search                    -> Search
```

**Entry points:**
- Home is the root; all transactional forms reachable from per-row actions in the stock table
- SKU Detail is reachable by clicking a SKU row on Home or a search result
- Forms are reachable from both Home row actions and SKU Detail actions
- Search is reachable from the navbar at any time

**Back navigation:**
- Forms return to the originating screen (SKU Detail if launched from detail, Home otherwise) after a successful submit
- Cancel links on all forms return without saving

## User Flows

### Flow 1: View stock at a glance (read)
1. Operator opens app -> Home screen loads with stock table
2. Table shows all SKUs, locations, quantities, badges
3. Operator scans a barcode in the scan zone -> row highlights OR navigates to SKU Detail
4. **Empty state path:** no stock -> explicit message + "Receive a shipment" CTA

Seed for E2E: navigate to `/`, assert `data-testid="stock-table"` renders rows; assert `data-testid="sku-row"` count matches fixture; assert empty state when no stock.

### Flow 2: Receive an inbound shipment
1. Operator clicks "Receive" on a Home row (or navigates to `/receive`)
2. Receive Form opens; SKU pre-filled if launched from a row
3. Operator scans barcode into scan zone -> SKU field populates, scan zone flashes green
4. Operator enters quantity and location -> clicks Receive
5. Success: confirmation message; stock table reflects new quantity on return to Home
6. **Error path:** unknown barcode -> scan zone flashes red + toast; overweight qty -> field-level error

Seed for E2E: submit receive form with valid data, assert `data-testid="feedback-message"` shows success; assert stock row quantity updated on Home.

### Flow 3: Pick goods for an order
1. Operator navigates to `/pick` or clicks "Pick" on a Home row
2. Enters SKU, location, quantity
3. System checks on-hand; if sufficient: submit succeeds, stock decrements
4. **Overcommit path:** quantity > on-hand -> `data-testid="overcommit-error"` inline before submit; form blocked
5. Success: confirmation; stock row reflects lower quantity on Home

Seed for E2E: attempt pick of 1 unit with 0 on-hand, assert `data-testid="overcommit-error"` is visible and submit is blocked; then pick valid qty and assert stock decrements.

### Flow 4: Adjust a stock count (reconciliation)
1. Inventory manager clicks "Adjust" on a Home row or SKU Detail
2. Adjustment Form opens with SKU + location pre-filled
3. Manager enters corrected quantity + reason note -> clicks Save Adjustment
4. Success: inline green flash on the form; stock row updates in place (no navigation away)
5. **Error path:** blank quantity or unknown SKU -> field-level error

Seed for E2E: submit adjustment, assert `data-testid="feedback-message"` shows success flash; assert stock table quantity matches new value.

### Flow 5: Search for a SKU
1. Operator taps search icon in navbar
2. Search screen opens with auto-focused input
3. Operator types or scans; results list populates in real time
4. Operator taps a result -> navigates to SKU Detail
5. **Empty state path:** no matches -> explicit "No SKUs match" message

Seed for E2E: type partial SKU code, assert `data-testid="search-result-row"` items appear; tap first result, assert `data-testid="sku-detail-page"` loads.
