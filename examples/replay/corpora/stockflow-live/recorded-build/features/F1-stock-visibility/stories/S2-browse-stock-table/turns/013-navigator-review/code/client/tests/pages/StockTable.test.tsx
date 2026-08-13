import { render, screen } from "@testing-library/react";
import { StockTable } from "../../src/pages/StockTable";

// AC2-quantities-right-aligned: presentation-only. The quantity column must
// carry the design-guide right-align seam (a stable data-testid PLUS the
// class name that right-aligns it), not an inline style (design-guide.md,
// "Stock table": numeric quantity column right-aligned, font_mono, tabular
// figures). No server involved; rows are supplied as props.
describe("StockTable quantity column", () => {
  it("right-aligns every quantity cell using the design-guide seam", () => {
    render(
      <StockTable
        rows={[
          { sku: "SKU-100", location: "A1", quantity: 12 },
          { sku: "SKU-200", location: "B2", quantity: 7 },
        ]}
      />
    );

    const quantityCells = screen.getAllByTestId("stock-quantity-cell");
    expect(quantityCells).toHaveLength(2);
    for (const cell of quantityCells) {
      expect(cell).toHaveClass("stock-table__quantity--right");
    }
  });
});
