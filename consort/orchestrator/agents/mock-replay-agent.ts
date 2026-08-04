// mock-replay-agent: a role-agnostic REPLAY mock , a StepAgent (no cloud/model) that, instead
// of inventing content, copies a role's RECORDED authoring from a scenario corpus into the
// provided workspace. Its canonical use is the PO Human Mock (the recorded product-overview.md /
// nfrs.md / design-brief.md become the turn-1 outputs the spec-author then consumes), but the
// `role` option makes it faithfully re-materialize ANY role's recorded artifacts offline , the
// catalogue's `replay` kind (agent-catalogue.ts) is a thin wrapper over this.
//
// It is a StepAgent (same seam as ClaudeStepAgent + the test mock), so ManifestStep + the
// StepExecutor drive it identically , the Template Method does not know or care that this
// step is a deterministic replay rather than a live model turn. That is the point of the
// contract: a step is a step.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { StepAgent, AgentInvocation } from "./agent-types.js";

/** One recorded file to materialize: copy corpus `from` -> workspace `to` under `outputId`. */
export interface RecordedSeed {
  /** The manifest output id this seed satisfies (for diagnostics + mapping). */
  outputId: string;
  /** Path (relative to the corpus root) of the recorded human authoring. */
  from: string;
  /** Path (relative to the workspace) the file is written to (the manifest filename). */
  to: string;
}

/** What the PO mock is told to replay: the corpus root + the recorded seed files, plus the
 *  role it stamps its authoring log under (so productOwnerLoggedAuthoring passes). */
export interface MockReplayAgentOptions {
  /** Absolute path to the scenario corpus root the recorded files live under. */
  corpusRoot: string;
  /** The recorded seeds to copy into the workspace. */
  seeds: RecordedSeed[];
  /** The role stamped on the authoring log event (default "product-owner"). */
  role?: string;
}

/**
 * Build a PO Human Mock replay agent. On invoke it copies each recorded seed from the corpus
 * into the provided workspace (fail loud if a recorded file is missing , a replay must never
 * silently produce nothing), then appends ONE authoring event to the workspace agent-log so
 * the manifest's log checker passes. Contained: it reads only the corpus + writes only the
 * workspace it was handed.
 */
export function makeMockReplayAgent(opts: MockReplayAgentOptions): StepAgent {
  const role = opts.role ?? "product-owner";
  return {
    async invoke(invocation: AgentInvocation): Promise<void> {
      const materialized: string[] = [];
      for (const seed of opts.seeds) {
        const src = join(opts.corpusRoot, seed.from);
        if (!existsSync(src)) {
          throw new Error(
            `ReplayPoMockAgent: recorded seed for "${seed.outputId}" not found at ${src} , a replay cannot fabricate it. Check the corpus root + recorded path.`,
          );
        }
        const dst = join(invocation.workspaceDir, seed.to);
        // Seeds may land at a NESTED path (e.g. stories/<S>/acs/<AC>.json); writeFileSync does
        // not create intermediate dirs, so mkdir the parent first.
        mkdirSync(dirname(dst), { recursive: true });
        writeFileSync(dst, readFileSync(src, "utf8"));
        materialized.push(seed.to);
      }
      // Log what the PO "authored" (the shared agent-log line the manifest's log checker
      // requires), appended so a re-run does not clobber a prior turn's log.
      const event = {
        timestamp: new Date().toISOString(),
        level: "info",
        role,
        event: "artifact.written",
        message: `replayed PO authoring: ${materialized.join(", ")}`,
      };
      const logPath = join(invocation.workspaceDir, "agent-log.jsonl");
      const prior = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
      writeFileSync(logPath, prior + JSON.stringify(event) + "\n");
    },
  };
}
