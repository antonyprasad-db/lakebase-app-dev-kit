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

import { ClaudeStepAgent, type AgentLevers } from "../../consort/orchestrator/agents/claude-step-agent.js";
import { FUNCTIONAL_THRESHOLD, SEMANTIC_THRESHOLD, type SemanticJudge, type BuildOutputKind } from "../../consort/evaluation/semantic-gate.js";
import { runExperimentsInParallel } from "../../consort/experiment/parallel-runner.js";
import type { StepManifest } from "../../consort/orchestrator/steps/manifest.js";
import type { StepAgent } from "../../consort/orchestrator/agents/agent-types.js";
import type { ManifestTurn } from "../../consort/orchestrator/runners/manifest-runner.js";
import type { RoleChain } from "../../consort/optimize/role-chains.js";
import type { RoleCandidate, RoleLeverPatch } from "./role-levers.js";
import type { RoleTelemetry } from "../../consort/optimize/role-telemetry.js";

/** What one chain run returns: the turns PLUS the PRESERVED produced-artifact tree ({relpath ->
 *  contents}, every file the run wrote, captured before teardown). The whole tree is kept , a
 *  run's outputs must survive so the result is reproducible + re-judgeable, not just its
 *  telemetry (the preserve-experiment-artifacts rule). The quality gate scores the primary file. */
export interface ChainRunResult {
  turns: ManifestTurn[];
  producedArtifacts: Record<string, string>;
}

/** The runner seam: run ONE chain with an optional per-manifest agent override + return the
 *  turns + the preserved artifact tree. The candidateId is passed for logging/routing. The live
 *  CLI binds runRoleChainLive; tests bind a fake. */
export type ChainRunner = (
  chain: RoleChain,
  agentFor: (m: StepManifest) => StepAgent | undefined,
  candidateId: string,
) => Promise<ChainRunResult>;

/** The QUALITY gate config: score the candidate's captured artifact against a recorded baseline
 *  via the injected judge (reuses the shared evaluation SemanticJudge). `kind` picks the
 *  functional-equivalence prompt (tests/code) vs the semantic-intent prompt (undefined). A
 *  candidate below `threshold` is conformant but THINNER than the baseline , not winner-eligible. */
export interface QualityGate {
  referenceText: string;
  judge: SemanticJudge;
  kind?: BuildOutputKind;
  threshold?: number;
}

/** One candidate's measured outcome. `gatePassed` is the conformance bar (no violations + the
 *  artifact produced + the chain terminated at design-complete); `qualityPassed` is the
 *  quality-vs-baseline bar (undefined when no quality gate ran); `telemetry` is the trial record;
 *  `disqualified` (+ reason) marks a crash or a chain that never reached the live turn. */
