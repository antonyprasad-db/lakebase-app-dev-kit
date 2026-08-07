/**
 * T26 - SKU-detail component renders one row per location showing location
 *       and quantity via its data-testid seams.
 * T28 - Each location entry renders its split batch_number and serial_number
 *       beside the location via its data-testid seams.
 * T30 - The par-level region renders the explicit "not tracked" state (not a
 *       blank region or a null crash) when par_level is absent.
 * T32 - The component maps an empty collection to the explicit
 *       "No stock for this SKU" state via its data-testid seam.
 *
 * Vitest + Testing Library component tests.
 * No server required; the api layer is stubbed.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkuDetailPage } from "../../src/pages/SkuDetailPage";

// Stub the api layer so the component renders without a running server.
vi.mock("../../src/api/stock", () => ({
  fetchSkuDetail: vi.fn(),
}));

import { fetchSkuDetail } from "../../src/api/stock";
const mockFetch = fetchSkuDetail as ReturnType<typeof vi.fn>;

const SAMPLE_ENTRIES = [
  {
    location: "LOC-NORTH",
    quantity: 12,
    batch_number: "BATCH-AABBCC",
    serial_number: "SERIAL-1111",
    par_level: 5,
  },
  {
    location: "LOC-SOUTH",
    quantity: 30,
    batch_number: "BATCH-DDEEFF",
    serial_number: "SERIAL-2222",
    par_level: null,
  },
];

// ---------------------------------------------------------------------------
// T26: renders one row per location with location + quantity seams
// ---------------------------------------------------------------------------

describe("SkuDetailPage - T26: renders one row per location", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(SAMPLE_ENTRIES);
  });

  it("renders the sku-detail container", async () => {
    render(
      <MemoryRouter initialEntries={["/sku/SKU-ALPHA"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    expect(await screen.findByTestId("sku-detail-table")).toBeInTheDocument();
  });

  it("renders one sku-detail-row per location entry", async () => {
    render(
      <MemoryRouter initialEntries={["/sku/SKU-ALPHA"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    await screen.findByTestId("sku-detail-row-LOC-NORTH");
    expect(screen.getByTestId("sku-detail-row-LOC-NORTH")).toBeInTheDocument();
    expect(screen.getByTestId("sku-detail-row-LOC-SOUTH")).toBeInTheDocument();
  });

  it("each row displays its location", async () => {
    render(
      <MemoryRouter initialEntries={["/sku/SKU-ALPHA"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    await screen.findByTestId("sku-detail-row-LOC-NORTH");
    const row = screen.getByTestId("sku-detail-row-LOC-NORTH");
    expect(row).toHaveTextContent("LOC-NORTH");
  });

  it("each row displays its quantity via the qty-cell seam", async () => {
    render(
      <MemoryRouter initialEntries={["/sku/SKU-ALPHA"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    await screen.findByTestId("sku-detail-qty-LOC-NORTH");
    expect(screen.getByTestId("sku-detail-qty-LOC-NORTH")).toHaveTextContent("12");
    expect(screen.getByTestId("sku-detail-qty-LOC-SOUTH")).toHaveTextContent("30");
  });
});

// ---------------------------------------------------------------------------
// T28: each location entry renders its split batch_number and serial_number via seams
// ---------------------------------------------------------------------------

describe("SkuDetailPage - T28: location entries render split batch/serial", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(SAMPLE_ENTRIES);
  });

  it("renders a batch-number cell for each location entry", async () => {
    render(
      <MemoryRouter initialEntries={["/sku/SKU-ALPHA"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    await screen.findByTestId("sku-detail-batch-LOC-NORTH");
    expect(screen.getByTestId("sku-detail-batch-LOC-NORTH")).toBeInTheDocument();
    expect(screen.getByTestId("sku-detail-batch-LOC-SOUTH")).toBeInTheDocument();
  });

  it("renders a serial-number cell for each location entry", async () => {
    render(
      <MemoryRouter initialEntries={["/sku/SKU-ALPHA"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    await screen.findByTestId("sku-detail-serial-LOC-NORTH");
    expect(screen.getByTestId("sku-detail-serial-LOC-NORTH")).toBeInTheDocument();
    expect(screen.getByTestId("sku-detail-serial-LOC-SOUTH")).toBeInTheDocument();
  });

  it("the batch-number cell shows the correct batch number", async () => {
    render(
      <MemoryRouter initialEntries={["/sku/SKU-ALPHA"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    const cell = await screen.findByTestId("sku-detail-batch-LOC-NORTH");
    expect(cell).toHaveTextContent("BATCH-AABBCC");
  });

  it("the serial-number cell shows the correct serial number", async () => {
    render(
      <MemoryRouter initialEntries={["/sku/SKU-ALPHA"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    const cell = await screen.findByTestId("sku-detail-serial-LOC-NORTH");
    expect(cell).toHaveTextContent("SERIAL-1111");
  });
});

// ---------------------------------------------------------------------------
// T30: absent par_level renders explicit "not tracked" state via seam
// ---------------------------------------------------------------------------

describe("SkuDetailPage - T30: absent par_level renders not-tracked state", () => {
  it("renders the par-level region with 'not tracked' when par_level is null", async () => {
    const entriesWithNullPar = [
      {
        location: "LOC-WEST",
        quantity: 8,
        batch_number: "BATCH-GGHHII",
        serial_number: "SERIAL-3333",
        par_level: null,
      },
    ];
    mockFetch.mockResolvedValue(entriesWithNullPar);

    render(
      <MemoryRouter initialEntries={["/sku/SKU-BETA"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    const parCell = await screen.findByTestId("sku-detail-par-LOC-WEST");
    expect(parCell).toBeInTheDocument();
    // Must show the explicit "not tracked" text, never blank or a crash.
    expect(parCell).toHaveTextContent("not tracked");
  });

  it("does NOT render a blank par-level cell when par_level is null", async () => {
    const entriesWithNullPar = [
      {
        location: "LOC-EAST",
        quantity: 3,
        batch_number: "BATCH-JJKKLL",
        serial_number: "SERIAL-4444",
        par_level: null,
      },
    ];
    mockFetch.mockResolvedValue(entriesWithNullPar);

    render(
      <MemoryRouter initialEntries={["/sku/SKU-GAMMA"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    const parCell = await screen.findByTestId("sku-detail-par-LOC-EAST");
    // Must NOT be empty -- absence of par_level is always named, never silent.
    expect(parCell.textContent).not.toBe("");
    expect(parCell.textContent).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T32: empty collection maps to explicit "No stock for this SKU" empty state
// ---------------------------------------------------------------------------

describe("SkuDetailPage - T32: empty collection shows empty-state seam", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue([]);
  });

  it("renders the empty-state element when the collection is empty", async () => {
    render(
      <MemoryRouter initialEntries={["/sku/SKU-UNKNOWN"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    expect(await screen.findByTestId("empty-state")).toBeInTheDocument();
  });

  it("empty-state shows the explicit 'No stock for this SKU' message", async () => {
    render(
      <MemoryRouter initialEntries={["/sku/SKU-UNKNOWN"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    const el = await screen.findByTestId("empty-state");
    expect(el).toHaveTextContent("No stock for this SKU");
  });

  it("does NOT render the sku-detail-table when the collection is empty", async () => {
    render(
      <MemoryRouter initialEntries={["/sku/SKU-UNKNOWN"]}>
        <SkuDetailPage />
      </MemoryRouter>
    );
    await screen.findByTestId("empty-state");
    expect(screen.queryByTestId("sku-detail-table")).not.toBeInTheDocument();
  });
});
