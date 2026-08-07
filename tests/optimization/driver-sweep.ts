// driver-sweep: run a driver-GREEN lever sweep over the live driver-green harness.
// Each candidate (a lever patch from role-levers) runs ONE full driver-GREEN cycle with the
// levers patched, gates the result on honest-GREEN (the same bar the live test asserts), and
// persists the trial (duration + classification). A crashing candidate is DISQUALIFIED. The
// sweep uses the existing runDriverGreenLive harness with per-candidate overrides (experimentSlug,
// branch, leverOverride), drives concurrency via runExperimentsInParallel, and enforces teardown
// + orphan-sweep even on throw.
//
// The harness runner is injected so the sweep is unit-testable hermetically (a fake runner
// returns canned results); the live CLI passes runDriverGreenLive. Isolation: each candidate
// runs in its own worktree + Lakebase branch (per the #589 model), with MANDATORY cleanup in
// finally + orphan-sweep backstop.

import { runExperimentsInParallel } from "../../consort/experiment/parallel-runner.js";
import { sweepOrphanProjects, DEFAULT_TEST_PROJECT_PREFIXES, type DeleteLakebaseProjectFn } from "../../consort/setup/orphan-project-sweep.js";
import { classifyBuildTrial } from "../../consort/optimize/optimize-build-trial.js";
import type { RoleCandidate, RoleLeverPatch } from "./role-levers.js";

/** The runner seam: run ONE driver-GREEN candidate + return the result. The candidateId is
 *  passed for logging; the full lever patch is passed for non-agent levers (currently unused,
 *  but kept for consistency with role-sweep). */
export type DriverGreenRunner = (
  candidateId: string,
  levers: RoleLeverPatch,
  experimentSlug: string,
  branch: string,
) => Promise<{ honestGreen: boolean; durationMs: number; producedCodeDir: string; escalated?: boolean; classify: { outcome: string; reason?: string } }>;

/** One candidate's measured outcome. */
export interface DriverSweepTrial {
  candidateId: string;
  levers: RoleLeverPatch;
  honestGreen: boolean;
  durationMs: number;
  classify: { outcome: string; reason?: string };
  disqualified?: boolean;
  reason?: string;
}

/** Hooks for progress + post-run evidence persistence. */
export interface DriverSweepHooks {
  /** Called BEFORE each candidate runs. */
  onStart?(candidate: RoleCandidate, index: number, total: number): void;
  /** Called AFTER each candidate completes (pass or disqualify), with its trial. */
  onDone?(trial: DriverSweepTrial, index: number, total: number): void;
}

/** Options for a driver-green sweep: progress hooks + concurrency. */
export interface DriverSweepOptions extends DriverSweepHooks {
  concurrency?: number;
  /** Path to find/cleanup orphaned test projects (default: process.cwd()). */
  orphanParentDir?: string;
  /** Injected Lakebase project deletion seam (for testing). */
  deleteLakebaseProject?: DeleteLakebaseProjectFn;
}

/** Run ONE candidate end to end: driver-GREEN execution + classification. NEVER throws;
 *  a crash becomes a disqualified trial. Pure w.r.t. shared state except for the candidate's
 *  own experiment branch + worktree cleanup. */
async function runOneCandidate(
  candidate: RoleCandidate,
  runDriver: DriverGreenRunner,
): Promise<DriverSweepTrial> {
  try {
    const slug = `s3-driver-green-${candidate.id}`;
    const branch = `experiment/S3-driver-${candidate.id}`;
    const result = await runDriver(candidate.id, candidate.levers, slug, branch);
    return {
      candidateId: candidate.id,
      levers: candidate.levers,
      honestGreen: result.honestGreen,
      durationMs: result.durationMs,
      classify: result.classify,
    };
  } catch (e) {
    return {
      candidateId: candidate.id,
      levers: candidate.levers,
      honestGreen: false,
      durationMs: 0,
      classify: { outcome: "systemic", reason: `exception: ${e instanceof Error ? e.message : String(e)}` },
      disqualified: true,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Run a full driver-GREEN sweep: every candidate, each a FULL driver-GREEN cycle with the
 * candidate's levers patched (experimentSlug + branch + leverOverride). Returns one DriverSweepTrial
 * per candidate. A candidate whose run THROWS is disqualified + the sweep continues. Concurrency
 * is bounded; each candidate's branch + worktree are torn down in finally. After the pool, calls
 * sweepOrphanProjects and asserts zero orphans (logs the report).
 */
export async function runDriverGreenSweep(
  candidates: RoleCandidate[],
  runDriver: DriverGreenRunner,
  options: DriverSweepOptions = {},
): Promise<DriverSweepTrial[]> {
  const hooks = options;
  const concurrency = Math.max(1, options.concurrency ?? 1);
  const orphanParentDir = options.orphanParentDir ?? process.cwd();
  const total = candidates.length;

  // Sequential (concurrency 1): baseline-first, byte-identical to prior behavior.
  if (concurrency === 1) {
    const trials: DriverSweepTrial[] = [];
    let index = 0;
    for (const candidate of candidates) {
      index += 1;
      hooks.onStart?.(candidate, index, total);
      const trial = await runOneCandidate(candidate, runDriver);
      trials.push(trial);
      hooks.onDone?.(trial, index, total);
    }
    // After the sequential run, sweep orphans.
    if (options.deleteLakebaseProject) {
      const orphaned = await sweepOrphanProjects({
        parentDir: orphanParentDir,
        deleteLakebaseProject: options.deleteLakebaseProject,
        prefixes: [...DEFAULT_TEST_PROJECT_PREFIXES, "dg-live-"],
      });
      if (orphaned.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`[driver-sweep] orphan sweep: cleaned up ${orphaned.length} leaked projects`);
      }
    }
    return trials;
  }

  // Parallel: fan candidates out over the bounded-concurrency pool. Each candidate maps to one
  // experiment keyed by its 1-based index. runOneCandidate never throws, so results never flow
  // to the pool's failure path; hooks fire around each candidate's own run. Isolation is by
  // each candidate's unique experimentSlug + branch (MANDATORY in runDriver).
  const trialByIndex = new Map<number, DriverSweepTrial>();
  await runExperimentsInParallel<DriverSweepTrial>({
    concurrency,
    experiments: candidates.map((_, i) => ({ slug: String(i + 1) })),
    runner: async ({ slug }) => {
      const index = Number(slug);
      const candidate = candidates[index - 1];
      hooks.onStart?.(candidate, index, total);
      const trial = await runOneCandidate(candidate, runDriver);
      trialByIndex.set(index, trial);
      hooks.onDone?.(trial, index, total);
      return trial;
    },
  });
  // Re-sort into candidate (baseline-first) order.
  const trials = candidates.map((_, i) => trialByIndex.get(i + 1)!);

  // After the parallel run, sweep orphans.
  if (options.deleteLakebaseProject) {
    const orphaned = await sweepOrphanProjects({
      parentDir: orphanParentDir,
      deleteLakebaseProject: options.deleteLakebaseProject,
      prefixes: [...DEFAULT_TEST_PROJECT_PREFIXES, "dg-live-"],
    });
    if (orphaned.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[driver-sweep] orphan sweep: cleaned up ${orphaned.length} leaked projects`);
    }
  }

  return trials;
}
