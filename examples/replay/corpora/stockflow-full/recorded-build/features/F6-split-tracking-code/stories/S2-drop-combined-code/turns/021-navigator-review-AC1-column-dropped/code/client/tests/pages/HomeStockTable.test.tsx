/**
 * Vitest + Testing Library component tests for the HomeStockTable view.
 *
 * T29 – AC3: empty stock data shows the empty-state element with its data-testid
 * T30 – AC3: empty stock data shows the text 'No stock at this location'
 * T23 – AC1: mocked stock data shows the stock table element in the document
 * T24 – AC1: mocked stock data shows one table row per stock record
 * T25 – AC1: each row's SKU cell has data-testid carrying the correct SKU value
 * T26 – AC1: each row's location cell has data-testid carrying the correct location value
 * T27 – AC1: each row's quantity cell has data-testid carrying the correct quantity value
 * T28 – AC2: quantity cell carries the design-guide CSS class (not an inline style)
 *            that implements right-alignment (design-guide: stock-table, quantity cells
 *            use the `stock-table__quantity` class)
 *
 * Strategy: stub global fetch so the useStockList hook resolves to controlled data;
 * render <App> in MemoryRouter at '/' to exercise route wiring in App.tsx.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "../../src/App";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAtHome() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>
  );
}

function stubStockFetch(rows: Array<{ sku: string; location: string; quantity: number }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/stock")) {
        return Promise.resolve({
          ok: true,
          json: async () => rows,
        });
      }
      // Fallback for any other fetch (e.g. /health).
      return Promise.resolve({ ok: true, json: async () => ({}) });
    })
  );
}

const SAMPLE_STOCKS = [
  { sku: "SKU-AAA", location: "LOC-001", quantity: 10 },
  { sku: "SKU-BBB", location: "LOC-002", quantity: 25 },
];

// ---------------------------------------------------------------------------
// AC3 — empty state
// ---------------------------------------------------------------------------

describe("HomeStockTable — empty state (AC3)", () => {
  beforeEach(() => {
    stubStockFetch([]);
  });

  // T29
  it("shows the empty-state element with its data-testid when stock data is empty", async () => {
    renderAtHome();
    await waitFor(() => {
      expect(screen.getByTestId("stock-empty-state")).toBeInTheDocument();
    });
  });

  // T30
  it("shows the text 'No stock at this location' in the empty-state element", async () => {
    renderAtHome();
    await waitFor(() => {
      const emptyState = screen.getByTestId("stock-empty-state");
      expect(emptyState).toHaveTextContent("No stock at this location");
    });
  });
});

// ---------------------------------------------------------------------------
// AC1 — populated table
// ---------------------------------------------------------------------------

describe("HomeStockTable — populated table (AC1)", () => {
  beforeEach(() => {
    stubStockFetch(SAMPLE_STOCKS);
  });

  // T23
  it("shows the stock table element in the document", async () => {
    renderAtHome();
    await waitFor(() => {
      expect(screen.getByTestId("stock-table")).toBeInTheDocument();
    });
  });

  // T24
  it("shows one table row per stock record", async () => {
    renderAtHome();
    await waitFor(() => {
      const rows = screen.getAllByTestId(/^stock-row-/);
      expect(rows).toHaveLength(SAMPLE_STOCKS.length);
    });
  });

  // T25
  it("each row's SKU cell carries the correct SKU value in its data-testid", async () => {
    renderAtHome();
    await waitFor(() => {
      for (const stock of SAMPLE_STOCKS) {
        const cell = screen.getByTestId(`stock-sku-${stock.sku}`);
        expect(cell).toBeInTheDocument();
      }
    });
  });

  // T26
  it("each row's location cell carries the correct location value in its data-testid", async () => {
    renderAtHome();
    await waitFor(() => {
      for (const stock of SAMPLE_STOCKS) {
        const cell = screen.getByTestId(`stock-location-${stock.location}`);
        expect(cell).toBeInTheDocument();
      }
    });
  });

  // T27
  it("each row's quantity cell carries the correct quantity value in its data-testid", async () => {
    renderAtHome();
    await waitFor(() => {
      for (const stock of SAMPLE_STOCKS) {
        const cell = screen.getByTestId(`stock-quantity-${stock.sku}`);
        expect(cell).toBeInTheDocument();
        expect(cell).toHaveTextContent(String(stock.quantity));
      }
    });
  });
});

// ---------------------------------------------------------------------------
// AC2 — quantity cell alignment class (T28)
// ---------------------------------------------------------------------------

describe("HomeStockTable — quantity alignment (AC2)", () => {
  beforeEach(() => {
    stubStockFetch(SAMPLE_STOCKS);
  });

  // T28: the quantity cell must carry the design-guide class `stock-table__quantity`
  // (never an inline style= for text-align) — the design-guide names this component
  // class as the right-alignment contract for numeric quantity cells.
  it("quantity cell carries the design-guide CSS class, not an inline style", async () => {
    renderAtHome();
    await waitFor(() => {
      const firstStock = SAMPLE_STOCKS[0];
      const cell = screen.getByTestId(`stock-quantity-${firstStock.sku}`);
      expect(cell).toBeInTheDocument();
      expect(cell.classList.contains("stock-table__quantity")).toBe(true);
      // Must NOT use inline style for alignment — that would block the
      // design-lane token refactor.
      const inlineStyle = cell.getAttribute("style") ?? "";
      expect(inlineStyle).not.toMatch(/text-align/i);
    });
  });
});
