// LIVE (gated RUN_LIVE_STEP=1): the ux-designer design turn through the shipped executor.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/ux-designer-executor-dispatch-live.test.ts
//
// Real ux-designer turn via performViaExecutor: reads design/design-brief.md (the design/-scoped
// source fix) + product-overview, lands design-guide.json under .consort at design/ (artifact channel)
// + the reconciled agent-log (meta). See ./executor-dispatch-live-support.ts. LEAN, no cloud.

import { describe, it } from "vitest";
import { runDesignExecutorDispatchLive } from "./executor-dispatch-live-support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE: ux-designer through the shipped executor (artifact channel)", () => {
  it("reads design/design-brief.md + product-overview + lands design/design-guide.json under .consort", () =>
    runDesignExecutorDispatchLive({
      name: "ux-designer",
      action: { kind: "invoke-role", role: "ux-designer" },
      seed: [
        { rel: "design/design-brief.md", from: "design-brief.md" },
        { rel: "product-overview.md", from: "product-overview.md" },
      ],
      artifactRel: "design/design-guide.json",
      prompt:
        `From the provided design brief + product overview, translate the brief into the project's ` +
        `machine-checkable design system. WRITE exactly this file, relative to your current working ` +
        `directory:\n` +
        `  - .consort/design/design-guide.json\n` +
        `Realize EVERY element the brief names: all token scales (typography, colors, spacing, radius, ` +
        `shadows, breakpoints) at every level the brief enumerates, and a "components" block with an ` +
        `entry for EACH reusable UI component the brief describes (navbar, page, card, button, form ` +
        `input, table, status badge, empty state, and any others named), each with its class + notes. ` +
        `Conform to design-guide.schema.json. Then STOP , run no shell command, do NOT self-verify. As ` +
        `the LAST thing in your reply, emit a fenced report block:\n` +
        "```agent-report\n" +
        `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
        "```\n",
    }), 900_000);
});
