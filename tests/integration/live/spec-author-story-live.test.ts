// LIVE (gated RUN_LIVE_STEP=1): the spec-author authoring a story's acceptance criteria, in
// isolation. A replay seed lays the recorded product-overview + story stub into a throwaway
// workspace; the REAL spec-author drafts the ACs. See ./support.ts for the shared runner.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/spec-author-story-live.test.ts

import { describe, it } from "vitest";
import { ROLE_CHAINS, runRoleChain } from "./support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE (lean): spec-author per-story ACs", () => {
  it("replay-seeds the story stub, then the REAL spec-author authors a conformant AC", () => runRoleChain(ROLE_CHAINS["spec-author-story"]), 900_000);
});
