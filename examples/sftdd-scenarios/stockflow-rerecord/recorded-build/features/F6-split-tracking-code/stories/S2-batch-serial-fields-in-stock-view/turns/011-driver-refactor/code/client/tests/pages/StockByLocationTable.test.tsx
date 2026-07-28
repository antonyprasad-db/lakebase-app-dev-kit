/**
 * Client component tests for S2-stock-by-location-table.
 *
 * T14 (AC1): the StockByLocationTable renders exactly one row per stock record
 *            and each row exposes the record's SKU, location, and quantity via
 *            their data-testid seams.
 *
 * T15 (AC2): the quantity cell carries the right-align design-guide class /
 *            data-testid seam ("quantity-cell") -- the stable contract, not an
 *            inline style attribute.
 *
 * T17 (AC3): when the stock collection is empty, the component renders an
 *            explicit "No stock at this location" message via data-testid="empty-state".
 *
 * All three import StockByLocationTable which does not exist yet -- these go RED
 * until the Driver creates the component.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

// The component does not exist yet -- import fails = RED.
import { StockByLocationTable } from "../../src/pages/StockByLocationTable";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const STOCK_RECORDS = [
  { sku: "SKU-ALPHA", location: "BIN-A1", quantity: 10 },
  { sku: "SKU-BETA", location: "BIN-B2", quantity: 25 },
  { sku: "SKU-GAMMA", location: "BIN-C3", quantity: 7 },
];

// ---------------------------------------------------------------------------
// T14 - one row per record; each row has sku, location, and quantity seams
// ---------------------------------------------------------------------------

describe("StockByLocationTable", () => {
  it("T14: renders exactly one row per record with sku, location, and quantity data-testid seams", () => {
    render(<StockByLocationTable records={STOCK_RECORDS} />);

    const table = screen.getByTestId("stock-table");
    expect(table).toBeInTheDocument();

    const rows = screen.getAllByTestId("sku-row");
    expect(rows).toHaveLength(STOCK_RECORDS.length);

    STOCK_RECORDS.forEach((record) => {
      expect(
        screen.getByTestId(`sku-cell-${record.sku}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`sku-cell-${record.sku}`)
      ).toHaveTextContent(record.sku);

      expect(
        screen.getByTestId(`location-cell-${record.sku}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`location-cell-${record.sku}`)
      ).toHaveTextContent(record.location);

      expect(
        screen.getByTestId(`quantity-cell-${record.sku}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`quantity-cell-${record.sku}`)
      ).toHaveTextContent(String(record.quantity));
    });
  });

  // ---------------------------------------------------------------------------
  // T15 - quantity cell carries design-guide right-align class, not inline style
  // ---------------------------------------------------------------------------

  it("T15: quantity cell has the right-align class from the design guide (not an inline style attribute)", () => {
    render(<StockByLocationTable records={[STOCK_RECORDS[0]]} />);

    const quantityCell = screen.getByTestId(
      `quantity-cell-${STOCK_RECORDS[0].sku}`
    );
    expect(quantityCell).toBeInTheDocument();

    // The cell must carry the design-guide CSS class for right-alignment.
    // Asserting the stable class contract, never an inline style= attribute.
    expect(quantityCell.className).toMatch(/text-right|qty-right|quantity-right/);
    // Explicitly forbid inline style text-align (the fragile implementation).
    expect(quantityCell).not.toHaveStyle({ textAlign: "right" });
  });

  // ---------------------------------------------------------------------------
  // T17 - empty collection renders "No stock at this location" via empty-state
  // ---------------------------------------------------------------------------

  it("T17: renders the explicit empty-state message when the stock collection is empty", () => {
    render(<StockByLocationTable records={[]} />);

    const emptyState = screen.getByTestId("empty-state");
    expect(emptyState).toBeInTheDocument();
    expect(emptyState).toHaveTextContent(/no stock at this location/i);

    // No table rows should appear when there is no data.
    expect(screen.queryByTestId("sku-row")).not.toBeInTheDocument();
  });
});
