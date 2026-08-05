// GATED LIVE proof for #594 driver GREEN , the honest-GREEN product-channel run. DOUBLE-gated:
//
//   RUN_LIVE_STEP=1 LAKEBASE_TEST_E2E=1 npx vitest run tests/integration/live/driver-green-executor-dispatch-live.test.ts
//
// Unlike navigator RED (lean, no cloud , tests/ is a file check), driver GREEN's correctness gate is
// the post-turn @build-cycle honest-GREEN verify: greenOpenCycle -> ensureDeployedAndVerify STARTS
// the app against the local deploy target (LAKEBASE_BRANCH_ID) and runs `alembic upgrade head` + the
// project's tests. That needs a LIVE Lakebase branch + a running app , so this is gated on
// LAKEBASE_TEST_E2E + a resolvable host. ALL of the scaffold / bundle / cut / seed / drive / verify /
// teardown work lives in the ONE reusable setup routine runDriverGreenLive (driver-build-support.ts),
// the cloud sibling of build-support.ts , this file is just the gated wrapper.
//
// It is the DRIVER half of the product-channel proof: navigator RED (#590) proved the product channel
// no-cloud; this proves the DRIVER product turn INCLUDING the live honest-GREEN.

import { describe, it } from "vitest";
import { execFileSync } from "node:child_process";
import { runDriverGreenLive } from "./driver-build-support.js";

// Double-gate: the lean-agent gate (RUN_LIVE_STEP) AND the cloud gate (LAKEBASE_TEST_E2E), since the
// driver-GREEN honest-verify needs a real Lakebase branch. Both must be set for this to run.
const cloudReady = !!process.env.RUN_LIVE_STEP && process.env.LAKEBASE_TEST_E2E === "1";

/** Resolve the Lakebase-enabled test host: an explicit override, else the configured Databricks
 *  profile's host (same resolution as create-project.test.ts). Undefined => the describe is skipped. */
function resolveTestHost(): string | undefined {
  if (process.env.LAKEBASE_TEST_HOST) return process.env.LAKEBASE_TEST_HOST;
  const profile = process.env.DATABRICKS_CONFIG_PROFILE;
  try {
    const args = ["auth", "env", ...(profile ? ["--profile", profile] : [])];
    const raw = execFileSync("databricks", args, { encoding: "utf-8", timeout: 15_000 });
    const env = JSON.parse(raw) as { env?: Record<string, string> };
    return env.env?.DATABRICKS_HOST?.replace(/\/+$/, "") || undefined;
  } catch {
    return undefined;
  }
}
const HOST = resolveTestHost();

describe.skipIf(!cloudReady || !HOST)("GATED LIVE: the production drive dispatches driver GREEN THROUGH the executor (honest-GREEN product channel)", () => {
  it("runDriverGreenLive: scaffold + bundle + cut branch -> runDriver -> performViaExecutor -> execute() writes app code + honest-GREEN stamps the cycle -> teardown", () =>
    runDriverGreenLive({ host: HOST! }), 1_800_000);
});
