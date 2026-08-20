/**
 * Tests for HomePage stock table: T18, T19, T20, T22, T23.
 *
 * Uses MemoryRouter + vi.mock for the stock API so these are pure component
 * tests (no network); the real API contract is covered by T17/T21 (pytest-bdd).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../src/App";

// ---------------------------------------------------------------------------
// Mock the stock API module (does not exist yet – the import will fail until
// the Driver creates client/src/api/stock.ts, keeping the tests RED).
// ---------------------------------------------------------------------------
vi.mock("../../src/api/stock", () => ({
  fetchStock: vi.fn(),
}));

import { fetchStock } from "../../src/api/stock";
const mockFetchStock = fetchStock as ReturnType<typeof vi.fn>;

function renderHome() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// T18 – home route renders a stock-table row for each API record
// ---------------------------------------------------------------------------
describe("T18 – stock table rows from API", () => {
  beforeEach(() => {
    mockFetchStock.mockResolvedValue([
      { sku: "SKU-A", location: "LOC-1", quantity: 10 },
      { sku: "SKU-B", location: "LOC-2", quantity: 20 },
    ]);
  });

  it("renders one row per record returned by the API", async () => {
    renderHome();
    await waitFor(() => {
      expect(screen.getByText("SKU-A")).toBeInTheDocument();
      expect(screen.getByText("SKU-B")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// T19 – stock table renders exactly one row per record with SKU/location/qty
// ---------------------------------------------------------------------------
describe("T19 – stock table cell content", () => {
  beforeEach(() => {
    mockFetchStock.mockResolvedValue([
      { sku: "SKU-X", location: "LOC-X", quantity: 42 },
    ]);
  });

  it("renders exactly one data row with SKU, location, and quantity visible", async () => {
    renderHome();
    await waitFor(() => {
      expect(screen.getByText("SKU-X")).toBeInTheDocument();
      expect(screen.getByText("LOC-X")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
    });
    // Only one data row (not counting header)
    const rows = screen.getAllByRole("row");
    // header + 1 data row = 2 total
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// T20 – quantity cells carry the design-guide stock-table class seam
// ---------------------------------------------------------------------------
describe("T20 – quantity cells have stock-table class seam", () => {
  beforeEach(() => {
    mockFetchStock.mockResolvedValue([
      { sku: "SKU-Q", location: "LOC-Q", quantity: 7 },
    ]);
  });

  it("quantity cell carries the stock-table__qty class for right-alignment and tabular-nums", async () => {
    renderHome();
    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
    });
    const qtyCell = screen.getByText("7");
    expect(qtyCell).toHaveClass("stock-table__qty");
  });
});

// ---------------------------------------------------------------------------
// T22 – empty state element present when API returns no records
// ---------------------------------------------------------------------------
describe("T22 – empty state rendered when no records", () => {
  beforeEach(() => {
    mockFetchStock.mockResolvedValue([]);
  });

  it("renders element with data-testid='empty-state' when stock list is empty", async () => {
    renderHome();
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// T23 – empty state text
// ---------------------------------------------------------------------------
describe("T23 – empty state text", () => {
  beforeEach(() => {
    mockFetchStock.mockResolvedValue([]);
  });

  it("displays 'No stock at this location' in the empty-state element", async () => {
    renderHome();
    await waitFor(() => {
      const el = screen.getByTestId("empty-state");
      expect(el).toHaveTextContent("No stock at this location");
    });
  });
});
