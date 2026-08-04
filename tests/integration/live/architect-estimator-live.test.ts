// LIVE (gated RUN_LIVE_STEP=1): the architect t-shirt-sizing sprint candidates (the plan lane),
// in isolation. A replay seed lays the recorded feature-proposals.md into a throwaway workspace;
// the REAL architect authors planning/estimates.json. See ./support.ts for the shared runner.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/architect-estimator-live.test.ts

import { describe, it } from "vitest";
import { ROLE_CHAINS, runRoleChain } from "./support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE (lean): architect-estimator (estimate)", () => {
  it("replay-seeds feature-proposals.md, then the REAL architect authors estimates.json", () => runRoleChain(ROLE_CHAINS["architect-estimator"]), 900_000);
});
