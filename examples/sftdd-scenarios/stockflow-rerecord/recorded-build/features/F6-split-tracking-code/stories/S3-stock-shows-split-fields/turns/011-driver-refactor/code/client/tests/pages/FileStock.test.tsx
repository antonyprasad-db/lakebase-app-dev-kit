/**
 * T16 - File-stock form renders its data-testid seams (client component).
 *
 * Asserts that the FileStock page renders:
 *   - field-sku        (SKU input)
 *   - field-location   (location input)
 *   - field-quantity   (quantity input)
 *   - field-batch-number   (batch_number input)
 *   - field-serial-number  (serial_number input)
 *   - btn-save         (submit control)
 *
 * No server required; this is a Vitest + Testing Library component test.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { FileStockPage } from "../../src/pages/FileStockPage";

describe("FileStockPage - form seams (T16)", () => {
  function renderPage() {
    render(
      <MemoryRouter>
        <FileStockPage />
      </MemoryRouter>
    );
  }

  it("renders the sku field with its data-testid", () => {
    renderPage();
    expect(screen.getByTestId("field-sku")).toBeInTheDocument();
  });

  it("renders the location field with its data-testid", () => {
    renderPage();
    expect(screen.getByTestId("field-location")).toBeInTheDocument();
  });

  it("renders the quantity field with its data-testid", () => {
    renderPage();
    expect(screen.getByTestId("field-quantity")).toBeInTheDocument();
  });

  it("renders the batch_number field with its data-testid", () => {
    renderPage();
    expect(screen.getByTestId("field-batch-number")).toBeInTheDocument();
  });

  it("renders the serial_number field with its data-testid", () => {
    renderPage();
    expect(screen.getByTestId("field-serial-number")).toBeInTheDocument();
  });

  it("renders the submit control with data-testid btn-save", () => {
    renderPage();
    expect(screen.getByTestId("btn-save")).toBeInTheDocument();
  });
});
