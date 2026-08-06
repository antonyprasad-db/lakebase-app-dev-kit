// LIVE (gated RUN_LIVE_STEP=1): the spec-author PROPOSE (plan lane) turn through the shipped executor.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/spec-author-propose-executor-dispatch-live.test.ts
//
// Real spec-author propose turn via performViaExecutor: reads product-overview + nfrs (root), lands
// planning/feature-proposals.md under .consort (artifact channel). PLANNING MODE , the executor SKIPS
// reconcile (no agent-log), matching the legacy !isPlanningMode guard. LEAN, no cloud.

import { describe, it } from "vitest";
import { runDesignExecutorDispatchLive } from "./executor-dispatch-live-support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE: spec-author propose through the shipped executor (plan lane, no reconcile)", () => {
  it("reads product-overview + nfrs + lands planning/feature-proposals.md under .consort", () =>
    runDesignExecutorDispatchLive({
      name: "spec-author-propose",
      action: { kind: "invoke-role", role: "spec-author", mode: "propose" },
      seed: [
        { rel: "product-overview.md", from: "product-overview.md" },
        { rel: "nfrs.md", from: "nfrs.md" },
      ],
      artifactRel: "planning/feature-proposals.md",
      prompt:
        `In the sprint plan lane. From the provided product overview + NFR brief, propose the sprint's ` +
        `candidate features. WRITE exactly this file, relative to your current working directory:\n` +
        `  - .consort/planning/feature-proposals.md\n` +
        `One candidate feature per section (a heading + a short scope), so the Architect can size them ` +
        `and the PO can commit a backlog. Then STOP , run no shell command, do NOT self-verify. As the ` +
        `LAST thing in your reply, emit a fenced report block:\n` +
        "```agent-report\n" +
        `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
        "```\n",
    }), 900_000);
});
