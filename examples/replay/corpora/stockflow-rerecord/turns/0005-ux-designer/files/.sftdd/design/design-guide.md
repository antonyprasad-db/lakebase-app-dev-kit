# StockFlow Design Guide

## Design Philosophy

Sourced from the Databricks-brand default (`client/src/styles/STYLE_GUIDE.md`, `theme.css`) for brand and color; warehouse/inventory dashboard references (Cin7, Linnworks card-and-table layout) for information density and layout cadence.

1. **Clarity over decoration.** Every element earns its space. The stock table is the hero; no chrome competes with it.
2. **Guide the user.** Every empty state teaches: "No stock at this location -- receive an inbound shipment." Never a blank region or a silent null.
3. **Warm and professional.** Navy + warm-oat neutrals, never cold corporate grey. Consistent with the Databricks ecosystem.
4. **Scannable at a glance.** Numeric columns are right-aligned with tabular figures (DM Mono). Status carries both text and color -- never color alone.
5. **Tablet-first floor UX.** 44x44 px minimum tap targets. Readable at 200% zoom. Barcode scan is the primary input; keyboard is always available.

---

## UI Framework and Templating

- **React 18 + TypeScript SPA** under `client/` (Vite). No server-rendered HTML; the server returns JSON only.
- **React Router** for client-side routing (no full-page reloads between screens).
- **Component library**: project-built presentational components under `client/src/components/`. No hand-assembled raw HTML outside components.
- Every interactive state (loading, empty, success, error, validation-failed) is a discrete component state, never a blank region.
- **Stable test seams**: every screen, form, status region, and feedback element carries a `data-testid` attribute named by role (e.g., `data-testid="stock-table"`, `data-testid="scan-feedback"`, `data-testid="form-error-sku"`). This is mandatory, not optional.
- Feedback regions use `role="alert"` or `aria-live="polite"` so screen readers announce state changes without focus movement.
- Rendering boundary: pages (`client/src/pages/`) wire hooks + components; components are pure presentational. The `api/` layer is the sole issuer of `fetch`.

---

## Typography

Source: Databricks-brand default (`STYLE_GUIDE.md`). DM Sans (UI copy) + DM Mono (quantities, codes, numeric columns).

| Token | Value | Use |
|---|---|---|
| `--font-sans` | `"DM Sans", system-ui, …` | All UI copy |
| `--font-mono` | `"DM Mono", ui-monospace, …` | Quantities, SKU codes, barcodes |
| `text-xs` | 10px | Micro labels, badge text |
| `text-sm` | 13px | Table cells, secondary labels |
| `text-base` | 15px | Body, form inputs |
| `text-md` | 16px | Sub-headings |
| `text-lg` | 20px | Page headings |
| `text-xl` | 24px | Hero headings |
| `text-xxl` | 29px | Display / splash |
| Body line-height | 1.5 | Paragraphs, table rows |
| Heading line-height | 1.25 | H1-H3 |
| Regular | 400 | Body, table cells |
| Medium | 500 | Labels, badge text, nav links |
| Semibold | 600 | Sub-headings, form labels |
| Bold | 700 | Page headings |

Numeric quantities in table cells and detail panels always use `font-family: var(--font-mono)` and `font-variant-numeric: tabular-nums` so columns align.

---

## Color Palette

Source: Databricks-brand default (`theme.css`). Brand red is reserved for primary CTA and active state only; everything else is calm navy + warm neutrals.

### Brand
| Token | Hex | Use |
|---|---|---|
| `brand-red` | `#FF3621` | Primary button (Receive, Pick, Save), active nav link |
| `brand-red-hover` | `#EB1600` | Hover / pressed state of primary button |
| `navy-900` | `#1B3139` | Primary text, navbar background |

### Semantic
| Token | Hex | Use |
|---|---|---|
| `success` | `#2E844A` | Inline save flash, scan success, OK stock badge |
| `warning` | `#FFAB00` | Low-stock badge (text + color) |
| `info` | `#0176D3` | Informational toast |
| `error` | `#FF3621` | Validation inline error, scan-fail flash, out-of-stock badge |

Status is ALWAYS communicated with both text and color (e.g., a badge reads "out" AND uses the error color). Never color alone.

### Surface
| Token | Hex | Use |
|---|---|---|
| `page` | `#F9F7F4` | Page / body background (warm oat) |
| `card` | `#FFFFFF` | Card and panel background |

---

## Spacing

4px base grid. Source: Databricks-brand default (`theme.css`).

