import { test, expect } from "@playwright/test";

// T22 (S3-view-batch-and-serial, AC4-combined-code-no-longer-shown): the
// full-SPA path against the real JSON API (through the Vite proxy to the
// paired-branch backend). Seeds one stock record with a populated batch and
// serial, opens its detail view via client-side navigation from Home, and
// asserts: batch and serial render as distinct labeled fields, the legacy
// combined tracking-code field is gone, and the navigation never triggers a
// full page reload (R5, no-full-page-reload contract).
test("opening a stock record's detail view shows distinct batch/serial fields, drops the combined code, and never reloads the page", async ({
  page,
}) => {
  const sku = "SKU-E2E-BATCH-SERIAL";
  const location = "E2E-1";

  await page.request.post("/api/stock-records", {
    data: {
      sku,
      location,
      quantity: 4,
      batch_number: "LOT-E2E",
      serial_number: "SN-E2E",
    },
  });

  await page.goto("/");

  // A marker that only survives a client-side navigation; a full page reload
  // re-executes the document and wipes it.
  await page.evaluate(() => {
    (window as unknown as { __noReloadMarker?: string }).__noReloadMarker = "spa-nav";
  });

  const row = page.getByTestId("stock-row").filter({ hasText: sku }).filter({ hasText: location });
  await row.click();

  await expect(page.getByTestId("stock-detail-batch")).toContainText("LOT-E2E");
  await expect(page.getByTestId("stock-detail-serial")).toContainText("SN-E2E");
  await expect(page.getByTestId("stock-detail-inventory-code")).toHaveCount(0);

  const markerSurvived = await page.evaluate(
    () => (window as unknown as { __noReloadMarker?: string }).__noReloadMarker
  );
  expect(markerSurvived).toBe("spa-nav");
});
