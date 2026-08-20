/**
 * Client component tests for S3-display-batch-serial-separately (F6)
 *
 * T34 – /stock list row shows data-testid="batch-number" with batch_number value
 * T35 – /stock list row shows data-testid="serial-number" with serial_number value
 * T45 – /stock list has no element referencing inventory_code
 * T46 – /stock/new form has no element referencing inventory_code
 * T38 – /stock/new form has data-testid="batch-number-input" labeled input
 * T39 – /stock/new form has data-testid="serial-number-input" labeled input
 * T42 – /stock list shows "not tracked" for null batch_number
 * T43 – /stock list shows "not tracked" for null serial_number
 *
 * RED: the /stock and /stock/new routes do not exist in App.tsx yet;
 * the StockPage and StockNewPage components are not built yet.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { App } from "../../src/App";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StockRecord = {
  sku: string;
  location: string;
  quantity: number;
  batch_number: string | null;
  serial_number: string | null;
};

function renderAt(path: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function mockStockApi(records: StockRecord[]): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => records,
  } as Response);
}

const BATCH_RECORD: StockRecord = {
  sku: "SKU-T34",
  location: "LOC-T34",
  quantity: 5,
  batch_number: "B001",
  serial_number: null,
};

const SERIAL_RECORD: StockRecord = {
  sku: "SKU-T35",
  location: "LOC-T35",
  quantity: 5,
  batch_number: null,
  serial_number: "S001",
};

const NULL_BATCH_RECORD: StockRecord = {
  sku: "SKU-T42",
  location: "LOC-T42",
  quantity: 2,
  batch_number: null,
  serial_number: "SN-T42",
};

const NULL_SERIAL_RECORD: StockRecord = {
  sku: "SKU-T43",
  location: "LOC-T43",
  quantity: 2,
  batch_number: "B-T43",
  serial_number: null,
};

// ---------------------------------------------------------------------------
// T34 – /stock list shows data-testid="batch-number" with the batch_number value
// ---------------------------------------------------------------------------

test("T34: /stock list row shows data-testid='batch-number' element with the batch_number value", async () => {
  mockStockApi([BATCH_RECORD]);

  renderAt("/stock");

  await waitFor(() => {
    const batchEl = screen.getByTestId("batch-number");
    expect(batchEl).toBeVisible();
    expect(batchEl).toHaveTextContent("B001");
  });
});

// ---------------------------------------------------------------------------
// T35 – /stock list shows data-testid="serial-number" with the serial_number value
// ---------------------------------------------------------------------------

test("T35: /stock list row shows data-testid='serial-number' element with the serial_number value", async () => {
  mockStockApi([SERIAL_RECORD]);

  renderAt("/stock");

  await waitFor(() => {
    const serialEl = screen.getByTestId("serial-number");
    expect(serialEl).toBeVisible();
    expect(serialEl).toHaveTextContent("S001");
  });
});

// ---------------------------------------------------------------------------
// T45 – /stock list has no element with text or data-testid referencing inventory_code
// ---------------------------------------------------------------------------

test("T45: /stock list view has no element referencing inventory_code", async () => {
  mockStockApi([BATCH_RECORD]);

  renderAt("/stock");

  // Wait for page to load (stock row appears)
  await waitFor(() => {
    expect(screen.getByText("SKU-T34")).toBeVisible();
  });

  // No testid containing inventory_code
  const byTestId = document.querySelector("[data-testid*='inventory_code']");
  expect(byTestId).toBeNull();

  // No visible text containing "inventory_code"
  const bodyText = document.body.textContent ?? "";
  expect(bodyText).not.toContain("inventory_code");
});

// ---------------------------------------------------------------------------
// T46 – /stock/new form has no element referencing inventory_code
// ---------------------------------------------------------------------------

test("T46: /stock/new form view has no element referencing inventory_code", async () => {
  // /stock/new does not call the API; suppress any fetch
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => [],
  } as Response);

  renderAt("/stock/new");

  // Wait for the form to appear (batch-number-input is the key seam)
  await waitFor(() => {
    expect(screen.getByTestId("batch-number-input")).toBeVisible();
  });

  const byTestId = document.querySelector("[data-testid*='inventory_code']");
  expect(byTestId).toBeNull();

  const bodyText = document.body.textContent ?? "";
  expect(bodyText).not.toContain("inventory_code");
});

// ---------------------------------------------------------------------------
// T38 – /stock/new has data-testid="batch-number-input" labeled input
// ---------------------------------------------------------------------------

test("T38: /stock/new shows a form with a data-testid='batch-number-input' labeled input field for batch_number", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => [],
  } as Response);

  renderAt("/stock/new");

  await waitFor(() => {
    const input = screen.getByTestId("batch-number-input");
    expect(input).toBeVisible();
    // Must be a form control (input or textarea)
    expect(input.tagName.toLowerCase()).toMatch(/^(input|textarea|select)$/);
  });

  // The input must have an accessible label
  expect(screen.getByLabelText(/batch.?number/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// T39 – /stock/new has data-testid="serial-number-input" labeled input
// ---------------------------------------------------------------------------

test("T39: /stock/new shows a form with a data-testid='serial-number-input' labeled input field for serial_number", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => [],
  } as Response);

  renderAt("/stock/new");

  await waitFor(() => {
    const input = screen.getByTestId("serial-number-input");
    expect(input).toBeVisible();
    expect(input.tagName.toLowerCase()).toMatch(/^(input|textarea|select)$/);
  });

  // The input must have an accessible label
  expect(screen.getByLabelText(/serial.?number/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// T42 – /stock list shows "not tracked" for null batch_number
// ---------------------------------------------------------------------------

test("T42: /stock list shows a 'not tracked' indicator in data-testid='batch-number' when batch_number is null", async () => {
  mockStockApi([NULL_BATCH_RECORD]);

  renderAt("/stock");

  await waitFor(() => {
    const batchEl = screen.getByTestId("batch-number");
    expect(batchEl).toBeVisible();
    expect(batchEl).toHaveTextContent(/not tracked/i);
  });
});

// ---------------------------------------------------------------------------
// T43 – /stock list shows "not tracked" for null serial_number
// ---------------------------------------------------------------------------

test("T43: /stock list shows a 'not tracked' indicator in data-testid='serial-number' when serial_number is null", async () => {
  mockStockApi([NULL_SERIAL_RECORD]);

  renderAt("/stock");

  await waitFor(() => {
    const serialEl = screen.getByTestId("serial-number");
    expect(serialEl).toBeVisible();
    expect(serialEl).toHaveTextContent(/not tracked/i);
  });
});
