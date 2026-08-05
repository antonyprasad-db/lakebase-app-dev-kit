// GATED LIVE proof for #594 driver GREEN , the honest-GREEN product-channel run. DOUBLE-gated:
//
//   RUN_LIVE_STEP=1 LAKEBASE_TEST_E2E=1 npx vitest run tests/integration/live/driver-green-executor-dispatch-live.test.ts
//
// Unlike navigator RED (lean, no cloud), driver GREEN's correctness gate is the post-turn
// @build-cycle honest-GREEN verify (alembic upgrade + the project's tests against a LIVE Lakebase
// branch), so it needs a real branch. ALL of the config resolution / scaffold / bundle / cut / seed /
// drive / verify / teardown lives in the ONE reusable setup routine runDriverGreenLive
// (driver-build-support.ts), driven through the EXISTING orchestration lifecycle catalogue
// (scaffold-project / remove-project) with the host resolved from the check's own run-config.json
// (driver-green-setup/run-config.json, default fevm-serverless-stable-ecparr, override via
// DATABRICKS_HOST). This file is just the gated wrapper , NO host-resolution logic here.
//
// It is the DRIVER half of the product-channel proof: navigator RED (#590) proved the product channel
// no-cloud; this proves the DRIVER product turn INCLUDING the live honest-GREEN.

import { describe, it } from "vitest";
import { runDriverGreenLive, resolveDriverGreenRunConfig } from "./driver-build-support.js";

// Double-gate: the lean-agent gate (RUN_LIVE_STEP) AND the cloud gate (LAKEBASE_TEST_E2E), since the
// driver-GREEN honest-verify needs a real Lakebase branch. The host comes from the run-config (it
// always resolves to at least the ecparr default), so the gate is purely the two env flags.
const cloudReady = !!process.env.RUN_LIVE_STEP && process.env.LAKEBASE_TEST_E2E === "1";
const hostResolvable = (() => {
  try {
    return !!resolveDriverGreenRunConfig().host;
  } catch {
    return false;
  }
})();

describe.skipIf(!cloudReady || !hostResolvable)("GATED LIVE: the production drive dispatches driver GREEN THROUGH the executor (honest-GREEN product channel)", () => {
  it("run-config -> scaffold-project -> seed bundle + cut branch -> runDriver -> performViaExecutor -> execute() writes app code + honest-GREEN stamps the cycle -> remove-project", () =>
    runDriverGreenLive(), 1_800_000);
});
