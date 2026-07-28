# StockFlow Design Guide

## Design Philosophy

Derived from the Databricks brand baseline (`client/src/styles/STYLE_GUIDE.md`, `theme.css`) for color and typography, and a clean warehouse/inventory dashboard layout pattern (Cin7/Linnworks card-and-table conventions) for information density.

- **Clarity over decoration.** Every element earns its space; nothing decorative is added.
- **Guide the user.** Empty states teach, not scold. Every state (empty, loading, success, error) is named explicitly.
- **Warm and professional.** Navy + warm neutrals, not cold corporate grey. Consistent with the Databricks ecosystem.
- **No silent failure.** Every action (receive, pick, adjust, cycle-count) has an explicit success or failure acknowledgment.

## UI Framework and Templating

StockFlow is a React 18 + TypeScript single-page application (Vite, React Router). All UI is component-based; no hand-assembled HTML strings. Template rendering happens in the client boundary only -- the server returns JSON, never HTML.

Every interactive surface carries a stable `data-testid` attribute so Playwright can target it without coupling to CSS or text content. Required seams:

- Page-level: `data-testid="home-page"`, `data-testid="sku-detail-page"`, `data-testid="receive-form"`, `data-testid="pick-form"`, `data-testid="adjustment-form"`, `data-testid="cycle-count-form"`, `data-testid="search-page"`
- State-level per page: `data-testid="empty-state"`, `data-testid="loading-state"`, `data-testid="error-state"`
- Action-level: `data-testid="submit-btn"`, `data-testid="scan-zone"`, `data-testid="stock-table"`, `data-testid="sku-row"` (on each row), `data-testid="feedback-message"`
- Feedback: every form has a `role="alert"` or `aria-live` region AND a `data-testid` ending in `-error`, `-success`, or `-status`

## Typography

Source: Databricks brand reference (`theme.css`). DM Sans is the primary face; DM Mono for all numeric/code values.

| Token | Value | Usage |
|---|---|---|
| `font_family` | `'DM Sans', system-ui, ...` | All UI text |
| `font_mono` | `'DM Mono', ui-monospace, ...` | Quantities, SKU codes, barcodes |
| `text-xs` | 10px | Labels, metadata |
| `text-sm` | 13px | Table cells, secondary text |
| `text-base` | 15px | Body, form inputs |
| `text-md` | 16px | Subheadings |
| `text-lg` | 20px | Page headings |
| `text-xl` | 24px | Section headers |
| `text-xxl` | 29px | Hero / modal headers |
| Line-height body | 1.5 | Prose, form labels |
| Line-height heading | 1.25 | Headings |
| Weights | 400 / 500 / 600 / 700 | regular / medium / semibold / bold |

Numeric quantity cells use `font-family: var(--font-mono)` with `font-variant-numeric: tabular-nums` so columns of numbers align visually.

## Color Palette

Source: Databricks brand reference (`theme.css`, `STYLE_GUIDE.md`). Brand red is reserved for the primary action and active state only; the stock table itself stays calm and high-contrast.

### Brand
| Token | Hex | Usage |
|---|---|---|
| `brand-red` | `#FF3621` | Primary CTA (Receive, Pick, Save), active nav link |
| `brand-red-hover` | `#EB1600` | Hover on primary button |
| `navy-900` | `#1B3139` | Primary text color |

### Semantic
| Token | Hex | Usage |
|---|---|---|
| `success` | `#2E844A` | Confirmed save, green scan flash, in-stock badge |
| `warning` | `#FFAB00` | Low-stock badge, soft alert |
| `info` | `#0176D3` | Informational messages |
| `error` | `#FF3621` | Validation errors, failed scan flash, out-of-stock badge |

Semantic colors are NEVER used alone -- each status badge carries its label as visible text ("out", "low", "ok") in addition to the color.

### Surface
| Token | Hex | Usage |
|---|---|---|
| `page` | `#F9F7F4` | Warm-oat page background |
| `card` | `#FFFFFF` | Card background |
| `text` | `#1B3139` | Default body text |

## Spacing

4px base grid. All margins, padding, and gaps use these tokens via `var(--space-N)`.

