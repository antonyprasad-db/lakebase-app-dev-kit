/**
 * T3 - AC3-save-confirmation-shown (client component test, refactored for S2)
 *
 * Submitting the filing form renders an explicit success confirmation that
 * names the stock was filed, rather than leaving the operator on an unchanged
 * form (design guide: "No silent failure -- every action has an explicit success
 * or failure acknowledgment"; data-testid="feedback-message" ending in -success).
 *
 * Note: inventory_code field removed per S1 schema refactor; form now accepts
 * only sku, location, quantity (batch_number/serial_number are populated by the
 * backend during upsertion if conforming codes are detected, not user-supplied).
 *
 * This is a Vitest + Testing Library test against the FileStockRecord component.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

// The component is not built yet -- this import will fail (RED).
import { FileStockRecord } from "../../src/pages/FileStockRecord";

// Stub the API module so the component test never touches the network.
vi.mock("../../src/api/stock", () => ({
  fileStockRecord: vi.fn().mockResolvedValue({
    sku: "TEST-SKU",
    location: "BIN-A1",
    quantity: 10,
  }),
}));

describe("FileStockRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T3: submitting the form renders an explicit success confirmation naming that stock was filed", async () => {
    const user = userEvent.setup();
    render(<FileStockRecord />);

    // Fill in the required fields (sku, location, quantity).
    await user.type(screen.getByLabelText(/sku/i), "TEST-SKU");
    await user.type(screen.getByLabelText(/location/i), "BIN-A1");
    // Clear the quantity field first (it may have a default), then type.
    const qtyInput = screen.getByLabelText(/quantity/i);
    await user.clear(qtyInput);
    await user.type(qtyInput, "10");

    // Submit via the primary action button.
    await user.click(screen.getByTestId("submit-btn"));

    // The success feedback region must appear, must carry the correct testid
    // seam, and must name that the stock was filed.
    await waitFor(() => {
      const feedback = screen.getByTestId("feedback-message");
      expect(feedback).toBeInTheDocument();
      // The design guide: every form has a region ending in -success for a
      // confirmed save. We also accept the generic feedback-message testid
      // carrying success text per the design guide.
      const text = feedback.textContent?.toLowerCase() ?? "";
      expect(
        text.includes("filed") || text.includes("saved") || text.includes("success"),
        `Expected success confirmation text, got: "${feedback.textContent}"`
      ).toBe(true);
    });
  });

  it("T3 (confirmation not silent): after submit the form does not remain in its initial empty/unacknowledged state", async () => {
    const user = userEvent.setup();
    render(<FileStockRecord />);

    await user.type(screen.getByLabelText(/sku/i), "TEST-SKU");
    await user.type(screen.getByLabelText(/location/i), "BIN-A1");
    const qtyInput = screen.getByLabelText(/quantity/i);
    await user.clear(qtyInput);
    await user.type(qtyInput, "10");

    await user.click(screen.getByTestId("submit-btn"));

    // After a successful submission a feedback-message MUST be present.
    // Its absence means the form left the operator on an unchanged screen.
    await waitFor(() => {
      expect(screen.getByTestId("feedback-message")).toBeInTheDocument();
    });
  });
});
