// LIVE (gated RUN_LIVE_STEP=1): the test-strategist design turn through the shipped executor.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/test-strategist-executor-dispatch-live.test.ts
//
// Real test-strategist turn via performViaExecutor: reads the story acs/ + feature-scoped
// architecture.json + db-design.json (the {feature} source fix), lands test-list.json under .consort
// at features/<F>/ (artifact channel) + the reconciled agent-log (meta), and runs its `after` test-list
// CLI. See ./executor-dispatch-live-support.ts. LEAN, no cloud.

import { describe, it } from "vitest";
import { runDesignExecutorDispatchLive, FEATURE, STORY } from "./executor-dispatch-live-support.js";

const AC = JSON.stringify({
  id: "AC1-file-stock-record", story_id: STORY, statement: "A stock record can be filed",
  layer: "persistence", given: "an empty catalog", when: "a stock record is filed", then: "it persists", status: "draft",
}) + "\n";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE: test-strategist through the shipped executor (artifact channel)", () => {
  it("reads acs/ + feature architecture + db-design + lands test-list.json under .consort", () =>
    runDesignExecutorDispatchLive({
      name: "test-strategist",
      action: { kind: "invoke-role", role: "test-strategist", story: STORY },
      seed: [
        { rel: `features/${FEATURE}/stories/${STORY}/acs/AC1-file-stock-record.json`, content: AC },
        { rel: `features/${FEATURE}/architecture.json`, from: `features/${FEATURE}/architecture.json` },
        { rel: `features/${FEATURE}/db-design.json`, from: `features/${FEATURE}/db-design.json` },
      ],
      artifactRel: `features/${FEATURE}/test-list.json`,
      prompt:
        `Invoked for story ${STORY}. From the provided ACs + architecture.json + db-design.json, ` +
        `produce the feature master test list covering EVERY provided AC. WRITE exactly this file, ` +
        `relative to your current working directory:\n` +
        `  - .consort/features/${FEATURE}/test-list.json\n` +
        `Order the story's tests; map each test's ac_id to a provided AC's EXACT id; cover each AC at ` +
        `least once. Cover EVERY architecture persistence_invariant with a real-branch fitness test ` +
        `that sets "invariant_id". Every DB-writing test must own its state (a per-run-unique key). ` +
        `Conform to test-list.schema.json. Then STOP , run no shell command, do NOT self-verify. As ` +
        `the LAST thing in your reply, emit a fenced report block:\n` +
        "```agent-report\n" +
        `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
        "```\n",
    }), 900_000);
});
