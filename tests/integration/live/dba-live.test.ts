// LIVE (gated RUN_LIVE_STEP=1): the DBA realizing the physical schema, in isolation. A replay
// seed lays the recorded architecture.json into a throwaway workspace; the REAL DBA authors
// db-design.json (physically realizing the architect's invariants). See ./support.ts.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/dba-live.test.ts

import { describe, it } from "vitest";
import { ROLE_CHAINS, runRoleChain } from "./support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE (lean): dba per-story schema", () => {
  it("replay-seeds architecture.json, then the REAL DBA authors a conformant db-design.json", () => runRoleChain(ROLE_CHAINS["dba"]), 900_000);
});
