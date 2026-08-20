/**
 * Client component tests for S2-view-home-stock-table
 * T18 – App renders a stock-table row per API record (MemoryRouter)
 * T19 – StockTable renders exactly one row per record with SKU, location, quantity
 * T20 – quantity cells carry the .stock-table__cell--quantity class seam
 * T22 – App renders data-testid="empty-state" when API returns []
 * T23 – empty-state element displays "No stock at this location"
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { App } from "../../src/App";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StockRecord = { sku: string; location: string; quantity: number };

function renderApp(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
}

function mockStockApi(records: StockRecord[]): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => records,
  } as Response);
}

const SAMPLE_RECORDS: StockRecord[] = [
  { sku: "SKU-ALPHA", location: "LOC-A", quantity: 42 },
  { sku: "SKU-BETA", location: "LOC-B", quantity: 7 },
];

// ---------------------------------------------------------------------------
// T18 – navigating to "/" renders a stock-table row per API record
// ---------------------------------------------------------------------------

test("T18: App at home route renders a stock-table row for each record returned by the API", async () => {
  mockStockApi(SAMPLE_RECORDS);

  renderApp();

  for (const rec of SAMPLE_RECORDS) {
    await waitFor(() => {
      expect(screen.getByText(rec.sku)).toBeVisible();
    });
  }
});

// ---------------------------------------------------------------------------
// T19 – stock table renders exactly one row per record with SKU, location, quantity
// ---------------------------------------------------------------------------

test("T19: stock table renders exactly one row per stock record with SKU, location, and quantity cells visible", async () => {
  mockStockApi(SAMPLE_RECORDS);

  renderApp();

  // One data-row per record
  for (const rec of SAMPLE_RECORDS) {
    await waitFor(() => {
      expect(screen.getByText(rec.sku)).toBeVisible();
      expect(screen.getByText(rec.location)).toBeVisible();
      expect(screen.getByText(String(rec.quantity))).toBeVisible();
    });
  }

  // Exactly the right number of rows (no duplicates, no extras)
  const rows = await screen.findAllByTestId("stock-table-row");
  expect(rows).toHaveLength(SAMPLE_RECORDS.length);
});

// ---------------------------------------------------------------------------
// T20 – quantity cells carry the design-guide class seam for right-align + tabular-nums
// ---------------------------------------------------------------------------

test("T20: quantity cells in the stock table carry the stock-table__cell--quantity class seam", async () => {
  mockStockApi(SAMPLE_RECORDS);

  renderApp();

  const qCells = await screen.findAllByTestId("stock-table-quantity");
  expect(qCells.length).toBeGreaterThanOrEqual(SAMPLE_RECORDS.length);
  for (const cell of qCells) {
    expect(cell).toHaveClass("stock-table__cell--quantity");
  }
});

// ---------------------------------------------------------------------------
// T22 – App renders data-testid="empty-state" when API returns []
// ---------------------------------------------------------------------------

test("T22: App at home route renders empty-state element when API returns no records", async () => {
  mockStockApi([]);

  renderApp();

  await waitFor(() => {
    expect(screen.getByTestId("empty-state")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T23 – empty-state element displays the prescribed copy
// ---------------------------------------------------------------------------

test("T23: empty-state element displays 'No stock at this location' when the stock list is empty", async () => {
  mockStockApi([]);

  renderApp();

  const emptyState = await screen.findByTestId("empty-state");
  expect(emptyState).toHaveTextContent("No stock at this location");
});
