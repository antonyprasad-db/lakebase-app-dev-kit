/**
 * T20 - Stock-by-location table renders one row per record with SKU, location,
 *       and quantity via its data-testid seams.
 * T21 - Quantity-column cells carry the right-align design-guide class / data-testid
 *       seam; asserted via the seam, NOT inline style or raw CSS.
 * T23 - Empty collection maps to "No stock at this location" empty-state via
 *       its data-testid seam rather than a blank page.
 *
 * Vitest + Testing Library component tests.
 * No server required; the api layer is stubbed.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StockByLocationPage } from "../../src/pages/StockByLocationPage";

// Stub the api layer so the component renders without a running server.
vi.mock("../../src/api/stock", () => ({
  fetchStockByLocation: vi.fn(),
}));

import { fetchStockByLocation } from "../../src/api/stock";
const mockFetch = fetchStockByLocation as ReturnType<typeof vi.fn>;

const SAMPLE_RECORDS = [
  { sku: "SKU-AAAA", location: "LOC-WEST", quantity: 12 },
  { sku: "SKU-BBBB", location: "LOC-WEST", quantity: 99 },
];

describe("StockByLocationPage - T20: table renders rows with seams", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(SAMPLE_RECORDS);
  });

  it("renders the stock-table container", async () => {
    render(
      <MemoryRouter initialEntries={["/location/LOC-WEST"]}>
        <StockByLocationPage />
      </MemoryRouter>
    );
    expect(await screen.findByTestId("stock-table")).toBeInTheDocument();
  });

  it("renders one stock-row per record", async () => {
    render(
      <MemoryRouter initialEntries={["/location/LOC-WEST"]}>
        <StockByLocationPage />
      </MemoryRouter>
    );
    // Wait for at least the first row to appear.
    await screen.findByTestId("stock-row-SKU-AAAA");
    expect(screen.getByTestId("stock-row-SKU-AAAA")).toBeInTheDocument();
    expect(screen.getByTestId("stock-row-SKU-BBBB")).toBeInTheDocument();
  });

  it("each row displays its SKU", async () => {
    render(
      <MemoryRouter initialEntries={["/location/LOC-WEST"]}>
        <StockByLocationPage />
      </MemoryRouter>
    );
    await screen.findByTestId("stock-row-SKU-AAAA");
    const row = screen.getByTestId("stock-row-SKU-AAAA");
    expect(row).toHaveTextContent("SKU-AAAA");
  });

  it("each row displays its location", async () => {
    render(
      <MemoryRouter initialEntries={["/location/LOC-WEST"]}>
        <StockByLocationPage />
      </MemoryRouter>
    );
    await screen.findByTestId("stock-row-SKU-AAAA");
    const row = screen.getByTestId("stock-row-SKU-AAAA");
    expect(row).toHaveTextContent("LOC-WEST");
  });

  it("each row displays its quantity", async () => {
    render(
      <MemoryRouter initialEntries={["/location/LOC-WEST"]}>
        <StockByLocationPage />
      </MemoryRouter>
    );
    await screen.findByTestId("stock-row-SKU-AAAA");
    const row = screen.getByTestId("stock-row-SKU-AAAA");
    expect(row).toHaveTextContent("12");
  });
});

describe("StockByLocationPage - T21: quantity cells carry right-align seam", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(SAMPLE_RECORDS);
  });

  it("each quantity cell has the data-testid qty-cell-<sku> seam", async () => {
    render(
      <MemoryRouter initialEntries={["/location/LOC-WEST"]}>
        <StockByLocationPage />
      </MemoryRouter>
    );
    // The seam is the stable contract; we do NOT assert an inline style or raw CSS.
    expect(await screen.findByTestId("qty-cell-SKU-AAAA")).toBeInTheDocument();
    expect(screen.getByTestId("qty-cell-SKU-BBBB")).toBeInTheDocument();
  });

  it("the quantity cell carries the qty-right class (design-guide right-align contract)", async () => {
    render(
      <MemoryRouter initialEntries={["/location/LOC-WEST"]}>
        <StockByLocationPage />
      </MemoryRouter>
    );
    const cell = await screen.findByTestId("qty-cell-SKU-AAAA");
    // Class is the design-guide token; we never assert on inline `style=` or raw CSS hex.
    expect(cell).toHaveClass("qty-right");
  });
});

describe("StockByLocationPage - T23: empty collection shows empty-state seam", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue([]);
  });

  it("renders the empty-state element when the collection is empty", async () => {
    render(
      <MemoryRouter initialEntries={["/location/LOC-EMPTY"]}>
        <StockByLocationPage />
      </MemoryRouter>
    );
    expect(await screen.findByTestId("empty-state")).toBeInTheDocument();
  });

  it("empty-state shows the explicit 'No stock at this location' message", async () => {
    render(
      <MemoryRouter initialEntries={["/location/LOC-EMPTY"]}>
        <StockByLocationPage />
      </MemoryRouter>
    );
    const el = await screen.findByTestId("empty-state");
    expect(el).toHaveTextContent("No stock at this location");
  });

  it("does NOT render the stock-table when the collection is empty", async () => {
    render(
      <MemoryRouter initialEntries={["/location/LOC-EMPTY"]}>
        <StockByLocationPage />
      </MemoryRouter>
    );
    // Wait for the empty state to appear so the async branch has resolved.
    await screen.findByTestId("empty-state");
    expect(screen.queryByTestId("stock-table")).not.toBeInTheDocument();
  });
});