export interface SweepTrial {
  candidateId: string;
  levers: RoleLeverPatch;
  gatePassed: boolean;
  qualityPassed?: boolean;
  telemetry?: RoleTelemetry;
  /** The PRESERVED produced-artifact tree for this candidate ({relpath -> contents}), so the
   *  caller persists the actual outputs to a durable per-candidate dir , not just telemetry.
   *  Empty on a disqualified/crashed candidate that produced nothing. */
  producedArtifacts?: Record<string, string>;
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
      ...(patch.session !== undefined ? { session: patch.session } : {}),
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

/** Options for a sweep: progress hooks + an OPTIONAL quality gate (score each conformant
 *  candidate's produced artifact against a recorded baseline). Both optional , omitting quality
 *  is the conformance-only sweep (prior behavior). Back-compat: a bare SweepHooks is accepted.
 *  `concurrency` caps in-flight candidates: 1 (default) = the sequential loop, byte-identical to
 *  the prior behavior; >1 fans candidates out over runExperimentsInParallel. Safe to parallelize
 *  because each candidate's runChain (runIntegrationChain) mkdtemps its OWN isolated workspace and
 *  the candidate levers ride IN-MEMORY on the ClaudeStepAgent , no shared config file / env / .md. */
export interface SweepOptions extends SweepHooks {
  quality?: QualityGate;
  concurrency?: number;
}

/** Run ONE candidate end to end: chain run + conformance telemetry + optional quality gate. NEVER
 *  throws , a crash (infra error, a chain that never reached the live turn) becomes a disqualified
 *  SweepTrial, so one bad candidate never aborts the sweep (the optimize lesson) and never rejects
 *  into the parallel pool. Pure w.r.t. shared state: the only mutation is inside runChain's own
 *  mkdtemp workspace. */
async function runOneCandidate(
  chain: RoleChain,
  candidate: RoleCandidate,
  runChain: ChainRunner,
  quality: QualityGate | undefined,
): Promise<SweepTrial> {
  try {
    const { turns, producedArtifacts } = await runChain(chain, agentForCandidate(chain, candidate.levers), candidate.id);
    const { gatePassed, telemetry } = trialTelemetry(chain, candidate, turns);
    // PRESERVE the produced artifacts on the trial so the caller persists the actual outputs.
    const trial: SweepTrial = { candidateId: candidate.id, levers: candidate.levers, gatePassed, telemetry, producedArtifacts };
    // QUALITY gate: for a conformant candidate whose PRIMARY artifact is present + a gate is
    // configured. Score the primary file vs the baseline; below threshold = conformant-but-
    // thinner, not winner-eligible. The primary is chain.outputFile within the preserved tree.
    const primary = producedArtifacts[chain.outputFile];
    if (quality && gatePassed && primary !== undefined) {
      const threshold = quality.threshold ?? (quality.kind ? FUNCTIONAL_THRESHOLD : SEMANTIC_THRESHOLD);
      const verdict = await quality.judge({
        step: "test-list" as never,
        reference: quality.referenceText,
        candidate: primary,
        ...(quality.kind ? { functional: quality.kind } : {}),
      });
      // DISCRIMINATOR verdict (a build sweep whose judge returns a classification): the pass is
      // CLASSIFICATION-driven, not score>=threshold. A clean "equivalent"/accept is the BEST
      // outcome (converged with no self-heal), viable "superseded-shift"/"regression"+fix also
      // pass; only "insufficient" fails. Record the classification/nextStep so the report can
      // surface a clean-converged candidate as a POSITIVE, not merely "passed".
      const disc = verdict as { classification?: string; nextStep?: string };
      if (disc.classification) {
        trial.qualityPassed = disc.classification !== "insufficient";
        if (trial.telemetry) {
          trial.telemetry.semanticScore = verdict.score;
          trial.telemetry.classification = disc.classification;
          if (disc.nextStep) trial.telemetry.nextStep = disc.nextStep;
        }
      } else {
        trial.qualityPassed = verdict.score >= threshold;
        if (trial.telemetry) trial.telemetry.semanticScore = verdict.score;
      }
    }
    return trial;
  } catch (e) {
    return {
      candidateId: candidate.id,
      levers: candidate.levers,
      gatePassed: false,
      disqualified: true,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function runRoleSweep(
  chain: RoleChain,
  candidates: RoleCandidate[],
  runChain: ChainRunner,
  options: SweepOptions = {},
): Promise<SweepTrial[]> {
  const hooks = options;
  const quality = options.quality;
  const concurrency = Math.max(1, options.concurrency ?? 1);
  const total = candidates.length;

  // Sequential (concurrency 1): the prior behavior, byte-identical , baseline first, onStart then
  // onDone per candidate in order. Kept as its own path so the default sweep is unchanged.
  if (concurrency === 1) {
    const trials: SweepTrial[] = [];
    let index = 0;
    for (const candidate of candidates) {
      index += 1;
      hooks.onStart?.(candidate, index, total);
      const trial = await runOneCandidate(chain, candidate, runChain, quality);
      trials.push(trial);
      hooks.onDone?.(trial, index, total);
    }
    return trials;
  }

  // Parallel: fan candidates out over the bounded-concurrency pool. Each candidate maps to one
  // experiment keyed by its 1-based index (so results re-sort to candidate order regardless of
  // completion order). runOneCandidate never throws, so the pool's failure path never fires; the
  // hooks fire around each candidate's own run. Isolation is by runChain's per-call mkdtemp.
  const trialByIndex = new Map<number, SweepTrial>();
  await runExperimentsInParallel<SweepTrial>({
    concurrency,
    experiments: candidates.map((_, i) => ({ slug: String(i + 1) })),
    runner: async ({ slug }) => {
      const index = Number(slug);
      const candidate = candidates[index - 1];
      hooks.onStart?.(candidate, index, total);
      const trial = await runOneCandidate(chain, candidate, runChain, quality);
      trialByIndex.set(index, trial);
      hooks.onDone?.(trial, index, total);
      return trial;
    },
  });
  // Re-sort into candidate (baseline-first) order , the pool returns completion order.
  return candidates.map((_, i) => trialByIndex.get(i + 1)!);
}
