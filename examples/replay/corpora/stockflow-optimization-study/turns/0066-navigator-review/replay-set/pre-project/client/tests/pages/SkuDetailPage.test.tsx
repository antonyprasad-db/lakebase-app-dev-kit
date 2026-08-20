/**
 * Client component tests for S3-view-sku-detail
 *
 * T28 – navigating to the SKU detail route via <App> in MemoryRouter renders SkuDetailPage
 * T29 – detail page renders one element with data-testid='location-row' per location
 * T30 – each location row contains the visible location NAME text
 * T31 – each location row contains the visible quantity NUMBER
 * T32 – each location row carries its design-guide class (className seam, never inline style)
 * T33 – detail page renders the combined tracking code for a location that carries one
 * T34 – tracking code element carries its design-guide data-testid seam (not inline style)
 * T35 – when par level is null/omitted renders an explicit 'not tracked' indicator
 * T36 – the 'not tracked' par-level indicator carries its design-guide data-testid seam
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { App } from "../../src/App";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LocationRow = {
  sku: string;
  location: string;
  quantity: number;
  tracking_code?: string | null;
  par_level?: number | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAppAtSku(sku: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/stock/${sku}`]}>
      <App />
    </MemoryRouter>,
  );
}

function mockSkuDetailApi(sku: string, rows: LocationRow[]): void {
  vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes(`/api/stock/${sku}`)) {
      return Promise.resolve({
        ok: true,
        json: async () => rows,
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => [] } as Response);
  });
}

const SAMPLE_SKU = "SKU-DETAIL-TEST";
const SAMPLE_ROWS: LocationRow[] = [
  { sku: SAMPLE_SKU, location: "LOC-WAREHOUSE-A", quantity: 42, tracking_code: "TC-BATCH-001", par_level: null },
  { sku: SAMPLE_SKU, location: "LOC-WAREHOUSE-B", quantity: 7, tracking_code: null, par_level: null },
];

// ---------------------------------------------------------------------------
// T28 – MemoryRouter navigates to the SKU detail route and renders SkuDetailPage
// ---------------------------------------------------------------------------

test("T28: navigating to the SKU detail route via <App> in MemoryRouter renders the SkuDetailPage at that path", async () => {
  mockSkuDetailApi(SAMPLE_SKU, SAMPLE_ROWS);

  renderAppAtSku(SAMPLE_SKU);

  // The page must render something identifying itself as the SKU detail view;
  // data-testid="sku-detail-page" is the expected seam
  await waitFor(() => {
    expect(screen.getByTestId("sku-detail-page")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T29 – one location-row element per location
// ---------------------------------------------------------------------------

test("T29: when a SKU has stock at multiple locations, the detail page renders one element carrying data-testid='location-row' per location", async () => {
  mockSkuDetailApi(SAMPLE_SKU, SAMPLE_ROWS);

  renderAppAtSku(SAMPLE_SKU);

  const rows = await screen.findAllByTestId("location-row");
  expect(rows).toHaveLength(SAMPLE_ROWS.length);
});

// ---------------------------------------------------------------------------
// T30 – each row contains the visible location NAME text
// ---------------------------------------------------------------------------

test("T30: each rendered location row contains the visible location NAME text for that location", async () => {
  mockSkuDetailApi(SAMPLE_SKU, SAMPLE_ROWS);

  renderAppAtSku(SAMPLE_SKU);

  for (const row of SAMPLE_ROWS) {
    await waitFor(() => {
      expect(screen.getByText(row.location)).toBeVisible();
    });
  }
});

// ---------------------------------------------------------------------------
// T31 – each row contains the visible quantity NUMBER
// ---------------------------------------------------------------------------

test("T31: each rendered location row contains the visible quantity NUMBER for that location (a row with an empty data-testid and no quantity text fails)", async () => {
  mockSkuDetailApi(SAMPLE_SKU, SAMPLE_ROWS);

  renderAppAtSku(SAMPLE_SKU);

  // Every row must carry a data-testid="location-quantity" element with the right number
  const locationRows = await screen.findAllByTestId("location-row");
  expect(locationRows).toHaveLength(SAMPLE_ROWS.length);

  for (const row of SAMPLE_ROWS) {
    // The quantity text must be visible somewhere on the page
    await waitFor(() => {
      expect(screen.getByText(String(row.quantity))).toBeVisible();
    });
  }

  // Each location-row must contain a data-testid="location-quantity" child
  const qCells = screen.getAllByTestId("location-quantity");
  expect(qCells).toHaveLength(SAMPLE_ROWS.length);
  for (const cell of qCells) {
    expect(cell.textContent?.trim()).not.toBe("");
  }
});

// ---------------------------------------------------------------------------
// T32 – each location row carries its design-guide class (never inline style)
// ---------------------------------------------------------------------------

test("T32: each location row carries its design-guide class (asserted via className seam, never an inline style attribute)", async () => {
  mockSkuDetailApi(SAMPLE_SKU, SAMPLE_ROWS);

  renderAppAtSku(SAMPLE_SKU);

  const rows = await screen.findAllByTestId("location-row");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    // Must carry the design-guide class vocabulary
    expect(row.className).toMatch(/location-row/);
    // Must NOT carry an inline style (hardcoded styles violate the design guide)
    expect(row).not.toHaveAttribute("style");
  }
});

// ---------------------------------------------------------------------------
// T33 – tracking code rendered for a location that has one
// ---------------------------------------------------------------------------

const ROW_WITH_TC = SAMPLE_ROWS[0]; // LOC-WAREHOUSE-A has tracking_code

test("T33: navigating to the SKU detail route via <App> in MemoryRouter renders the combined tracking code for a location that carries one", async () => {
  mockSkuDetailApi(SAMPLE_SKU, SAMPLE_ROWS);

  renderAppAtSku(SAMPLE_SKU);

  await waitFor(() => {
    expect(screen.getByText(ROW_WITH_TC.tracking_code!)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T34 – tracking code element carries its design-guide data-testid seam (no inline style)
// ---------------------------------------------------------------------------

test("T34: the tracking code element carries its design-guide data-testid seam (not an inline style)", async () => {
  mockSkuDetailApi(SAMPLE_SKU, SAMPLE_ROWS);

  renderAppAtSku(SAMPLE_SKU);

  const tcEl = await screen.findByTestId("location-tracking-code");
  expect(tcEl).toBeVisible();
  expect(tcEl).not.toHaveAttribute("style");
});

// ---------------------------------------------------------------------------
// T35 – null par level renders an explicit 'not tracked' indicator
// ---------------------------------------------------------------------------

const ROWS_WITH_NULL_PAR: LocationRow[] = [
  { sku: "SKU-NOPAR", location: "LOC-NOPAR-A", quantity: 5, tracking_code: null, par_level: null },
];

test("T35: navigating to the SKU detail route via <App> in MemoryRouter when the SKU's par level is null/omitted renders an explicit 'not tracked' indicator (not blank, not a crash)", async () => {
  mockSkuDetailApi("SKU-NOPAR", ROWS_WITH_NULL_PAR);

  renderAppAtSku("SKU-NOPAR");

  await waitFor(() => {
    // The indicator must be visible and must contain "not tracked" text (case-insensitive)
    const indicator = screen.getByTestId("par-level-untracked");
    expect(indicator).toBeVisible();
    expect(indicator.textContent?.toLowerCase()).toContain("not tracked");
  });
});

// ---------------------------------------------------------------------------
// T36 – 'not tracked' par-level indicator carries its design-guide data-testid seam
// ---------------------------------------------------------------------------

test("T36: the 'not tracked' par-level indicator carries its design-guide data-testid seam (never an inline style or null rendered as empty string)", async () => {
  mockSkuDetailApi("SKU-NOPAR", ROWS_WITH_NULL_PAR);

  renderAppAtSku("SKU-NOPAR");

  const indicator = await screen.findByTestId("par-level-untracked");
  expect(indicator).toBeVisible();
  // Must not carry an inline style (design-guide tokens only)
  expect(indicator).not.toHaveAttribute("style");
  // Must not be an empty string render of null
  expect(indicator.textContent?.trim()).not.toBe("");
  expect(indicator.textContent?.trim()).not.toBe("null");
});
