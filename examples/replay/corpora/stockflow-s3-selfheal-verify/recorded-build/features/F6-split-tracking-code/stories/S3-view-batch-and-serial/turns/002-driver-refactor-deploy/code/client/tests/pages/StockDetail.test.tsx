import { render, screen } from "@testing-library/react";
import { StockDetail } from "../../src/pages/StockDetail";

// S3-view-batch-and-serial: the stock detail view renders a single stock
// record's batch and serial as distinct labeled fields (replacing F1's
// combined tracking code), with an explicit "not tracked" placeholder for a
// NULL segment. Presentational only: receives the record as a prop, never
// fetches (see hooks/ for that).

describe("StockDetail batch and serial fields", () => {
  // T18 (AC1-batch-shown-as-distinct-field)
  it("renders the record's populated batch value inside its own labeled field, separate from any other field", () => {
    render(
      <StockDetail
        record={{
          sku: "SKU-900",
          location: "R1",
          quantity: 5,
          batch_number: "LOT-42",
          serial_number: "SN-7",
        }}
      />
    );

    const batchField = screen.getByTestId("stock-detail-batch");
    expect(batchField).toHaveTextContent("LOT-42");
    expect(batchField).not.toBe(screen.getByTestId("stock-detail-serial"));
  });

  // T19 (AC2-serial-shown-as-distinct-field)
  it("renders the record's populated serial value as a second, distinct labeled field independent of batch", () => {
    render(
      <StockDetail
        record={{
          sku: "SKU-901",
          location: "R2",
          quantity: 3,
          batch_number: "LOT-50",
          serial_number: "SN-99",
        }}
      />
    );

    const serialField = screen.getByTestId("stock-detail-serial");
    const batchField = screen.getByTestId("stock-detail-batch");
    expect(serialField).toHaveTextContent("SN-99");
    expect(serialField).not.toBe(batchField);
    expect(batchField).not.toHaveTextContent("SN-99");
  });

  // T20 (AC3-null-field-shows-not-tracked)
  it('renders the literal placeholder "not tracked" in a NULL batch or serial field, never a blank region or a crash', () => {
    render(
      <StockDetail
        record={{
          sku: "SKU-902",
          location: "R3",
          quantity: 1,
          batch_number: null,
          serial_number: null,
        }}
      />
    );

    expect(screen.getByTestId("stock-detail-batch")).toHaveTextContent("not tracked");
    expect(screen.getByTestId("stock-detail-serial")).toHaveTextContent("not tracked");
  });

  // T21 (AC4-combined-code-no-longer-shown)
  it("no longer renders the legacy combined tracking-code field once batch and serial are rendered", () => {
    render(
      <StockDetail
        record={{
          sku: "SKU-903",
          location: "R4",
          quantity: 2,
          batch_number: "LOT-60",
          serial_number: "SN-61",
        }}
      />
    );

    expect(screen.getByTestId("stock-detail-batch")).toBeInTheDocument();
    expect(screen.getByTestId("stock-detail-serial")).toBeInTheDocument();
    expect(screen.queryByTestId("stock-detail-inventory-code")).not.toBeInTheDocument();
  });
});
