/**
 * Client component tests for F6-S2-batch-serial-fields-in-stock-view.
 *
 * T10 (AC1-distinct-labelled-fields): for a stock position with both batch and
 *   serial populated, the stock view renders a batch entry and a serial entry as
 *   two separately labelled fields, each showing its own value via its
 *   data-testid seam.
 *
 * T12 (AC2-empty-field-shows-none-yet): for a stock position whose batch or
 *   serial is null, the stock view renders an explicit "none yet" indicator in
 *   that field rather than leaving it blank.
 *
 * T14 (AC3-combined-code-no-longer-shown): the stock view renders no combined
 *   tracking-code element anywhere; the batch and serial entries are the only
 *   surface for that identity.
 *
 * All three import StockView which does not exist yet -- these go RED until the
 * Driver creates the component.
 *
 * Design guide constraints applied:
 *   - data-testid seams are the stable test contract (never inline style, raw CSS,
 *     or implementation detail).
 *   - "none yet" is the explicit empty-state label (design guide: empty states
 *     teach, not scold; every state is named explicitly).
 *   - No combined tracking_code / inventory_code element may appear (AC3).
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

// The component does not exist yet -- this import will fail (RED).
import { StockView } from "../../src/pages/StockView";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const POPULATED_ENTRY = {
  sku: "SKU-WIDGET-99",
  location: "BIN-A1",
  quantity: 10,
  batch_number: "BATCH-0042",
  serial_number: "SER-0099",
};

const NULL_BATCH_ENTRY = {
  sku: "SKU-NOPARSE-01",
  location: "BIN-B2",
  quantity: 5,
  batch_number: null,
  serial_number: null,
};

const NULL_SERIAL_ONLY_ENTRY = {
  sku: "SKU-PARTIAL-01",
  location: "BIN-C3",
  quantity: 3,
  batch_number: "BATCH-PARTIAL",
  serial_number: null,
};

// ---------------------------------------------------------------------------
// T10 - AC1: populated batch and serial render as two separately labelled fields
// ---------------------------------------------------------------------------

describe("StockView", () => {
  it("T10: renders batch and serial as two separately labelled fields each showing its own value", () => {
    render(<StockView entry={POPULATED_ENTRY} />);

    // The batch field must exist with its own data-testid and show the batch value.
    const batchField = screen.getByTestId("batch-number-field");
    expect(batchField).toBeInTheDocument();
    expect(batchField).toHaveTextContent(POPULATED_ENTRY.batch_number as string);

    // The serial field must exist with its own data-testid and show the serial value.
    const serialField = screen.getByTestId("serial-number-field");
    expect(serialField).toBeInTheDocument();
    expect(serialField).toHaveTextContent(POPULATED_ENTRY.serial_number as string);

    // The two fields are distinct: different testids, different values.
    expect(batchField).not.toBe(serialField);

    // Each field must carry a visible label so the operator can distinguish them
    // (design guide: "visible, persistent <label>"; not placeholder-only).
    // We assert labels exist by checking for accessible text near the fields.
    // The label text must include the concept "batch" and "serial" respectively.
    expect(screen.getByTestId("batch-number-label")).toBeInTheDocument();
    expect(screen.getByTestId("serial-number-label")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // T12 - AC2: null batch or serial renders an explicit "none yet" indicator
  // ---------------------------------------------------------------------------

  it("T12: renders an explicit 'none yet' indicator for a null batch or serial field", () => {
    render(<StockView entry={NULL_BATCH_ENTRY} />);

    // batch_number is null: must show "none yet", not a blank region or the string "null".
    const batchField = screen.getByTestId("batch-number-field");
    expect(batchField).toBeInTheDocument();
    expect(batchField).toHaveTextContent(/none yet/i);
    // Must not render a blank region (empty text content would be a silent failure).
    expect(batchField.textContent?.trim()).not.toBe("");
    // Must not literally render "null".
    expect(batchField).not.toHaveTextContent(/^null$/i);

    // serial_number is also null for this entry.
    const serialField = screen.getByTestId("serial-number-field");
    expect(serialField).toBeInTheDocument();
    expect(serialField).toHaveTextContent(/none yet/i);
    expect(serialField.textContent?.trim()).not.toBe("");
    expect(serialField).not.toHaveTextContent(/^null$/i);
  });

  it("T12 (partial): renders 'none yet' for a null serial when batch is present", () => {
    render(<StockView entry={NULL_SERIAL_ONLY_ENTRY} />);

    // batch is populated -- must show its value.
    const batchField = screen.getByTestId("batch-number-field");
    expect(batchField).toHaveTextContent(NULL_SERIAL_ONLY_ENTRY.batch_number as string);

    // serial is null -- must show "none yet".
    const serialField = screen.getByTestId("serial-number-field");
    expect(serialField).toHaveTextContent(/none yet/i);
  });

  // ---------------------------------------------------------------------------
  // T14 - AC3: no combined tracking-code element anywhere in the rendered output
  // ---------------------------------------------------------------------------

  it("T14: renders no combined tracking-code element; batch and serial are the only identity surface", () => {
    render(<StockView entry={POPULATED_ENTRY} />);

    // The retired combined inventory_code / tracking_code element must not appear.
    expect(screen.queryByTestId("inventory-code-field")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tracking-code-field")).not.toBeInTheDocument();
    expect(screen.queryByTestId("combined-tracking-code")).not.toBeInTheDocument();

    // Confirm the two S2 fields ARE present so the assertion above is a genuine
    // absence check, not a vacuous pass because the component rendered nothing.
    expect(screen.getByTestId("batch-number-field")).toBeInTheDocument();
    expect(screen.getByTestId("serial-number-field")).toBeInTheDocument();
  });

  it("T14 (null entry): no combined tracking-code element even when batch and serial are null", () => {
    render(<StockView entry={NULL_BATCH_ENTRY} />);

    expect(screen.queryByTestId("inventory-code-field")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tracking-code-field")).not.toBeInTheDocument();
    expect(screen.queryByTestId("combined-tracking-code")).not.toBeInTheDocument();

    // The two S2 fields still render (showing "none yet").
    expect(screen.getByTestId("batch-number-field")).toBeInTheDocument();
    expect(screen.getByTestId("serial-number-field")).toBeInTheDocument();
  });
});
