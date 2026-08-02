# StockFlow Information Architecture

## Screens

### Home -- Stock by Location (`/`)
**Purpose:** The warehouse-floor landing page. Shows all SKUs at all locations in one scannable table. Entry point for all actions.

Key elements:
- Persistent navbar with app wordmark + links to Home and Search.
- Stock table: columns SKU, Description, Location, Quantity (right-aligned, mono), Status badge (ok / low / out, text + color).
- Empty state when no stock: "No stock recorded yet -- receive an inbound shipment." (`data-testid="empty-state"`).
- Scan zone above the table for barcode input: success flashes green + row updates in place; failure flashes red + persistent toast. (`data-testid="scan-zone"`, `data-testid="scan-feedback"`).
- Quick-action buttons: "Receive" and "Pick" link to their respective forms. (`data-testid="btn-receive"`, `data-testid="btn-pick"`).

Required seams: `data-testid="navbar"`, `data-testid="stock-table"`, `data-testid="stock-row-<sku>"`, `data-testid="stock-badge-<sku>"`, `data-testid="scan-zone"`, `data-testid="scan-feedback"`, `data-testid="empty-state"`, `data-testid="btn-receive"`, `data-testid="btn-pick"`, `data-testid="loading"`, `data-testid="toast"`.

---

### SKU Detail (`/sku/:skuId`)
**Purpose:** A single-column detail page for one SKU. Shows all locations holding this SKU, with quantities per location. Entry point for Adjust and Cycle Count actions on that SKU.

Key elements:
- Breadcrumb: Home > SKU name.
- Detail card: SKU code, description, total quantity across all locations.
- Per-location table: Location, Quantity (mono, right-aligned), Status badge.
- "No batches / serial tracking" note when not tracked (never a blank region). (`data-testid="no-tracking-note"`).
- Action buttons: "Adjust" and "Cycle Count" scoped to this SKU. (`data-testid="btn-adjust"`, `data-testid="btn-cycle-count"`).
- Empty state if no locations hold this SKU. (`data-testid="empty-state"`).

Required seams: `data-testid="sku-detail"`, `data-testid="location-table"`, `data-testid="location-row-<locationId>"`, `data-testid="no-tracking-note"`, `data-testid="btn-adjust"`, `data-testid="btn-cycle-count"`, `data-testid="empty-state"`.

---

### Receive Form (`/receive`)
**Purpose:** Record inbound goods from a supplier. Increments stock at a chosen location.

Key elements:
- Single-column card form.
- Fields: SKU (text, with label), Supplier (text, with label), Location (select, with label), Quantity (number, with label).
- Inline validation errors below each field, named by field. (`data-testid="error-sku"`, `data-testid="error-location"`, `data-testid="error-qty"`).
- Primary "Receive" button (brand-red, sharp corners). (`data-testid="btn-save"`).
- On success: confirmation view "Stock received. SKU [X] +[N] at [Location]." with a "Back to Home" link. (`data-testid="form-success"`).
- `role="alert"` region for form-level errors. (`data-testid="form-error"`).

Required seams: `data-testid="receive-form"`, `data-testid="field-sku"`, `data-testid="field-supplier"`, `data-testid="field-location"`, `data-testid="field-qty"`, `data-testid="error-sku"`, `data-testid="error-location"`, `data-testid="error-qty"`, `data-testid="btn-save"`, `data-testid="form-success"`, `data-testid="form-error"`, `data-testid="loading"`.

---

### Pick Form (`/pick`)
**Purpose:** Record outbound picks for a customer order. Decrements stock; refuses to overcommit.

Key elements:
- Single-column card form.
- Fields: SKU, Location (select, filtered to locations holding the SKU), Quantity.
- Inline overcommit error on quantity field when requested > available. (`data-testid="error-qty"`).
- Unknown SKU error on SKU field. (`data-testid="error-sku"`).
- Primary "Pick" button. (`data-testid="btn-save"`).
- On success: confirmation "Stock picked. SKU [X] -[N] from [Location]." (`data-testid="form-success"`).
- `role="alert"` region for form-level errors. (`data-testid="form-error"`).

Required seams: `data-testid="pick-form"`, `data-testid="field-sku"`, `data-testid="field-location"`, `data-testid="field-qty"`, `data-testid="error-sku"`, `data-testid="error-location"`, `data-testid="error-qty"`, `data-testid="btn-save"`, `data-testid="form-success"`, `data-testid="form-error"`, `data-testid="loading"`.

