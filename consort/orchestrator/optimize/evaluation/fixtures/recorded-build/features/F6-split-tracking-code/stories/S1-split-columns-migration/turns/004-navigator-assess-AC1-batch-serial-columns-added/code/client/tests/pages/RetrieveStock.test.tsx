/**
 * T17 - Stock-retrieval view renders quantity and inventory_code seams (client component).
 *
 * Asserts that the RetrieveStock page renders:
 *   - stock-quantity       (displays the read-back quantity)
 *   - stock-inventory-code (displays the read-back inventory_code)
 *
 * The component is rendered with mock props / stub state representing a
 * fetched record; no server required.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RetrieveStockPage } from "../../src/pages/RetrieveStockPage";

// Stub the api layer so the component renders the loaded state without a server.
vi.mock("../../src/api/stock", () => ({
  fetchStockRecord: vi.fn().mockResolvedValue({
    sku: "SKU-TEST",
    location: "LOC-TEST",
    quantity: 42,
    inventory_code: "BATCH-001/SERIAL-XYZ",
  }),
}));

describe("RetrieveStockPage - read-back seams (T17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the quantity seam with data-testid stock-quantity", async () => {
    render(
      <MemoryRouter initialEntries={["/stock/SKU-TEST/LOC-TEST"]}>
        <RetrieveStockPage />
      </MemoryRouter>
    );
    // The seam must be present regardless of async loading state.
    expect(await screen.findByTestId("stock-quantity")).toBeInTheDocument();
  });

  it("renders the inventory_code seam with data-testid stock-inventory-code", async () => {
    render(
      <MemoryRouter initialEntries={["/stock/SKU-TEST/LOC-TEST"]}>
        <RetrieveStockPage />
      </MemoryRouter>
    );
    expect(await screen.findByTestId("stock-inventory-code")).toBeInTheDocument();
  });

  it("displays the fetched quantity value in the stock-quantity element", async () => {
    render(
      <MemoryRouter initialEntries={["/stock/SKU-TEST/LOC-TEST"]}>
        <RetrieveStockPage />
      </MemoryRouter>
    );
    const el = await screen.findByTestId("stock-quantity");
    expect(el).toHaveTextContent("42");
  });

  it("displays the fetched inventory_code in the stock-inventory-code element", async () => {
    render(
      <MemoryRouter initialEntries={["/stock/SKU-TEST/LOC-TEST"]}>
        <RetrieveStockPage />
      </MemoryRouter>
    );
    const el = await screen.findByTestId("stock-inventory-code");
    expect(el).toHaveTextContent("BATCH-001/SERIAL-XYZ");
  });
});