| Token | Value |
|---|---|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-12` | 48px |
| `space-16` | 64px (navbar height) |

Content max-width: **960px**, centered. Navbar height: **64px** (`space-16`). Tap targets: minimum **44x44px** on tablet.

## Components

### Primary Button
- Background: `var(--color-brand)` (`#FF3621`), no border, **radius 0px** (sharp corners per brief)
- Hover: `var(--color-brand-hover)` (`#EB1600`)
- Text: white, `text-base`, weight semibold
- Padding: `space-2` vertical, `space-4` horizontal
- Min tap target: 44px height
- Used for: Receive, Pick, Save, Submit, Scan Confirm

### Secondary Button / Ghost
- Background: transparent, border `1px solid var(--color-text)`
- Text: `var(--color-text)`
- Radius: `radius-md` (8px)

### Card
- Background: `var(--color-card)` (white)
- On: `var(--color-surface)` (warm-oat page)
- Border-radius: `radius-md` (8px)
- Shadow: `shadow-sm` (navy-tinted, never black)
- Padding: `space-4` or `space-6`

### Stock Table
- Full-width within the 960px column
- Header: weight semibold, `text-sm`, `var(--color-text)`
- Rows: alternating subtle separator, no heavy zebra
- Quantity column: right-aligned, `font-family: var(--font-mono)`, tabular-nums
- SKU column: left-aligned
- Row hover: light navy tint (opacity 4%)

### Status Badge (Stock Level Pill)
- Conveys state via BOTH text label AND color (never color alone)
- `out` label + `var(--color-error)` background + white text
- `low` label + `var(--color-warning)` background + `var(--color-text)` text
- `ok` label + `var(--color-success)` background + white text
- Radius: `radius-pill` (999px)
- Font: `text-sm`, weight medium

### Form Inputs
- Visible, persistent `<label>` above every input (not placeholder-only)
- Border: `1px solid` muted navy (`rgba(27,49,57,0.3)`)
- Radius: `radius-sm` (4px)
- Focus ring: `2px solid var(--color-brand)`
- Padding: `space-2` vertical, `space-2` horizontal
- Error state: border `var(--color-error)` + inline error message below the field naming the field

### Scan Zone
- Prominent outlined area with `data-testid="scan-zone"`
- Success flash: green overlay (`var(--color-success)` at 20% opacity) for 600ms, then stock row updates in place
- Failure flash: red overlay (`var(--color-error)` at 20% opacity) for 600ms + persistent toast

### Toast / Alert
- `role="alert"` for screen readers
- Persistent until dismissed for failure cases
- Auto-dismiss after 4s for success cases
- Carries both icon and text label

### Navigation Bar
- Height: `space-16` (64px)
- Shadow: `shadow-navbar`
- Active link: `var(--color-brand)` color

### Empty State
- `data-testid="empty-state"`
- Centered in the content area
- Explanatory text ("No stock at this location -- receive an inbound shipment")
- Optional primary action CTA

## User Feedback Principles

Every user action gets an explicit acknowledgment. No silent failure, no unacknowledged success.

1. **Form submit success**: land on a confirmation view, or show an inline green flash for minor adjustments. Never leave the user wondering if the save worked.
2. **Form validation error**: displayed inline immediately below the offending field, naming the field ("Quantity: cannot pick more than the 12 on hand"). Never a generic top-level "something went wrong".
3. **Barcode scan success**: green flash on the scan zone + the stock row updates in place.
4. **Barcode scan failure** (unknown barcode, locked SKU): red flash on the scan zone + a persistent `role="alert"` toast naming the reason.
5. **Overcommit on pick**: field-level error before submit, not after a server round-trip.
6. **Loading states**: every async operation shows a loading indicator (`data-testid="loading-state"`); never a blank region.
7. **Empty states**: explicit message with guidance; never a blank page or blank section.

All feedback regions carry `role="alert"` or `aria-live="polite"` for screen reader announcement. Every form carries at least one `data-testid` ending in `-error`, `-success`, or `-status`.

## Accessibility

- Form inputs: visible, persistent `<label>` (not placeholder-only)
- Tap targets: minimum 44x44px (warehouse tablet use)
- Quantity cells and stock pills: text label + color (never color alone)
- All controls keyboard-reachable; readable at 200% zoom
- Numeric quantities: `font-variant-numeric: tabular-nums` with DM Mono
- Focus indicators: visible 2px outline using `var(--color-brand)`
- ARIA roles on dynamic regions: `role="alert"`, `aria-live="polite"`
