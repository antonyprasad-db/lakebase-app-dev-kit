/**
 * T20 - the stock view renders batch and serial as two distinct, separately
 *       labelled fields (each with its own data-testid seam) where the
 *       combined tracking code used to be shown.
 * T22 - given a stock record whose batch_number is populated, the stock view's
 *       batch field displays that record's exact batch value unchanged.
 * T23 - given a stock record whose serial_number is populated, the stock view's
 *       serial field displays that record's exact serial value unchanged.
 * T24 - the opaque combined tracking code is no longer rendered anywhere on the
 *       stock view (negative-presence: no combined-code element in the rendered
 *       component).
 * T25 - given a stock record whose batch or serial is NULL, that empty field
 *       renders an explicit 'none yet' indicator rather than a blank or absent
 *       region.
 *
 * Vitest + Testing Library component tests.
 * No server required; the api layer is stubbed.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StockViewPage } from "../../src/pages/StockViewPage";

vi.mock("../../src/api/stock", () => ({
  fetchStockRecord: vi.fn(),
}));

import { fetchStockRecord } from "../../src/api/stock";
const mockFetch = fetchStockRecord as ReturnType<typeof vi.fn>;

const FULL_RECORD = {
  sku: "SKU-SPLIT-001",
  location: "LOC-A",
  quantity: 10,
  batch_number: "BATCH-XYZ123",
  serial_number: "SN-789ABC",
};

function renderPage(sku = "SKU-SPLIT-001", location = "LOC-A") {
  return render(
    <MemoryRouter initialEntries={[`/stock/${sku}/${location}`]}>
      <StockViewPage />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// T20: batch and serial render as two distinct, separately labelled fields
// ---------------------------------------------------------------------------

describe("StockViewPage - T20: split batch and serial fields present", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(FULL_RECORD);
  });

  it("renders a distinct batch-number field with data-testid stock-batch-number", async () => {
    renderPage();
    expect(await screen.findByTestId("stock-batch-number")).toBeInTheDocument();
  });

  it("renders a distinct serial-number field with data-testid stock-serial-number", async () => {
    renderPage();
    expect(await screen.findByTestId("stock-serial-number")).toBeInTheDocument();
  });

  it("batch and serial fields are separate DOM nodes, not the same element", async () => {
    renderPage();
    const batchEl = await screen.findByTestId("stock-batch-number");
    const serialEl = screen.getByTestId("stock-serial-number");
    expect(batchEl).not.toBe(serialEl);
  });
});

// ---------------------------------------------------------------------------
// T22: batch field displays the exact batch value unchanged
// ---------------------------------------------------------------------------

describe("StockViewPage - T22: batch field shows exact batch value", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(FULL_RECORD);
  });

  it("stock-batch-number shows the record's exact batch_number value", async () => {
    renderPage();
    const el = await screen.findByTestId("stock-batch-number");
    expect(el).toHaveTextContent("BATCH-XYZ123");
  });
});

// ---------------------------------------------------------------------------
// T23: serial field displays the exact serial value unchanged
// ---------------------------------------------------------------------------

describe("StockViewPage - T23: serial field shows exact serial value", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(FULL_RECORD);
  });

  it("stock-serial-number shows the record's exact serial_number value", async () => {
    renderPage();
    const el = await screen.findByTestId("stock-serial-number");
    expect(el).toHaveTextContent("SN-789ABC");
  });
});

// ---------------------------------------------------------------------------
// T24: combined tracking code (inventory_code) not rendered anywhere
// ---------------------------------------------------------------------------

describe("StockViewPage - T24: combined tracking code not rendered", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(FULL_RECORD);
  });

  it("does NOT render an element with data-testid stock-inventory-code", async () => {
    renderPage();
    // Wait for the loaded state before asserting absence.
    await screen.findByTestId("stock-batch-number");
    expect(screen.queryByTestId("stock-inventory-code")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T25: NULL batch or serial renders explicit 'none yet' indicator, not blank
// ---------------------------------------------------------------------------

describe("StockViewPage - T25: NULL field renders explicit none-yet indicator", () => {
  it("null batch_number renders 'none yet' in stock-batch-number, never blank", async () => {
    mockFetch.mockResolvedValue({ ...FULL_RECORD, batch_number: null });
    renderPage();
    const el = await screen.findByTestId("stock-batch-number");
    expect(el).toHaveTextContent("none yet");
    expect(el.textContent).not.toBe("");
  });

  it("null serial_number renders 'none yet' in stock-serial-number, never blank", async () => {
    mockFetch.mockResolvedValue({ ...FULL_RECORD, serial_number: null });
    renderPage();
    const el = await screen.findByTestId("stock-serial-number");
    expect(el).toHaveTextContent("none yet");
    expect(el.textContent).not.toBe("");
  });
});
