/**
 * Vitest + Testing Library component tests for StockListPage
 * (S3-expose-batch-serial-in-stock-ui).
 *
 * T42 – AC2: navigating to /stock renders the list view with each record
 *            showing a batch_number field carrying the stock-table design-guide class
 * T43 – AC2: same for serial_number
 * T44 – AC2: batch_number and serial_number appear as separate fields per row
 * T52 – AC3: stock records with NULL batch/serial render an element with class
 *            'empty-state' per affected row (no crash, no broken layout)
 * T57 – AC4: no element displaying the combined tracking code (inventory_code)
 *            appears in the stock-table
 *
 * Strategy: stub global fetch so the API call resolves to controlled data;
 * render <App> in MemoryRouter at '/stock' to exercise route wiring.
 * The StockListPage component and /stock route do not yet exist → RED.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "../../src/App";

// ---------------------------------------------------------------------------
// Types + constants
// ---------------------------------------------------------------------------

type StockListItem = {
  id: number;
  sku: string;
  location: string;
  quantity: number;
  batch_number: string | null;
  serial_number: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAtStockList(): HTMLElement {
  const { container } = render(
    <MemoryRouter initialEntries={["/stock"]}>
      <App />
    </MemoryRouter>
  );
  return container;
}

function stubStockListFetch(items: StockListItem[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      // Match the list endpoint exactly (not /api/stock/detail/...).
      if (typeof url === "string" && /\/api\/stock$/.test(url)) {
        return Promise.resolve({ ok: true, json: async () => items });
      }
      // Fallback for any other fetch (health, etc.).
      return Promise.resolve({ ok: true, json: async () => {} });
    })
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const POPULATED_ITEMS: StockListItem[] = [
  {
    id: 1,
    sku: "SKU-LIST-A",
    location: "LOC-LIST-001",
    quantity: 10,
    batch_number: "BATCH-001",
    serial_number: "SERIAL-001",
  },
  {
    id: 2,
    sku: "SKU-LIST-B",
    location: "LOC-LIST-002",
    quantity: 20,
    batch_number: "BATCH-002",
    serial_number: "SERIAL-002",
  },
];

const NULL_BATCH_SERIAL_ITEMS: StockListItem[] = [
  {
    id: 3,
    sku: "SKU-LIST-C",
    location: "LOC-LIST-003",
    quantity: 5,
    batch_number: null,
    serial_number: null,
  },
];

// ---------------------------------------------------------------------------
// AC2 — batch_number cell with stock-table class (T42)
// ---------------------------------------------------------------------------

describe("StockListPage — batch_number with stock-table class (AC2, T42)", () => {
  beforeEach(() => {
    stubStockListFetch(POPULATED_ITEMS);
  });

  // T42
  it("renders each record with a batch_number field carrying the stock-table design-guide class", async () => {
    renderAtStockList();
    // Route /stock must be wired in App.tsx — times out → RED if missing.
    const table = await screen.findByTestId("stock-list-table");
    expect(table.classList.contains("stock-table")).toBe(true);
    for (const item of POPULATED_ITEMS) {
      const batchCell = within(table).getByTestId(`stock-list-batch-${item.id}`);
      expect(batchCell).toBeInTheDocument();
      // The cell must carry a class from the stock-table vocabulary.
      expect(
        Array.from(batchCell.classList).some((c) => c.startsWith("stock-table"))
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// AC2 — serial_number cell with stock-table class (T43)
// ---------------------------------------------------------------------------

describe("StockListPage — serial_number with stock-table class (AC2, T43)", () => {
  beforeEach(() => {
    stubStockListFetch(POPULATED_ITEMS);
  });

  // T43
  it("renders each record with a serial_number field carrying the stock-table design-guide class", async () => {
    renderAtStockList();
    const table = await screen.findByTestId("stock-list-table");
    expect(table.classList.contains("stock-table")).toBe(true);
    for (const item of POPULATED_ITEMS) {
      const serialCell = within(table).getByTestId(`stock-list-serial-${item.id}`);
      expect(serialCell).toBeInTheDocument();
      expect(
        Array.from(serialCell.classList).some((c) => c.startsWith("stock-table"))
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// AC2 — batch and serial as separate fields per row (T44)
// ---------------------------------------------------------------------------

describe("StockListPage — batch and serial as separate fields per row (AC2, T44)", () => {
  beforeEach(() => {
    stubStockListFetch(POPULATED_ITEMS);
  });

  // T44
  it("batch_number and serial_number appear as separate fields per row in the list view", async () => {
    renderAtStockList();
    const table = await screen.findByTestId("stock-list-table");
    for (const item of POPULATED_ITEMS) {
      const batchCell = within(table).getByTestId(`stock-list-batch-${item.id}`);
      const serialCell = within(table).getByTestId(`stock-list-serial-${item.id}`);
      // The two cells must be distinct DOM nodes.
      expect(batchCell.isSameNode(serialCell)).toBe(false);
      // Each cell shows the correct value.
      expect(batchCell).toHaveTextContent(item.batch_number!);
      expect(serialCell).toHaveTextContent(item.serial_number!);
    }
  });
});

// ---------------------------------------------------------------------------
// AC3 — NULL batch/serial → empty-state per row (T52)
// ---------------------------------------------------------------------------

describe("StockListPage — NULL batch/serial renders empty-state per row (AC3, T52)", () => {
  beforeEach(() => {
    stubStockListFetch(NULL_BATCH_SERIAL_ITEMS);
  });

  // T52
  it("renders an element with class 'empty-state' per row when batch_number and serial_number are null", async () => {
    renderAtStockList();
    const table = await screen.findByTestId("stock-list-table");
    for (const item of NULL_BATCH_SERIAL_ITEMS) {
      const row = within(table).getByTestId(`stock-list-row-${item.id}`);
      // Each row with null tracking fields must contain an empty-state element.
      const emptyState = row.querySelector(".empty-state");
      expect(emptyState).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// AC4 — no inventory_code in the stock-table (T57)
// ---------------------------------------------------------------------------

describe("StockListPage — no inventory_code displayed (AC4, T57)", () => {
  beforeEach(() => {
    stubStockListFetch(POPULATED_ITEMS);
  });

  // T57
  it("finds no element displaying the combined tracking code (inventory_code) in the stock-table", async () => {
    renderAtStockList();
    // Table must render — times out → RED if route missing.
    const table = await screen.findByTestId("stock-list-table");
    // No element inside the table should reference inventory_code.
    expect(table.querySelector('[data-testid*="inventory-code"]')).toBeNull();
    expect(table.querySelector('[data-testid*="inventory_code"]')).toBeNull();
  });
});