| Token | Value | Typical use |
|---|---|---|
| `space-1` | 4px | Icon gap, badge padding (v) |
| `space-2` | 8px | Badge padding (h), tight row gap |
| `space-4` | 16px | Section padding, form field gap |
| `space-6` | 24px | Page padding, card padding |
| `space-8` | 32px | Section gap |
| `space-12` | 48px | Large section separation |
| `space-16` | 64px | Navbar height |

Content max-width: **960px**, centered, `padding: var(--space-6) var(--space-4)`.

---

## Components

### Navbar
- Height 64px (`var(--space-16)`), `background: var(--color-text)` (navy-900), white wordmark + links.
- Active link: `color: var(--color-brand)`, weight medium.
- `data-testid="navbar"`.

### Card
- `background: var(--color-card)`, `border-radius: var(--radius-md)`, `box-shadow: var(--shadow-sm)`.
- Inner padding `var(--space-6)`.
- `data-testid="card-<name>"`.

### Primary Button
- `background: var(--color-brand)`, color white, `border-radius: 0` (sharp corners per brief), weight semibold.
- Hover: `background: var(--color-brand-hover)`.
- Min tap target 44x44px.
- `data-testid="btn-<action>"` (e.g., `btn-save`, `btn-receive`, `btn-pick`).

### Stock Table
- Full-width within card. Row height min 44px (tablet tap target).
- SKU / description columns: left-aligned, font-sans.
- Quantity columns: right-aligned, font-mono, tabular-nums.
- Row hover: `background: rgba(27,49,57,0.04)`.
- `data-testid="stock-table"`, each row `data-testid="stock-row-<sku>"`.

### Status Badge
- `border-radius: var(--radius-pill)`, font-size text-sm, weight medium.
- States: `--ok` (success green + white text), `--warn` (warning amber + navy text), `--error` (brand-red + white text).
- Always includes visible text label ("ok", "low", "out") in addition to color.
- `data-testid="stock-badge-<sku>"`.

### Form Field
- Visible persistent label above the input (never placeholder-only).
- Input: `border-radius: var(--radius-sm)`, border `1px solid var(--color-text)` at 40% opacity, padding `var(--space-2) var(--space-4)`.
- Error: inline message below the field, `color: var(--color-error)`, `role="alert"`.
- `data-testid="field-<name>"`, error `data-testid="error-<name>"`.

### Scan Zone
- Visually distinct region with a barcode icon and prompt text.
- Success state: green flash (`background: var(--color-ok)`), fades after 1.5s; stock row updates in place.
- Failure state: red flash (`background: var(--color-error)`), does not auto-dismiss; shows persistent toast.
- `data-testid="scan-zone"`, `data-testid="scan-feedback"`.

### Toast / Alert
- `role="alert"` or `aria-live="polite"`. Appears top-right, above content.
- Success: success green background; Error: brand-red background.
- Persistent until dismissed (or 5s auto-dismiss for success only).
- `data-testid="toast"`.

### Empty State
- Centered in the content area, icon + heading + action prompt.
- Never a blank region; always explains what is missing and what to do.
- `data-testid="empty-state"`.

---

## User Feedback Principles

No silent failure. No unacknowledged success.

1. **Every form submission gets a response.** A successful Receive / Pick / Adjustment lands on a confirmation view or an inline flash. A failed validation shows an inline error next to the offending field, naming the field.
2. **Barcode scans are always acknowledged.** Success: green flash + stock row updates in place. Failure (unknown barcode, locked SKU): red flash on the scan zone + persistent toast naming the reason.
3. **Overcommit is caught before submit.** A pick quantity that exceeds available stock shows an inline error on the quantity field before the form can be submitted.
4. **Loading is visible.** Any async operation shows a loading indicator (`data-testid="loading"`) and disables the submit button to prevent double-submission.
5. **Every feedback region is addressable by the E2E layer.** `role="alert"` / `aria-live` for screen readers; `data-testid` naming the state (e.g., `data-testid="form-success"`, `data-testid="form-error-qty"`) for Playwright.

### Adherence contract (E2E checks)

The Playwright suite runs `assertDesignAdherence` against the live `:root` CSS to verify all tokens in `design-guide.json` are present and match. Element-level checks additionally verify:

- `checkHardcodedValues`: no hex or raw px in inline `style=` / `<style>` outside `:root` token definitions.
- `checkRequiredSeams`: every `data-testid` declared in `ia.md` is rendered in its screen.
- `checkFeedbackPresent`: every `<form>` or submit control has a sibling `role="alert"` / `aria-live` region or a `data-testid` naming error/success/message/status.
