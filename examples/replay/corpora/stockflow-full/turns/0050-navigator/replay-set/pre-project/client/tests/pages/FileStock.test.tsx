/**
 * Vitest + Testing Library component tests for the FileStockPage.
 *
 * T7  – renders data-testid="sku-input"
 * T8  – renders data-testid="location-input"
 * T9  – renders data-testid="quantity-input"
 * T10 – renders data-testid="file-stock-submit" submit control
 * T17 – renders data-testid="inventory-code-input"
 *
 * All tests navigate <App> to /file-stock (via MemoryRouter) so the route
 * wiring in App.tsx is also exercised. The page does not exist yet → RED.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { App } from "../../src/App";

function renderAtFileStock() {
  render(
    <MemoryRouter initialEntries={["/file-stock"]}>
      <App />
    </MemoryRouter>
  );
}

describe("FileStockPage — form inputs", () => {
  // T7
  it("renders a sku-input element", () => {
    renderAtFileStock();
    expect(screen.getByTestId("sku-input")).toBeInTheDocument();
  });

  // T8
  it("renders a location-input element", () => {
    renderAtFileStock();
    expect(screen.getByTestId("location-input")).toBeInTheDocument();
  });

  // T9
  it("renders a quantity-input element", () => {
    renderAtFileStock();
    expect(screen.getByTestId("quantity-input")).toBeInTheDocument();
  });

  // T10
  it("renders a file-stock-submit submit control", () => {
    renderAtFileStock();
    expect(screen.getByTestId("file-stock-submit")).toBeInTheDocument();
  });

  // T17
  it("renders an inventory-code-input element", () => {
    renderAtFileStock();
    expect(screen.getByTestId("inventory-code-input")).toBeInTheDocument();
  });
});
