/**
 * T17 - Stock-retrieval view renders quantity and split tracking fields (client component).
 *
 * Asserts that the RetrieveStock page renders:
 *   - stock-quantity       (displays the read-back quantity)
 *   - stock-batch-number   (displays the read-back batch_number)
 *   - stock-serial-number  (displays the read-back serial_number)
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
    batch_number: "BATCH-001",
    serial_number: "SERIAL-XYZ",
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

  it("renders the batch_number seam with data-testid stock-batch-number", async () => {
    render(
      <MemoryRouter initialEntries={["/stock/SKU-TEST/LOC-TEST"]}>
        <RetrieveStockPage />
      </MemoryRouter>
    );
    expect(await screen.findByTestId("stock-batch-number")).toBeInTheDocument();
  });

  it("renders the serial_number seam with data-testid stock-serial-number", async () => {
    render(
      <MemoryRouter initialEntries={["/stock/SKU-TEST/LOC-TEST"]}>
        <RetrieveStockPage />
      </MemoryRouter>
    );
    expect(await screen.findByTestId("stock-serial-number")).toBeInTheDocument();
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

  it("displays the fetched batch_number in the stock-batch-number element", async () => {
    render(
      <MemoryRouter initialEntries={["/stock/SKU-TEST/LOC-TEST"]}>
        <RetrieveStockPage />
      </MemoryRouter>
    );
    const el = await screen.findByTestId("stock-batch-number");
    expect(el).toHaveTextContent("BATCH-001");
  });

  it("displays the fetched serial_number in the stock-serial-number element", async () => {
    render(
      <MemoryRouter initialEntries={["/stock/SKU-TEST/LOC-TEST"]}>
        <RetrieveStockPage />
      </MemoryRouter>
    );
    const el = await screen.findByTestId("stock-serial-number");
    expect(el).toHaveTextContent("SERIAL-XYZ");
  });
});
