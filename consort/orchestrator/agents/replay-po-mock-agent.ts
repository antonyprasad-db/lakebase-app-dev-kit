// ReplayPoMockAgent: a PO Human Mock, built off the current mock-step agent pattern (a
// StepAgent that WRITES its deliverables into the provided workspace, no cloud/model), but
// for a REPLAY orchestration , instead of inventing content it copies the human PO's
// RECORDED authoring from a scenario corpus into the workspace. This is exactly how a Human
// PO's first step is faithfully re-materialized offline: the recorded product-overview.md /
// nfrs.md / design-brief.md become the turn-1 outputs the spec-author then consumes.
//
// It is a StepAgent (same seam as ClaudeStepAgent + the test mock), so ManifestStep + the
// StepExecutor drive it identically , the Template Method does not know or care that this
// step is a deterministic replay rather than a live model turn. That is the point of the
// contract: a step is a step.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { StepAgent, AgentInvocation } from "./spec-author-breakdown-step-types.js";

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
export interface ReplayPoMockOptions {
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
export function makeReplayPoMockAgent(opts: ReplayPoMockOptions): StepAgent {
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
