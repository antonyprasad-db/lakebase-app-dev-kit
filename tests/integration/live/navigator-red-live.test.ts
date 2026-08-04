// LIVE (gated RUN_LIVE_STEP=1): the Navigator authoring the RED (failing) tests for F6/S3, in
// isolation. A replay seed overlays the pre-RED code tree + the design artifacts into a throwaway
// workspace; the REAL Navigator writes the story's tests. The quality bar is COVERAGE +
// FAITHFULNESS against the seeded test-list SPEC (a fixed-opus judge), NOT a turn-for-turn match
// to the recorded tests. See ./build-support.ts.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/navigator-red-live.test.ts

import { describe, it } from "vitest";
import { BUILD_ROLE_CHAINS, runBuildRoleChain } from "./build-support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE (lean): navigator RED (author the story's failing tests)", () => {
  it("replay-seeds the pre-RED state, then the REAL Navigator authors tests that cover + faithfully assert the test-list", () => runBuildRoleChain(BUILD_ROLE_CHAINS["navigator-red"]), 1_200_000);
});
