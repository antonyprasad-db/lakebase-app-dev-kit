// optimize-harness: runChampionWalk, the sequential per-handoff champion walk
// that is the heart of the optimization re-record. For each handoff K:
//
//   1. Snapshot the pre-turn state ONCE (design .sftdd copy, or build SHA + fork).
//   2. For each candidate, run N trials from that IDENTICAL state, restoring
//      after every trial so the next candidate starts from the same point.
//   3. Gate + time each trial. A candidate that fails the gate on ANY trial is
//      disqualified (it can never pass a weaker check than baseline).
//   4. Keep the FASTEST gate-passing candidate (median of its passing trials;
//      tie-break lower cost, then baseline). If nothing beats baseline, baseline
//      wins , the corpus keeps the honest turn.
//   5. Overlay the winner ONCE more with recording on (recordWinner), so the
//      surviving corpus captures it as a normal turn, and continue from there.
//
// The engine is PURE ORCHESTRATION over injected steps (ChampionWalkDeps), so the
// decision logic is unit-tested with no cloud/model/git. The CLI (optimize.cli.ts)
// wires the real steps: snapshot via optimize-snapshot, runTrial via
// applyCandidateConfig + overlayAgent + planNextAction + execRunner + the gate
// checkers, and recordWinner via the same run with LAKEBASE_SFTDD_RECORD_* set.

import type { Candidate } from "./optimize-candidates.js";
import { BASELINE_CANDIDATE_ID } from "./optimize-candidates.js";

/** One handoff to optimize (a single role turn at a point in the walk). */
export interface HandoffPlan {
  /** Stable id, e.g. "S1-green" / "S1-review" (also the experiments/ subdir). */
  id: string;
  role: string;
  story?: string;
  /** The build turn mode (green/review/refactor/...); absent for design turns. */
  buildMode?: string;
}

/** The measured outcome of running one candidate once. */
export interface TrialResult {
  /** Did the trial pass the SAME gate the baseline must pass? */
  gatePassed: boolean;
  /** Wall-clock for the turn (ms) , the thing being optimized. */
  durationMs: number;
  /** Dollar cost of the turn (tie-breaker + report). */
  costUsd: number;
  /** The turn's INPUT (prompt) tokens , the prompt-weight signal. A role whose
   *  turns are slow AND input-heavy is prompt-bound (a trim-the-.md candidate). One
   *  whose input is dominated by cache reads is not. Undefined when unmeasured. */
  inputTokens?: number;
  /** Cache-read tokens (input already cached, cheap + fast). High cache-read vs
   *  input means the prompt weight is amortized , NOT a trim target. */
  cacheReadTokens?: number;
  /** Why the gate failed (present only when gatePassed is false). */
  gateReason?: string;
}

/** A restorable handoff snapshot (design or build), abstracted so the walk does
 *  not care which kind it is. */
export interface HandoffSnapshot {
  restore(): Promise<void>;
  dispose(): void;
}

/** The injected steps the walk orchestrates. Hermetic in tests; real in the CLI. */
export interface ChampionWalkDeps {
  /** Snapshot the pre-turn state for a handoff (called once per handoff). */
  snapshot(handoff: HandoffPlan): Promise<HandoffSnapshot>;
  /** Run ONE candidate ONE time from the current (restored) state, gate + time it. */
  runTrial(args: { handoff: HandoffPlan; candidate: Candidate; trial: number }): Promise<TrialResult>;
  /** Re-run the winning candidate with recording ON, so the surviving corpus
   *  captures the winner turn. Advances the walk to the winner's state. */
  recordWinner(args: { handoff: HandoffPlan; candidate: Candidate }): Promise<void>;
}

export interface ChampionWalkArgs {
  handoffs: HandoffPlan[];
  candidates: Candidate[];
  /** Trials per candidate (median of passing trials damps model variance). */
  trials: number;
  /** Propose-only: run + gate + rank every candidate and report the winner, but do
   *  NOT call recordWinner (no overlay, no advance). The human then reviews the
   *  ranked outcomes and approves before optimize-apply persists the winner. Default
   *  false (auto-select: the winner is recorded + the walk advances). */
  proposeOnly?: boolean;
}

/** Per-candidate roll-up at one handoff. */
export interface CandidateOutcome {
  candidateId: string;
  /** Median wall-clock over PASSING trials (undefined when disqualified). */
  medianMs?: number;
  /** Median cost over passing trials (tie-breaker). */
  medianCostUsd?: number;
  /** Median INPUT (prompt) tokens over passing trials , the prompt-weight signal
   *  the two-pass plan reads to decide which roles are worth authoring a .md trim
   *  for. Undefined when unmeasured. */
  medianInputTokens?: number;
  /** Median cache-read tokens (amortized prompt weight). */
  medianCacheReadTokens?: number;
  /** Every trial's raw result (for the experiments/ audit trail). */
  trials: TrialResult[];
  /** True when a gate failure on any trial disqualified this candidate. */
  disqualified: boolean;
}

