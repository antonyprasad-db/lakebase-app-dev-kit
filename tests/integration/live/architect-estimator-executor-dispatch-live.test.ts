// LIVE (gated RUN_LIVE_STEP=1): the architect ESTIMATE (plan lane) turn through the shipped executor.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/architect-estimator-executor-dispatch-live.test.ts
//
// Real architect estimate turn via performViaExecutor: reads planning/feature-proposals.md, lands
// planning/estimates.json under .consort (artifact channel). PLANNING MODE , the executor SKIPS
// reconcile (no agent-log), matching the legacy !isPlanningMode guard. LEAN, no cloud.

import { describe, it } from "vitest";
import { runDesignExecutorDispatchLive } from "./executor-dispatch-live-support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE: architect estimate through the shipped executor (plan lane, no reconcile)", () => {
  it("reads planning/feature-proposals.md + lands planning/estimates.json under .consort", () =>
    runDesignExecutorDispatchLive({
      name: "architect-estimator",
      action: { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" },
      seed: [{ rel: "planning/feature-proposals.md", from: "planning/feature-proposals.md" }],
      artifactRel: "planning/estimates.json",
      prompt:
        `Estimating the sprint's candidate features. From the provided feature-proposals.md, t-shirt ` +
        `size each candidate. WRITE exactly this file, relative to your current working directory:\n` +
        `  - .consort/planning/estimates.json\n` +
        `A JSON array (or object) of per-candidate {feature_id/name, size (one of XS/S/M/L/XL), ` +
        `rationale}. Size every candidate the proposals name. Then STOP , run no shell command, do NOT ` +
        `self-verify. As the LAST thing in your reply, emit a fenced report block:\n` +
        "```agent-report\n" +
        `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
        "```\n",
    }), 900_000);
});
