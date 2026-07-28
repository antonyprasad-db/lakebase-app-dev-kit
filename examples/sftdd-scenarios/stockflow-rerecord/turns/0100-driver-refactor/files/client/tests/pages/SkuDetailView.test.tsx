/**
 * Client component tests for S2-batch-serial-fields-in-stock-view.
 *
 * T20 (AC1): SkuDetailView renders the SKU header once and exactly one location
 *            entry per location, each showing that location and its quantity via
 *            their data-testid seams.
 *
 * T22 (AC1/AC3 refactored): when a location entry carries batch_number and serial_number,
 *            the component renders them as two distinct labelled entries via
 *            data-testid="batch-detail" and data-testid="serial-detail" seams.
 *
 * T24 (AC2 refactored): when a location entry's batch_number/serial_number are null,
 *            the component renders "none yet" for each (per AC2 clean-empty-render)
 *            and does not crash on null values.
 *
 * All three import SkuDetailView which exists per S2 green.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

// The component does not exist yet -- this import will fail (RED).
import { SkuDetailView } from "../../src/pages/SkuDetailView";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SKU = "SKU-WIDGET-42";

const LOCATIONS_WITH_BATCH_SERIAL = [
  { location: "BIN-A1", quantity: 10, batch_number: "BATCH-001", serial_number: "SER-001" },
  { location: "BIN-B2", quantity: 25, batch_number: "BATCH-002", serial_number: "SER-002" },
];

const LOCATIONS_WITH_NULL_BATCH_SERIAL = [
  { location: "BIN-C3", quantity: 7, batch_number: null, serial_number: null },
];

// ---------------------------------------------------------------------------
// T20 - one location entry per location with location and quantity seams
// ---------------------------------------------------------------------------

describe("SkuDetailView", () => {
  it("T20: renders the SKU header once and exactly one location entry per location with location and quantity seams", () => {
    render(
      <SkuDetailView sku={SKU} locations={LOCATIONS_WITH_BATCH_SERIAL} />
    );

    // SKU header appears exactly once
    const header = screen.getByTestId("sku-detail-page");
    expect(header).toBeInTheDocument();
    expect(screen.getAllByText(SKU).length).toBeGreaterThanOrEqual(1);

    // Exactly one row per location
    const rows = screen.getAllByTestId("sku-row");
    expect(rows).toHaveLength(LOCATIONS_WITH_BATCH_SERIAL.length);

    // Each row exposes location and quantity
    LOCATIONS_WITH_BATCH_SERIAL.forEach((entry) => {
      expect(
        screen.getByTestId(`location-cell-${entry.location}`)
      ).toHaveTextContent(entry.location);

      expect(
        screen.getByTestId(`quantity-cell-${entry.location}`)
      ).toHaveTextContent(String(entry.quantity));
    });
  });

  // ---------------------------------------------------------------------------
  // T22 - batch and serial rendered as two distinct entries when present
  // ---------------------------------------------------------------------------

  it("T22: renders the batch_number and serial_number as two distinct labelled entries when present", () => {
    const entry = LOCATIONS_WITH_BATCH_SERIAL[0];
    render(
      <SkuDetailView sku={SKU} locations={[entry]} />
    );

    const batchEl = screen.getByTestId(`batch-detail-${entry.location}`);
    expect(batchEl).toBeInTheDocument();
    expect(batchEl).toHaveTextContent(entry.batch_number as string);

    const serialEl = screen.getByTestId(`serial-detail-${entry.location}`);
    expect(serialEl).toBeInTheDocument();
    expect(serialEl).toHaveTextContent(entry.serial_number as string);
  });

  // ---------------------------------------------------------------------------
  // T24 - null batch/serial render "none yet" without crashing
  // ---------------------------------------------------------------------------

  it("T24: renders 'none yet' for null batch_number and serial_number and does not crash", () => {
    const entry = LOCATIONS_WITH_NULL_BATCH_SERIAL[0];
    render(
      <SkuDetailView sku={SKU} locations={[entry]} />
    );

    // Should not crash -- the component must render without throwing
    const batchEl = screen.getByTestId(`batch-detail-${entry.location}`);
    expect(batchEl).toBeInTheDocument();
    expect(batchEl).toHaveTextContent(/none yet/i);

    const serialEl = screen.getByTestId(`serial-detail-${entry.location}`);
    expect(serialEl).toBeInTheDocument();
    expect(serialEl).toHaveTextContent(/none yet/i);
  });
});
