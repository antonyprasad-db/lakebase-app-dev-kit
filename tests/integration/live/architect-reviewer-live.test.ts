// LIVE (gated RUN_LIVE_STEP=1): the architect-reviewer authoring the feature architecture, in
// isolation. A replay seed lays the recorded NFR brief + story AC into a throwaway workspace;
// the REAL architect authors architecture.json. See ./support.ts for the shared runner.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/architect-reviewer-live.test.ts

import { describe, it } from "vitest";
import { ROLE_CHAINS, runRoleChain } from "./support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE (lean): architect-reviewer per-story", () => {
  it("replay-seeds the ACs + NFRs, then the REAL architect authors a conformant architecture.json", () => runRoleChain(ROLE_CHAINS["architect-reviewer"]), 900_000);
});
