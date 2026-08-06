// LIVE (gated RUN_LIVE_STEP=1): the architect-reviewer design turn through the shipped executor.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/architect-reviewer-executor-dispatch-live.test.ts
//
// Real architect turn via performViaExecutor: reads the story's acs/ (story-scoped) + nfrs (root),
// lands architecture.json under .consort at features/<F>/ (artifact channel) + the reconciled
// agent-log under .consort (meta). See ./executor-dispatch-live-support.ts. LEAN, no cloud.

import { describe, it } from "vitest";
import { runDesignExecutorDispatchLive, FEATURE, STORY } from "./executor-dispatch-live-support.js";

const AC = JSON.stringify({
  id: "AC1-file-stock-record", story_id: STORY, statement: "A stock record can be filed",
  layer: "persistence", given: "an empty catalog", when: "a stock record is filed", then: "it persists", status: "draft",
}) + "\n";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE: architect-reviewer through the shipped executor (artifact channel)", () => {
  it("reads the story acs/ + nfrs + lands architecture.json under .consort", () =>
    runDesignExecutorDispatchLive({
      name: "architect-reviewer",
      action: { kind: "invoke-role", role: "architect-reviewer", story: STORY },
      seed: [
        { rel: `features/${FEATURE}/stories/${STORY}/acs/AC1-file-stock-record.json`, content: AC },
        { rel: "nfrs.md", from: "nfrs.md" },
      ],
      artifactRel: `features/${FEATURE}/architecture.json`,
      prompt:
        `From the provided story AC + the NFR brief, author the feature architecture. WRITE exactly ` +
        `this file, relative to your current working directory:\n` +
        `  - .consort/features/${FEATURE}/architecture.json\n` +
        `It MUST declare feature_id, an explicit service_backed boolean, layers[] (each role + module), ` +
        `and , when service_backed , persistence_invariants[] (each id/type/table/brief). This feature ` +
        `persists stock records, so it is service_backed with a real schema. Then STOP , run no shell ` +
        `command, do NOT self-verify. As the LAST thing in your reply, emit a fenced report block:\n` +
        "```agent-report\n" +
        `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
        "```\n",
    }), 900_000);
});
