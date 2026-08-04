// role-sweep: run a per-role lever sweep over the isolation substrate. For each candidate (a
// lever patch from role-levers), run the role's chain ONCE with the live-role agent's config
// patched (model/effort/tool scope), gate the result on conformance (the SAME bar the live test
// asserts), and record a RoleTelemetry trial. A crashing candidate is DISQUALIFIED + the sweep
// continues (the optimize lesson: one bad candidate must not kill the run). The baseline is just
// the first candidate (empty patch), measured under the same machinery , an apples-to-apples
// "before". Ranking is role-sweep-report's job; this only runs + gates + records.
//
// The chain RUNNER is injected (runChain) so the sweep is unit-testable hermetically (a fake
// runner returns canned turns); the live CLI passes runRoleChainLive. Applying a candidate's
// patch = build a ClaudeStepAgent from the live manifest's base agent.config MERGED with the
// patch, and return it from agentFor for the live-role manifest (undefined elsewhere , the seed
// falls through to its replay).

import { ClaudeStepAgent, type AgentLevers } from "../agents/claude-step-agent.js";
import type { StepManifest } from "../manifest/step-manifest.js";
import type { StepAgent } from "../agents/agent-types.js";
import type { ManifestTurn } from "../manifest/manifest-runner.js";
import type { RoleChain } from "./role-chains.js";
import type { RoleCandidate, RoleLeverPatch } from "./role-levers.js";
import type { RoleTelemetry } from "./role-telemetry.js";

/** The runner seam: run ONE chain with an optional per-manifest agent override + return the turns.
 *  The live CLI binds runRoleChainLive; tests bind a fake. */
export type ChainRunner = (
  chain: RoleChain,
  agentFor: (m: StepManifest) => StepAgent | undefined,
) => Promise<ManifestTurn[]>;

/** One candidate's measured outcome. `gatePassed` is the conformance bar (no violations + the
 *  artifact produced + the chain terminated at design-complete); `telemetry` is the trial record;
 *  `disqualified` (+ reason) marks a crash or a chain that never reached the live turn. */
export interface SweepTrial {
  candidateId: string;
  levers: RoleLeverPatch;
  gatePassed: boolean;
  telemetry?: RoleTelemetry;
  disqualified?: boolean;
  reason?: string;
}

/** Build the agentFor override for a candidate: for the live-role manifest, a ClaudeStepAgent
 *  from the manifest's base agent.config MERGED with the candidate patch; undefined otherwise. */
function agentForCandidate(chain: RoleChain, patch: RoleLeverPatch): (m: StepManifest) => StepAgent | undefined {
  const liveId = `${chain.dir}-live`;
  return (m: StepManifest) => {
    if (m.id !== liveId) return undefined; // seed + others fall through to the catalogue
    const base = (m.agent?.config ?? {}) as Partial<AgentLevers> & { role?: string };
    const levers: AgentLevers = {
      role: base.role ?? m.role,
      ...(base.model !== undefined ? { model: base.model } : {}),
      ...(base.effort !== undefined ? { effort: base.effort } : {}),
      ...(base.session !== undefined ? { session: base.session } : {}),
      ...(base.allowedTools !== undefined ? { allowedTools: base.allowedTools } : {}),
      ...(base.disallowedTools !== undefined ? { disallowedTools: base.disallowedTools } : {}),
      // the candidate patch WINS over the base for the swept axes
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.effort !== undefined ? { effort: patch.effort } : {}),
      ...(patch.allowedTools !== undefined ? { allowedTools: patch.allowedTools } : {}),
      ...(patch.disallowedTools !== undefined ? { disallowedTools: patch.disallowedTools } : {}),
    };
    return new ClaudeStepAgent(levers);
  };
}

/** Assemble a RoleTelemetry from a candidate's live turns (the last turn is the live role's). */
function trialTelemetry(chain: RoleChain, candidate: RoleCandidate, turns: ManifestTurn[]): { gatePassed: boolean; telemetry: RoleTelemetry } {
  const liveTurn = turns[turns.length - 1];
  const t = liveTurn?.telemetry;
  const usage = t?.agentResult?.usage;
  const producedOk = !!liveTurn && liveTurn.result.producedPaths.some((p) => p.endsWith(chain.outputFile));
  const cleanViolations = !!liveTurn && liveTurn.result.violations.length === 0;
  const terminated = liveTurn?.result.bounded.action.kind === "design-complete";
  const gatePassed = producedOk && cleanViolations && terminated;
  const telemetry: RoleTelemetry = {
    role: t?.role ?? chain.dir.replace(/-chain$/, ""),
    chain: `${chain.dir}#${candidate.id}`,
    // The candidate's model (when it patches one) is the meaningful "model this trial ran on";
    // absent patch => baseline model, which the report reads from the baseline trial.
    ...(candidate.levers.model ? { model: candidate.levers.model } : {}),
    levers: { ...candidate.levers },
    outerDurationMs: t?.outerDurationMs ?? 0,
    ...(usage
      ? {
          agent: {
            ...(usage.numTurns !== undefined ? { numTurns: usage.numTurns } : {}),
            ...(usage.durationMs !== undefined ? { durationMs: usage.durationMs } : {}),
            ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            ...(usage.cacheReadTokens !== undefined ? { cacheReadTokens: usage.cacheReadTokens } : {}),
            ...(usage.cacheCreationTokens !== undefined ? { cacheCreationTokens: usage.cacheCreationTokens } : {}),
          },
        }
      : {}),
    outcome: gatePassed ? "produced" : (liveTurn?.result.bounded.action.kind ?? "no-live-turn"),
    producedFile: chain.outputFile,
    ...(t?.agentResult?.finalText ? { transcript: { prompt: chain.prompt, finalText: t.agentResult.finalText, tools: [] } } : {}),
  };
  return { gatePassed, telemetry };
}

/**
 * Run a full per-role sweep: every candidate, in order (baseline first), each a real live chain
 * run with the candidate's levers patched onto the live-role agent. Returns one SweepTrial per
 * candidate. A candidate whose run THROWS (a crash, an infra error) is disqualified with the
 * error message + the sweep continues , never aborts the whole run on one bad candidate.
 */
export interface SweepHooks {
  /** Called BEFORE each candidate runs (progress logging). */
  onStart?(candidate: RoleCandidate, index: number, total: number): void;
  /** Called AFTER each candidate completes (pass, gate-fail, or disqualify), with its trial.
   *  The CLI persists the trial's telemetry HERE , incrementally , so a long sweep that is
   *  interrupted still has every completed candidate's record on disk (not batched at the end). */
  onDone?(trial: SweepTrial, index: number, total: number): void;
}

export async function runRoleSweep(
  chain: RoleChain,
  candidates: RoleCandidate[],
  runChain: ChainRunner,
  hooks: SweepHooks = {},
): Promise<SweepTrial[]> {
  const trials: SweepTrial[] = [];
  let index = 0;
  for (const candidate of candidates) {
    index += 1;
    hooks.onStart?.(candidate, index, candidates.length);
    let trial: SweepTrial;
    try {
      const turns = await runChain(chain, agentForCandidate(chain, candidate.levers));
      const { gatePassed, telemetry } = trialTelemetry(chain, candidate, turns);
      trial = { candidateId: candidate.id, levers: candidate.levers, gatePassed, telemetry };
    } catch (e) {
      trial = {
        candidateId: candidate.id,
        levers: candidate.levers,
        gatePassed: false,
        disqualified: true,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
    trials.push(trial);
    hooks.onDone?.(trial, index, candidates.length);
  }
  return trials;
}
