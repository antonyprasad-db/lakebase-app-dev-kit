/**
 * Vitest + Testing Library component tests for StockDetailPage
 * (S3-expose-batch-serial-in-stock-ui).
 *
 * T37 – AC1: navigating to /stock/:id renders the detail view with
 *            batch_number in a labeled field inside a .card container
 * T38 – AC1: same for serial_number
 * T39 – AC1: batch_number and serial_number are two distinct separately
 *            labeled fields (not merged into one element)
 * T49 – AC3: when batch_number is NULL the detail view renders an element
 *            with class 'empty-state' (no crash, no blank layout)
 * T50 – AC3: same when serial_number is NULL
 * T51 – AC3: when both are NULL the remaining record fields (sku, quantity)
 *            still display correctly
 * T56 – AC4: no element carrying the combined tracking code (inventory_code)
 *            appears in the card
 *
 * Strategy: stub global fetch so the API call resolves to controlled data;
 * render <App> in MemoryRouter at '/stock/:id' to exercise route wiring.
 * The StockDetailPage component and /stock/:id route do not yet exist → RED.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "../../src/App";

// ---------------------------------------------------------------------------
// Types + constants
// ---------------------------------------------------------------------------

const STOCK_ID = 42;

type StockDetailRecord = {
  id: number;
  sku: string;
  location: string;
  quantity: number;
  batch_number: string | null;
  serial_number: string | null;
  par_level: number | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAtStockDetail(id = STOCK_ID): HTMLElement {
  const { container } = render(
    <MemoryRouter initialEntries={[`/stock/${id}`]}>
      <App />
    </MemoryRouter>
  );
  return container;
}

function stubDetailFetch(record: StockDetailRecord) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes(`/api/stock/detail/${record.id}`)) {
        return Promise.resolve({ ok: true, json: async () => record });
      }
      // Fallback for any other fetch (list, health, etc.).
      return Promise.resolve({ ok: true, json: async () => [] });
    })
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const POPULATED_RECORD: StockDetailRecord = {
  id: STOCK_ID,
  sku: "SKU-DETAIL-A",
  location: "LOC-DETAIL-001",
  quantity: 8,
  batch_number: "BATCH-001",
  serial_number: "SERIAL-001",
  par_level: null,
};

const NULL_BATCH_RECORD: StockDetailRecord = {
  id: STOCK_ID,
  sku: "SKU-DETAIL-B",
  location: "LOC-DETAIL-002",
  quantity: 4,
  batch_number: null,
  serial_number: "SERIAL-002",
  par_level: null,
};

const NULL_SERIAL_RECORD: StockDetailRecord = {
  id: STOCK_ID,
  sku: "SKU-DETAIL-C",
  location: "LOC-DETAIL-003",
  quantity: 2,
  batch_number: "BATCH-003",
  serial_number: null,
  par_level: null,
};

const NULL_BOTH_RECORD: StockDetailRecord = {
  id: STOCK_ID,
  sku: "SKU-DETAIL-D",
  location: "LOC-DETAIL-004",
  quantity: 6,
  batch_number: null,
  serial_number: null,
  par_level: null,
};

// ---------------------------------------------------------------------------
// AC1 — batch_number labeled field inside a card (T37)
// ---------------------------------------------------------------------------

describe("StockDetailPage — batch_number in card (AC1, T37)", () => {
  beforeEach(() => {
    stubDetailFetch(POPULATED_RECORD);
  });

  // T37
  it("renders batch_number in a labeled field inside a card element at /stock/:id", async () => {
    renderAtStockDetail();
    // Route /stock/:id must be wired in App.tsx — times out → RED if missing.
    await waitFor(() => {
      expect(screen.getByTestId("stock-detail-card")).toBeInTheDocument();
    });
    const card = screen.getByTestId("stock-detail-card");
    // The card container must carry the design-guide 'card' class.
    expect(card.classList.contains("card")).toBe(true);
    // Batch number labeled field must live inside the card.
    const batchField = within(card).getByTestId("stock-detail-batch-number");
    expect(batchField).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC1 — serial_number labeled field inside a card (T38)
// ---------------------------------------------------------------------------

describe("StockDetailPage — serial_number in card (AC1, T38)", () => {
  beforeEach(() => {
    stubDetailFetch(POPULATED_RECORD);
  });

  // T38
  it("renders serial_number in a labeled field inside a card element at /stock/:id", async () => {
    renderAtStockDetail();
    await waitFor(() => {
      expect(screen.getByTestId("stock-detail-card")).toBeInTheDocument();
    });
    const card = screen.getByTestId("stock-detail-card");
    expect(card.classList.contains("card")).toBe(true);
    const serialField = within(card).getByTestId("stock-detail-serial-number");
    expect(serialField).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC1 — two distinct separately labeled fields (T39)
// ---------------------------------------------------------------------------

describe("StockDetailPage — distinct batch and serial fields (AC1, T39)", () => {
  beforeEach(() => {
    stubDetailFetch(POPULATED_RECORD);
  });

  // T39
  it("batch_number and serial_number are two distinct separately labeled fields", async () => {
    renderAtStockDetail();
    await waitFor(() => {
      const batchField = screen.getByTestId("stock-detail-batch-number");
      const serialField = screen.getByTestId("stock-detail-serial-number");
      expect(batchField).toBeInTheDocument();
      expect(serialField).toBeInTheDocument();
      // The two fields must be different DOM nodes — not merged into one element.
      expect(batchField.isSameNode(serialField)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// AC3 — NULL batch_number → empty-state (T49)
// ---------------------------------------------------------------------------

describe("StockDetailPage — NULL batch_number renders empty-state (AC3, T49)", () => {
  beforeEach(() => {
    stubDetailFetch(NULL_BATCH_RECORD);
  });

  // T49
  it("renders an element with class 'empty-state' when batch_number is null", async () => {
    const container = renderAtStockDetail();
    // Page must render without error — times out → RED if route missing.
    await waitFor(() => {
      expect(screen.getByTestId("stock-detail-page")).toBeInTheDocument();
    });
    // At least one empty-state element must be visible for the null batch.
    const emptyStates = container.querySelectorAll(".empty-state");
    expect(emptyStates.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// AC3 — NULL serial_number → empty-state (T50)
// ---------------------------------------------------------------------------

describe("StockDetailPage — NULL serial_number renders empty-state (AC3, T50)", () => {
  beforeEach(() => {
    stubDetailFetch(NULL_SERIAL_RECORD);
  });

  // T50
  it("renders an element with class 'empty-state' when serial_number is null", async () => {
    const container = renderAtStockDetail();
    await waitFor(() => {
      expect(screen.getByTestId("stock-detail-page")).toBeInTheDocument();
    });
    const emptyStates = container.querySelectorAll(".empty-state");
    expect(emptyStates.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// AC3 — NULL batch + serial → remaining fields intact (T51)
// ---------------------------------------------------------------------------

describe("StockDetailPage — NULL batch and serial leaves other fields intact (AC3, T51)", () => {
  beforeEach(() => {
    stubDetailFetch(NULL_BOTH_RECORD);
  });

  // T51
  it("remaining record fields (sku, quantity) still display when both batch_number and serial_number are null", async () => {
    renderAtStockDetail();
    await waitFor(() => {
      expect(screen.getByTestId("stock-detail-page")).toBeInTheDocument();
    });
    // SKU and quantity must render correctly even with null tracking fields.
    expect(screen.getByTestId("stock-detail-sku")).toBeInTheDocument();
    expect(screen.getByTestId("stock-detail-quantity")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC4 — no inventory_code element in the card (T56)
// ---------------------------------------------------------------------------

describe("StockDetailPage — no inventory_code displayed (AC4, T56)", () => {
  beforeEach(() => {
    stubDetailFetch(POPULATED_RECORD);
  });

  // T56
  it("finds no element displaying the combined tracking code (inventory_code) in the card", async () => {
    renderAtStockDetail();
    // Page must render — times out → RED if route missing.
    await waitFor(() => {
      expect(screen.getByTestId("stock-detail-page")).toBeInTheDocument();
    });
    // No element should expose inventory_code in any form.
    expect(screen.queryByTestId("stock-detail-inventory-code")).not.toBeInTheDocument();
  });
});
