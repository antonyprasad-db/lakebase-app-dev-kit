// LIVE (gated RUN_LIVE_STEP=1): the spec-author proposing sprint candidate features (the plan
// lane), in isolation. A replay seed lays the recorded product-overview + NFR brief into a
// throwaway workspace; the REAL spec-author authors planning/feature-proposals.md. See ./support.ts.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/spec-author-propose-live.test.ts

import { describe, it } from "vitest";
import { ROLE_CHAINS, runRoleChain } from "./support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE (lean): spec-author propose (sprint plan lane)", () => {
  it("replay-seeds the PO overview + NFRs, then the REAL spec-author authors feature-proposals.md", () => runRoleChain(ROLE_CHAINS["spec-author-propose"]), 900_000);
});
