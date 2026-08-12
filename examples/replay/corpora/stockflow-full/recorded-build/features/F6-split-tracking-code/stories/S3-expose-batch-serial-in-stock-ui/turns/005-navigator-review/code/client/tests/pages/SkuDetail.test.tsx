/**
 * Vitest + Testing Library component tests for the SkuDetailPage.
 *
 * T33 – AC1: rendering <App> in MemoryRouter at '/sku/SKU-A' shows the SKU detail page
 * T34 – AC1: when the API returns stock records for SKU-A at two locations,
 *            the detail view renders one row per location for that SKU
 * T35 – AC1: each location row carries a data-testid containing the location name
 * T36 – AC1: each location row carries a data-testid containing the quantity for that location
 * T38 – AC2: each location row carries a data-testid containing the combined tracking code
 * T40 – AC3: rendering <App> in MemoryRouter at '/sku/SKU-A' shows the par-level section element
 * T41 – AC3: when the API returns a stock record with par_level null,
 *            the detail view displays a 'not tracked' indication
 * T42 – AC3: the 'not tracked' par-level element carries a data-testid
 *
 * Strategy: stub global fetch so the API call resolves to controlled data;
 * render <App> in MemoryRouter at '/sku/SKU-A' to exercise route wiring in App.tsx.
 * The SkuDetailPage and route do not exist yet → RED.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "../../src/App";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SKU = "SKU-A";

function renderAtSkuDetail(sku = TEST_SKU) {
  render(
    <MemoryRouter initialEntries={[`/sku/${sku}`]}>
      <App />
    </MemoryRouter>
  );
}

type StockDetailRow = {
  sku: string;
  location: string;
  quantity: number;
  batch_number?: string | null;
  serial_number?: string | null;
  par_level?: number | null;
};

function stubSkuDetailFetch(rows: StockDetailRow[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes(`/api/stock/${TEST_SKU}`)) {
        return Promise.resolve({
          ok: true,
          json: async () => rows,
        });
      }
      // Fallback for any other fetch (e.g. /api/stock list, /health).
      return Promise.resolve({ ok: true, json: async () => [] });
    })
  );
}

const TWO_LOCATION_ROWS: StockDetailRow[] = [
  { sku: TEST_SKU, location: "LOC-001", quantity: 7, batch_number: "BATCH1", serial_number: "SN001", par_level: null },
  { sku: TEST_SKU, location: "LOC-002", quantity: 13, batch_number: "BATCH2", serial_number: "SN002", par_level: null },
];

const SINGLE_ROW_WITH_TRACKING: StockDetailRow[] = [
  { sku: TEST_SKU, location: "LOC-001", quantity: 4, batch_number: "TC", serial_number: "EXACT-CODE", par_level: null },
];

const SINGLE_ROW_PAR_NULL: StockDetailRow[] = [
  { sku: TEST_SKU, location: "LOC-001", quantity: 6, batch_number: null, serial_number: null, par_level: null },
];

// ---------------------------------------------------------------------------
// AC1 — page presence (T33)
// ---------------------------------------------------------------------------

describe("SkuDetailPage — route presence (AC1)", () => {
  beforeEach(() => {
    stubSkuDetailFetch(TWO_LOCATION_ROWS);
  });

  // T33
  it("rendering <App> in MemoryRouter at '/sku/SKU-A' shows the SKU detail page in the document", async () => {
    renderAtSkuDetail();
    await waitFor(() => {
      expect(screen.getByTestId("sku-detail-page")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// AC1 — location rows (T34, T35, T36)
// ---------------------------------------------------------------------------

describe("SkuDetailPage — location rows (AC1)", () => {
  beforeEach(() => {
    stubSkuDetailFetch(TWO_LOCATION_ROWS);
  });

  // T34
  it("renders one row per location when the API returns two location records for the SKU", async () => {
    renderAtSkuDetail();
    await waitFor(() => {
      const rows = screen.getAllByTestId(/^sku-detail-row-/);
      expect(rows).toHaveLength(TWO_LOCATION_ROWS.length);
    });
  });

  // T35
  it("each location row carries a data-testid containing the location name returned by the API", async () => {
    renderAtSkuDetail();
    await waitFor(() => {
      for (const row of TWO_LOCATION_ROWS) {
        expect(
          screen.getByTestId(`sku-detail-location-${row.location}`)
        ).toBeInTheDocument();
      }
    });
  });

  // T36
  it("each location row carries a data-testid containing the quantity returned by the API", async () => {
    renderAtSkuDetail();
    await waitFor(() => {
      for (const row of TWO_LOCATION_ROWS) {
        const cell = screen.getByTestId(`sku-detail-quantity-${row.location}`);
        expect(cell).toBeInTheDocument();
        expect(cell).toHaveTextContent(String(row.quantity));
      }
    });
  });
});

// ---------------------------------------------------------------------------
// AC2 — tracking code (T38)
// ---------------------------------------------------------------------------

describe("SkuDetailPage — tracking code (AC2)", () => {
  beforeEach(() => {
    stubSkuDetailFetch(SINGLE_ROW_WITH_TRACKING);
  });

  // T38
  it("each location row carries a data-testid containing the combined tracking code exactly as returned by the API", async () => {
    renderAtSkuDetail();
    await waitFor(() => {
      for (const row of SINGLE_ROW_WITH_TRACKING) {
        const cell = screen.getByTestId(`sku-detail-tracking-${row.location}`);
        expect(cell).toBeInTheDocument();
        expect(cell).toHaveTextContent(`${row.batch_number}-${row.serial_number}`);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// AC3 — par-level section + not-tracked (T40, T41, T42)
// ---------------------------------------------------------------------------

describe("SkuDetailPage — par level (AC3)", () => {
  beforeEach(() => {
    stubSkuDetailFetch(SINGLE_ROW_PAR_NULL);
  });

  // T40
  it("rendering <App> in MemoryRouter at '/sku/SKU-A' shows the par-level section element in the document", async () => {
    renderAtSkuDetail();
    await waitFor(() => {
      expect(screen.getByTestId("sku-detail-par-level-section")).toBeInTheDocument();
    });
  });

  // T41
  it("when the API returns a stock record with par_level null, the detail view displays a 'not tracked' indication", async () => {
    renderAtSkuDetail();
    await waitFor(() => {
      const section = screen.getByTestId("sku-detail-par-level-section");
      expect(section).toHaveTextContent(/not tracked/i);
    });
  });

  // T42
  it("the 'not tracked' par-level element carries a data-testid so the seam is assertable without relying on inline styles", async () => {
    renderAtSkuDetail();
    await waitFor(() => {
      const el = screen.getByTestId("sku-detail-par-level-not-tracked");
      expect(el).toBeInTheDocument();
      // Must NOT use inline style — that would block the design-lane token refactor.
      const inlineStyle = el.getAttribute("style") ?? "";
      expect(inlineStyle).not.toMatch(/color|font|display/i);
    });
  });
});