---

### Adjust Form (`/sku/:skuId/adjust`)
**Purpose:** Manually correct stock at a specific location (inventory adjustment). Accessible from SKU Detail.

Key elements:
- Single-column card form, pre-filled with SKU from context.
- Fields: Location (select), New Quantity (number).
- Inline error on quantity if invalid. (`data-testid="error-qty"`).
- On success: inline green flash on the stock row in the detail page, then redirect to SKU Detail. (`data-testid="form-success"`).
- `role="alert"` region. (`data-testid="form-error"`).

Required seams: `data-testid="adjust-form"`, `data-testid="field-location"`, `data-testid="field-qty"`, `data-testid="error-qty"`, `data-testid="btn-save"`, `data-testid="form-success"`, `data-testid="form-error"`, `data-testid="loading"`.

---

### Search (`/search`)
**Purpose:** Find a SKU or location by code or description. Quick path to SKU Detail.

Key elements:
- Search input, always focused on load.
- Results list: SKU code, description, total quantity, Status badge.
- Empty state when no results. (`data-testid="empty-state"`).
- Each result row links to SKU Detail. (`data-testid="search-result-<sku>"`).

Required seams: `data-testid="search-input"`, `data-testid="search-results"`, `data-testid="search-result-<sku>"`, `data-testid="empty-state"`, `data-testid="loading"`.

---

## Navigation

```
Navbar (persistent, all screens)
  [StockFlow wordmark] --> /
  [Home]               --> /
  [Search]             --> /search
  [Receive]            --> /receive
  [Pick]               --> /pick
```

Routing model: React Router client-side routes, no full-page reloads.

Screen connections:
- `/` (Home) -- "Receive" button --> `/receive`
- `/` (Home) -- "Pick" button --> `/pick`
- `/` (Home) -- click stock row --> `/sku/:skuId`
- `/search` -- click result --> `/sku/:skuId`
- `/sku/:skuId` -- "Adjust" button --> `/sku/:skuId/adjust`
- `/sku/:skuId/adjust` -- on success --> `/sku/:skuId`
- `/receive` -- on success --> `/` (or confirmation stays in place with "Back to Home")
- `/pick` -- on success --> `/` (or confirmation stays in place with "Back to Home")

All screens are reachable from the navbar. Deep-link URLs are valid entry points (React Router handles them).

---

## User Flows

### Flow 1: Receive inbound goods (maps to Receive story)
1. Operator arrives at `/` (Home).
2. Taps "Receive" (navbar or home button) -> lands on `/receive`.
3. Scans or types SKU into the SKU field.
4. Selects Location, enters Quantity.
5. Taps "Receive" (primary button).
6. **Success path**: confirmation shown, stock table on Home reflects the new quantity.
7. **Validation-error path**: inline error next to the offending field; form does not submit.

### Flow 2: Pick outbound goods (maps to Pick story)
1. Operator arrives at `/` (Home).
2. Taps "Pick" -> `/pick`.
3. Enters SKU, selects Location (filtered to locations that hold stock).
4. Enters Quantity.
5. **Overcommit path**: inline error on qty field before submit.
6. **Unknown SKU path**: inline error on SKU field.
7. **Success path**: confirmation shown, stock table reflects the reduced quantity.

### Flow 3: Barcode scan on Home (maps to Scan story)
1. Operator focuses the scan zone on `/`.
2. Scans a barcode.
3. **Success**: green flash on scan zone, stock row for that SKU updates in place.
4. **Unknown barcode**: red flash on scan zone + persistent toast naming the barcode.
5. **Locked SKU**: red flash + persistent toast naming the SKU and reason.

### Flow 4: Check and adjust a SKU (maps to Adjust / Cycle-Count story)
1. Operator searches `/search` or taps a row on Home -> `/sku/:skuId`.
2. Reviews per-location quantities.
3. Taps "Adjust" -> `/sku/:skuId/adjust`.
4. Sets location + new quantity.
5. **Success**: green flash, redirected to SKU Detail with updated quantity.
6. **Validation error**: inline error on qty field.

### Flow 5: Empty-state discovery (new warehouse / new SKU)
1. Operator arrives at `/` with no stock recorded.
2. Empty state is shown: "No stock recorded yet -- receive an inbound shipment."
3. Taps the inline "receive an inbound shipment" link -> `/receive`.