/** The winner of one handoff. */
export interface HandoffWinner {
  candidateId: string;
  medianMs: number;
  medianCostUsd: number;
}

/** The result of optimizing one handoff. */
export interface HandoffResult {
  handoffId: string;
  /** The baseline candidate's median wall-clock (the "before"). */
  baselineMs: number;
  candidates: CandidateOutcome[];
  winner: HandoffWinner;
}

export interface ChampionWalkResult {
  walk: HandoffResult[];
}

/** Run the champion walk over the given handoffs + candidates. */
export async function runChampionWalk(args: ChampionWalkArgs, deps: ChampionWalkDeps): Promise<ChampionWalkResult> {
  const { handoffs, candidates, trials, proposeOnly } = args;
  const walk: HandoffResult[] = [];

  for (const handoff of handoffs) {
    const snap = await deps.snapshot(handoff);
    const outcomes: CandidateOutcome[] = [];
    try {
      for (const candidate of candidates) {
        const results: TrialResult[] = [];
        for (let t = 0; t < trials; t++) {
          const r = await deps.runTrial({ handoff, candidate, trial: t });
          results.push(r);
          // Restore the pre-turn state so the NEXT trial/candidate forks from the
          // identical point (the champion-walk invariant).
          await snap.restore();
        }
        outcomes.push(summarize(candidate.id, results));
      }

      const winner = selectWinner(outcomes);
      const baseline = outcomes.find((o) => o.candidateId === BASELINE_CANDIDATE_ID);
      const baselineMs = baseline?.medianMs ?? winner.medianMs;

      // Overlay the winner once more, recorded, and advance to its state , UNLESS
      // propose-only, where the human approves the ranked winner first (then
      // optimize-apply persists it). Propose-only leaves the corpus + state
      // untouched: only the experiments/ audit trail + the ranked report are produced.
      if (!proposeOnly) {
        const winnerCandidate = candidates.find((c) => c.id === winner.candidateId)!;
        await deps.recordWinner({ handoff, candidate: winnerCandidate });
      }

      walk.push({ handoffId: handoff.id, baselineMs, candidates: outcomes, winner });
    } finally {
      snap.dispose();
    }
  }

  return { walk };
}

/** Roll up one candidate's trials: median wall-clock + cost over PASSING trials;
 *  disqualified if any trial failed the gate. */
function summarize(candidateId: string, trials: TrialResult[]): CandidateOutcome {
  const disqualified = trials.some((t) => !t.gatePassed);
  if (disqualified) return { candidateId, trials, disqualified: true };
  const passing = trials.filter((t) => t.gatePassed);
  const inputs = passing.map((t) => t.inputTokens).filter((n): n is number => typeof n === "number");
  const cacheReads = passing.map((t) => t.cacheReadTokens).filter((n): n is number => typeof n === "number");
  return {
    candidateId,
    medianMs: median(passing.map((t) => t.durationMs)),
    medianCostUsd: median(passing.map((t) => t.costUsd)),
    ...(inputs.length ? { medianInputTokens: median(inputs) } : {}),
    ...(cacheReads.length ? { medianCacheReadTokens: median(cacheReads) } : {}),
    trials,
    disqualified: false,
  };
}

/** Pick the fastest QUALIFIED candidate: min median wall-clock, tie-break lower
 *  median cost, then prefer the baseline id (a candidate must strictly beat
 *  baseline to displace it, so a wash keeps the honest baseline turn). */
function selectWinner(outcomes: CandidateOutcome[]): HandoffWinner {
  const qualified = outcomes.filter((o) => !o.disqualified && o.medianMs !== undefined);
  if (qualified.length === 0) {
    // Degenerate: nothing qualified at all (should not happen when baseline runs
    // honestly). Report the baseline id with zeroed metrics so the walk continues.
    return { candidateId: BASELINE_CANDIDATE_ID, medianMs: 0, medianCostUsd: 0 };
  }
  qualified.sort((a, b) => {
    if (a.medianMs !== b.medianMs) return a.medianMs! - b.medianMs!;
    if (a.medianCostUsd !== b.medianCostUsd) return a.medianCostUsd! - b.medianCostUsd!;
    // Final tie-break: prefer the baseline (keep the honest turn on a dead heat).
    if (a.candidateId === BASELINE_CANDIDATE_ID) return -1;
    if (b.candidateId === BASELINE_CANDIDATE_ID) return 1;
    return 0;
  });
  const w = qualified[0];
  return { candidateId: w.candidateId, medianMs: w.medianMs!, medianCostUsd: w.medianCostUsd! };
}

/** Median of a numeric list (mean of the two middle values for an even count). */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
