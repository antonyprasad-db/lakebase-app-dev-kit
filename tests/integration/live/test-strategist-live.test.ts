// LIVE (gated RUN_LIVE_STEP=1): the test-strategist ordering the feature test list, in
// isolation. A replay seed lays the recorded story AC + architecture.json + db-design.json into a
// throwaway workspace; the REAL test-strategist authors test-list.json (covering every
// persistence_invariant). See ./support.ts for the shared runner.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/test-strategist-live.test.ts

import { describe, it } from "vitest";
import { ROLE_CHAINS, runRoleChain } from "./support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE (lean): test-strategist per-story", () => {
  it("replay-seeds the AC + architecture + db-design, then the REAL test-strategist authors a conformant test-list.json", () => runRoleChain(ROLE_CHAINS["test-strategist"]), 900_000);
});
