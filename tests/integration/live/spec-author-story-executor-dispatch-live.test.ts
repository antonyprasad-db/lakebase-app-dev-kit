// LIVE (gated RUN_LIVE_STEP=1): the spec-author per-story ACs turn through the shipped executor.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/spec-author-story-executor-dispatch-live.test.ts
//
// Real spec-author turn via performViaExecutor: reads the story stub (story-scoped) + product-overview
// (root), lands >=1 acs/<AC>.json under .consort at features/<F>/stories/<S>/acs/ (artifact channel,
// a DIRECTORY primary , acsDirConformant) + the reconciled agent-log (meta). LEAN, no cloud.

import { describe, it } from "vitest";
import { runDesignExecutorDispatchLive, FEATURE, STORY } from "./executor-dispatch-live-support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE: spec-author per-story ACs through the shipped executor (artifact channel, dir primary)", () => {
  it("reads the story stub + lands >=1 acs/<AC>.json under .consort", () =>
    runDesignExecutorDispatchLive({
      name: "spec-author-story",
      action: { kind: "invoke-role", role: "spec-author", story: STORY },
      seed: [
        { rel: `features/${FEATURE}/stories/${STORY}/story.json`, from: `features/${FEATURE}/stories/${STORY}/story.json` },
        { rel: "product-overview.md", from: "product-overview.md" },
      ],
      artifactRel: `features/${FEATURE}/stories/${STORY}/acs`,
      artifactIsDir: true,
      prompt:
        `From the provided story stub + product overview, draft the acceptance criteria for story ` +
        `${STORY}. WRITE at least one AC file, relative to your current working directory:\n` +
        `  - .consort/features/${FEATURE}/stories/${STORY}/acs/<AC-id>.json\n` +
        `Each AC file is a JSON object whose "id" equals its basename, with a story_id, statement, ` +
        `layer, given/when/then, and a status. Author real, testable criteria from the story stub. ` +
        `Then STOP , run no shell command, do NOT self-verify. As the LAST thing in your reply, emit a ` +
        `fenced report block:\n` +
        "```agent-report\n" +
        `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
        "```\n",
    }), 900_000);
});
