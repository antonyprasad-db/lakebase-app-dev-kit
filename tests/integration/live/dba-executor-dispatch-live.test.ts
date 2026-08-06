// LIVE (gated RUN_LIVE_STEP=1): the DBA design turn dispatched THROUGH the shipped executor path.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/dba-executor-dispatch-live.test.ts
//
// Proves the Stage 1/1b widening LIVE: a REAL dba `claude -p` turn, dispatched via
// buildDriveEffects(cfg).performViaExecutor, resolves its feature-scoped input
// (feature:features/{feature}/architecture.json , the {feature} scope fix) on a real .consort tree
// and lands db-design.json under .consort at features/<F>/ (the artifact channel) + the reconciled
// agent-log under .consort (meta). See ./executor-dispatch-live-support.ts. LEAN, no cloud.

import { describe, it } from "vitest";
import { runDesignExecutorDispatchLive, FEATURE } from "./executor-dispatch-live-support.js";

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE: dba through the shipped executor (artifact channel, {feature}-scoped input)", () => {
  it("resolves features/<F>/architecture.json + lands db-design.json under .consort", () =>
    runDesignExecutorDispatchLive({
      name: "dba",
      action: { kind: "invoke-role", role: "dba", story: "S1-file-stock" },
      // The DBA reads the architect's contract; it lives feature-scoped (the {feature} source fix).
      seed: [{ rel: `features/${FEATURE}/architecture.json`, from: `features/${FEATURE}/architecture.json` }],
      artifactRel: `features/${FEATURE}/db-design.json`,
      prompt:
        `From the provided architecture.json (the architect's logical contract: service_backed, ` +
        `layers, persistence_invariants), produce the PHYSICAL schema. WRITE exactly this file, ` +
        `relative to your current working directory:\n` +
        `  - .consort/features/${FEATURE}/db-design.json\n` +
        `Declare feature_id, tables[] (columns with type/nullable, primary_key, unique_constraints, ` +
        `foreign_keys, checks, indexes), this story's schema_changes[], and realizes_invariants[] as ` +
        `a FLAT array of the architecture.json persistence_invariant id STRINGS. Do NOT re-author the ` +
        `invariants; physically realize them. Then STOP , run no shell command, do NOT self-verify. ` +
        `As the LAST thing in your reply, emit a fenced report block:\n` +
        "```agent-report\n" +
        `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
        "```\n",
    }), 900_000);
});
