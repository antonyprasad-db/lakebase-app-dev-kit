/**
 * Client component tests for S3-sku-detail-view.
 *
 * T20 (AC1): SkuDetailView renders the SKU header once and exactly one location
 *            entry per location, each showing that location and its quantity via
 *            their data-testid seams.
 *
 * T22 (AC2): when a location entry carries a tracking code, the component renders
 *            that tracking code via the data-testid="tracking-detail" seam.
 *
 * T24 (AC3): when a location entry's tracking code is null, the component renders
 *            an explicit "not tracked" label (data-testid="tracking-detail") and
 *            does not crash on the null value.
 *
 * All three import SkuDetailView which does not exist yet -- these go RED until
 * the Driver creates the component.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

// The component does not exist yet -- this import will fail (RED).
import { SkuDetailView } from "../../src/pages/SkuDetailView";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SKU = "SKU-WIDGET-42";

const LOCATIONS_WITH_TRACKING = [
  { location: "BIN-A1", quantity: 10, tracking_code: "BATCH-001" },
  { location: "BIN-B2", quantity: 25, tracking_code: "BATCH-002" },
];

const LOCATIONS_WITH_NULL_TRACKING = [
  { location: "BIN-C3", quantity: 7, tracking_code: null },
];

// ---------------------------------------------------------------------------
// T20 - one location entry per location with location and quantity seams
// ---------------------------------------------------------------------------

describe("SkuDetailView", () => {
  it("T20: renders the SKU header once and exactly one location entry per location with location and quantity seams", () => {
    render(
      <SkuDetailView sku={SKU} locations={LOCATIONS_WITH_TRACKING} />
    );

    // SKU header appears exactly once
    const header = screen.getByTestId("sku-detail-page");
    expect(header).toBeInTheDocument();
    expect(screen.getAllByText(SKU).length).toBeGreaterThanOrEqual(1);

    // Exactly one row per location
    const rows = screen.getAllByTestId("sku-row");
    expect(rows).toHaveLength(LOCATIONS_WITH_TRACKING.length);

    // Each row exposes location and quantity
    LOCATIONS_WITH_TRACKING.forEach((entry) => {
      expect(
        screen.getByTestId(`location-cell-${entry.location}`)
      ).toHaveTextContent(entry.location);

      expect(
        screen.getByTestId(`quantity-cell-${entry.location}`)
      ).toHaveTextContent(String(entry.quantity));
    });
  });

  // ---------------------------------------------------------------------------
  // T22 - tracking code rendered per entry when present
  // ---------------------------------------------------------------------------

  it("T22: renders the tracking code via data-testid seam when the entry carries one", () => {
    const entry = LOCATIONS_WITH_TRACKING[0];
    render(
      <SkuDetailView sku={SKU} locations={[entry]} />
    );

    const trackingEl = screen.getByTestId(`tracking-detail-${entry.location}`);
    expect(trackingEl).toBeInTheDocument();
    expect(trackingEl).toHaveTextContent(entry.tracking_code as string);
  });

  // ---------------------------------------------------------------------------
  // T24 - null tracking code renders explicit "not tracked" label without crashing
  // ---------------------------------------------------------------------------

  it("T24: renders an explicit 'not tracked' label for a null tracking_code entry and does not crash", () => {
    const entry = LOCATIONS_WITH_NULL_TRACKING[0];
    render(
      <SkuDetailView sku={SKU} locations={[entry]} />
    );

    // Should not crash -- the component must render without throwing
    const trackingEl = screen.getByTestId(`tracking-detail-${entry.location}`);
    expect(trackingEl).toBeInTheDocument();
    // Must show an explicit label, not a blank region
    expect(trackingEl).toHaveTextContent(/not tracked/i);
  });
});
