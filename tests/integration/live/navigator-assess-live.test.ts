// LIVE (gated RUN_LIVE_STEP=1): the Navigator ASSESSING a failed honest-GREEN for F6/S3/AC1, in
// isolation. A replay seed overlays the post-GREEN driver code + the recorded green-failure.json
// marker; the REAL Navigator discriminates (superseded-shift vs genuine regression) and writes
// its marker. The quality bar is ALIGNMENT: an independent fixed-opus oracle re-evaluates the
// SAME driver code, and the gate passes iff the Navigator's verdict aligns with it (did the
// Navigator judge the driver's work correctly?). See ./build-support.ts.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/navigator-assess-live.test.ts

import { describe, it } from "vitest";
import { BUILD_ROLE_CHAINS, runBuildRoleChain } from "./build-support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE (lean): navigator ASSESS (discriminate a failed GREEN)", () => {
  it("replay-seeds the failed-GREEN state, then the REAL Navigator's verdict ALIGNS with the independent oracle", () => runBuildRoleChain(BUILD_ROLE_CHAINS["navigator-assess"]), 1_200_000);
});
