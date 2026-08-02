// optimize-live: assemble the REAL champion-walk deps (snapshot + runTrial +
// recordWinner) over the drive, with only the cloud/model LEAVES injected. Every
// other step , candidate config write, agent overlay, gate evaluation, state
// restore, experiment-record write , is real, so the full composition is validated
// HERMETICALLY on a design handoff (no cloud): a fake spawnTurn that seeds the
// artifact + a fake clock prove the walk applies each candidate, gates it, keeps
// the fastest, and restores between candidates. The live CLI supplies the real
// spawnTurn (a `claude -p` role subprocess via execRunner) + forkBranch
// (cutExperiment re-fork).
//
// SAFETY: a trial NEVER sets LAKEBASE_SFTDD_REPLAY_BUILD_DIR (that fakes GREEN);
// every build trial runs the real honest-GREEN verifier via the drive's own cycle
// commands. The harness only forks/drops throwaway branches , never pushes/merges.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { applyCandidateConfig, type Candidate } from "./optimize-candidates.js";
import { overlayAgent } from "./optimize-agent-overlay.js";
import { evaluateDesignGate, type GateOutcome } from "./optimize-gate.js";
import { snapshotDesign, snapshotBuild, turnMutatesDb, type BuildSnapshotDeps } from "./optimize-snapshot.js";
import type { ChampionWalkDeps, HandoffPlan, HandoffSnapshot, TrialResult, HandoffResult, ChampionWalkResult } from "./optimize-harness.js";
import { defaultSftddConfig, loadSftddConfig, writeSftddConfig, type SftddConfigFile } from "./sftdd-config.js";
import { isBuildHandoff, actionToHandoffPlan } from "./optimize.cli.js";
import type { DriveEffectsConfig } from "./orchestrator-effects.js";
import { actionLane, type WorkflowAction } from "./orchestrator-drive.js";
import { cutExperiment, type CutExperimentArgs } from "./experiment.js";
import { readEscalations } from "./escalation.js";
import { readAgentLog } from "./agent-log.js";

/** Spawn ONE role turn for a candidate (the cloud/model leaf). The real impl runs
 *  the handoff's `claude -p` command through execRunner (applying the candidate's
 *  taskSuffix / contextPackSuffix / tool-scope via the P2a seams). It throws if the
 *  turn errors. `record` true => the recorder env is on (winner capture). */
export type SpawnTurn = (args: {
  handoff: HandoffPlan;
  candidate: Candidate;
  record: boolean;
}) => Promise<void>;

/** Report a build turn's honest gate outcome (pass/fail + reason). The real impl
 *  reads the post-turn cycle state (green-failure / escalations). Design turns use
 *  evaluateDesignGate instead, so this is optional. */
export type GateBuildTurn = (args: { handoff: HandoffPlan }) => GateOutcome;

export interface OptimizeLiveCtx {
  projectDir: string;
  sftddDir: string;
  featureId: string;
  /** Where discarded attempts + champion-walk.json are written (never the corpus). */
  experimentsDir: string;
  /** The cloud/model leaf: spawn one role turn. */
  spawnTurn: SpawnTurn;
  /** Monotonic clock (ms). Injected so timing is deterministic in tests. */
  now: () => number;
  /** Build-turn gate (optional; design turns use evaluateDesignGate). */
  gateBuild?: GateBuildTurn;
  /** Build-snapshot substrate (git + re-fork). Required only for build handoffs. */
  buildSnapshotDeps?: BuildSnapshotDeps;
  /** Read the just-spawned turn's prompt-weight tokens (input + cache-read) from
   *  the project's turn.usage. Optional; the CLI wires readLastTurnTokens (agent-log
   *  reader). Absent in the hermetic tests, which don't need real token counts. */
  readTurnTokens?(args: { handoff: HandoffPlan }): { inputTokens?: number; cacheReadTokens?: number } | undefined;
}

/** The on-disk config path relative to the project root. */
function readConfig(projectDir: string): SftddConfigFile {
  return loadSftddConfig(projectDir) ?? defaultSftddConfig();
}

/** Apply a candidate's config overrides (+ env) to the project for one turn, and
 *  return a restore() that puts the baseline config + env back. */
function applyCandidate(ctx: OptimizeLiveCtx, candidate: Candidate): () => void {
  const baseline = readConfig(ctx.projectDir);
  const merged = applyCandidateConfig(baseline, candidate);
  writeSftddConfig(ctx.projectDir, merged, { force: true });

  // Candidate env (e.g. CONTEXT_FREE_FRACTION) rides on process.env for the turn.
  const priorEnv: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(candidate.env ?? {})) {
    priorEnv[k] = process.env[k];
    process.env[k] = v;
  }

  // Agent overlay (Family-2): swap the role .md for the turn.
  const overlay = candidate.content?.agentOverlay
    ? overlayAgent({ projectDir: ctx.projectDir, role: candidate.content.agentOverlay.role, markdown: candidate.content.agentOverlay.markdown })
    : undefined;

  return () => {
    writeSftddConfig(ctx.projectDir, baseline, { force: true });
    for (const [k, v] of Object.entries(priorEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    overlay?.restore();
  };
}

/** Record one trial's audit trail under experiments/<handoff>/<candidate>/trial-<n>. */
function writeTrialRecord(ctx: OptimizeLiveCtx, handoff: HandoffPlan, candidate: Candidate, trial: number, result: TrialResult): void {
  const dir = join(ctx.experimentsDir, handoff.id, candidate.id, `trial-${trial}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "candidate.json"), JSON.stringify(candidate, null, 2) + "\n");
  writeFileSync(join(dir, "result.json"), JSON.stringify(result, null, 2) + "\n");
}

/** Assemble the real champion-walk deps for the drive. */
export function makeChampionWalkDeps(ctx: OptimizeLiveCtx): ChampionWalkDeps {
  return {
    async snapshot(handoff: HandoffPlan): Promise<HandoffSnapshot> {
      if (isBuildHandoff(handoff)) {
        if (!ctx.buildSnapshotDeps) throw new Error(`build handoff ${handoff.id} needs buildSnapshotDeps (git + re-fork)`);
        const reFork = turnMutatesDb(handoff.buildMode, handoff.role);
        const snap = await snapshotBuild({ projectDir: ctx.projectDir, sftddDir: ctx.sftddDir, story: handoff.story ?? "" }, ctx.buildSnapshotDeps);
        return {
          restore: () => snap.restore({ reFork }),
          dispose: () => {},
        };
      }
      // Design handoff: pure .sftdd copy/replace.
      const snap = snapshotDesign({ sftddDir: ctx.sftddDir });
      return { restore: async () => snap.restore(), dispose: () => snap.dispose() };
    },

    async runTrial({ handoff, candidate, trial }): Promise<TrialResult> {
      const restoreCandidate = applyCandidate(ctx, candidate);
      const started = ctx.now();
      let result: TrialResult;
      try {
        await ctx.spawnTurn({ handoff, candidate, record: false });
        const durationMs = ctx.now() - started;
        const gate: GateOutcome = isBuildHandoff(handoff)
          ? (ctx.gateBuild ?? (() => ({ passed: true })))({ handoff })
          : evaluateDesignGate({ sftddDir: ctx.sftddDir, featureId: ctx.featureId, handoff });
        // Prompt-weight signal (the pass-2 trim-target input): read the turn's
        // input/cache-read tokens from the just-emitted turn.usage. Best-effort.
        const tokens = ctx.readTurnTokens?.({ handoff });
        result = {
          gatePassed: gate.passed,
          durationMs,
          costUsd: 0,
          ...(tokens?.inputTokens !== undefined ? { inputTokens: tokens.inputTokens } : {}),
          ...(tokens?.cacheReadTokens !== undefined ? { cacheReadTokens: tokens.cacheReadTokens } : {}),
          ...(gate.reason ? { gateReason: gate.reason } : {}),
        };
      } catch (e) {
        const durationMs = ctx.now() - started;
        result = { gatePassed: false, durationMs, costUsd: 0, gateReason: e instanceof Error ? e.message : String(e) };
      } finally {
        restoreCandidate();
      }
      writeTrialRecord(ctx, handoff, candidate, trial, result);
      return result;
    },

    async recordWinner({ handoff, candidate }): Promise<void> {
      // Re-run the winner with recording ON, applying its levers, and DO NOT
      // restore , this advances the walk to the winner's state (the surviving turn).
      const restoreCandidate = applyCandidate(ctx, candidate);
      try {
        await ctx.spawnTurn({ handoff, candidate, record: true });
      } finally {
        // Restore the config/env/overlay (levers are a per-turn A/B knob, not a
        // persistent project change); the winner's ARTIFACTS on disk survive.
        restoreCandidate();
      }
      const champ = join(ctx.experimentsDir, "champion-walk.json");
      const prior = existsSync(champ) ? (JSON.parse(readFileSync(champ, "utf8")) as { winners: unknown[] }) : { winners: [] };
      prior.winners.push({ handoffId: handoff.id, candidateId: candidate.id });
      mkdirSync(ctx.experimentsDir, { recursive: true });
      writeFileSync(champ, JSON.stringify(prior, null, 2) + "\n");
    },
  };
}

/** Best-effort teardown of the experiments/ scratch tree. */
export function disposeExperiments(experimentsDir: string): void {
  rmSync(experimentsDir, { recursive: true, force: true });
}

/** Thread a candidate's Family-2 content variant into a DriveEffectsConfig via the
 *  P2a default-off hooks, so ONE forked turn sees the injected task/context/tools.
 *  The overlay agent .md is handled separately (applyCandidate, filesystem). Pure:
 *  mutates the passed cfg in place and returns it (the drive builds a fresh cfg per
 *  turn), keeping the seam wiring in one place. */
export function applyContentSeams(cfg: DriveEffectsConfig, content: Candidate["content"]): DriveEffectsConfig {
  if (!content) return cfg;
  if (content.taskSuffix) cfg.taskSuffix = () => content.taskSuffix!;
  if (content.contextPackSuffix) cfg.contextPackSuffix = () => content.contextPackSuffix!;
  if (content.allowedTools?.length) cfg.allowedToolsForRole = () => content.allowedTools;
  if (content.disallowedTools?.length) cfg.disallowedToolsForRole = () => content.disallowedTools;
  return cfg;
}

/** The drive seams the live spawn needs, injected so optimize-live has no hard
 *  dependency on drive.cli (which owns process-level concerns) and stays testable.
 *  The CLI supplies the real trio. */
export interface LiveDriveSeams {
  buildCfg(featureId: string): DriveEffectsConfig;
  execRunner(cfg: DriveEffectsConfig): { run(cmd: unknown): Promise<void> };
  planNextAction(cfg: DriveEffectsConfig): Promise<{ action: unknown; commands: unknown[] }>;
  /** The corpus dir a WINNER capture records into (turns/ + recorded-artifacts/).
   *  A TRIAL (record:false) must NOT record , only the winner. When absent, no turn
   *  records (a pure-timing sweep). This is the single door for "does this turn land
   *  in the corpus", so a losing candidate can never pollute the shippable corpus. */
  recordDir?: string;
}

/** The env var the drive's recorder wrapper + the agent subprocess read to decide
 *  whether (and where) a turn records into the corpus. */
const RECORD_DIR_ENV = "LAKEBASE_SFTDD_RECORD_DIR";

/** Build the REAL spawnTurn: for a candidate, construct a fresh drive cfg, thread
 *  the candidate's content seams, plan the ONE next handoff, and run only that
 *  handoff's commands through execRunner (which spawns the `claude -p` turn + emits
 *  turn.usage).
 *
 *  Recording is gated on the `record` flag , the load-bearing anti-pollution fix.
 *  A champion walk runs N candidates x M TRIALS per handoff; only the WINNER (a
 *  single record:true re-run) may land in the recorded corpus. So this sets
 *  LAKEBASE_SFTDD_RECORD_DIR (which the agent subprocess + the drive recorder read)
 *  ONLY when record is true, and restores the prior env afterward so a winner
 *  capture never leaks recording into the next handoff's trials. A trial
 *  (record:false) runs with the env cleared, so no losing candidate touches the
 *  corpus even if the ambient shell exported RECORD_DIR. NEVER sets
 *  LAKEBASE_SFTDD_REPLAY_BUILD_DIR (that would fake GREEN). */
export function makeLiveSpawnTurn(featureId: string, seams: LiveDriveSeams): SpawnTurn {
  return async ({ candidate, record }) => {
    // Set the recorder env for THIS spawn only: the winner capture records into
    // seams.recordDir; a trial clears it so nothing lands in the corpus. Restore the
    // prior value in a finally so a winner never leaks recording into later trials.
    const prior = process.env[RECORD_DIR_ENV];
    if (record && seams.recordDir) process.env[RECORD_DIR_ENV] = seams.recordDir;
    else delete process.env[RECORD_DIR_ENV];
    try {
      const cfg = applyContentSeams(seams.buildCfg(featureId), candidate.content);
      const runner = seams.execRunner(cfg);
      // planNextAction reads the CURRENT disk state, so it returns exactly the handoff
      // the walk is positioned on (the harness snapshot/restore keeps that position).
      const { commands } = await seams.planNextAction(cfg);
      for (const cmd of commands) await runner.run(cmd);
    } finally {
      if (prior === undefined) delete process.env[RECORD_DIR_ENV];
      else process.env[RECORD_DIR_ENV] = prior;
    }
  };
}

// ── Build-handoff leaves (LIVE CLOUD) ──────────────────────────────────────────
// A build turn mutates git + a paired Lakebase branch + branch DB rows, so its
// snapshot/restore is 3-part (SHA reset + re-fork) and its gate is the honest
// post-turn signal, not a static-artifact check. These wire the real substrate for
// snapshotBuild's injected BuildSnapshotDeps; git + cutExperiment are themselves
// injectable so the wiring is unit-tested with no git repo + no cloud.

/** The injectable git ops a build snapshot needs (raw git; the codebase precedent
 *  is execFileSync("git", ...), there is no reset --hard helper in scm-utils/git). */
export interface BuildGitOps {
  /** The current HEAD sha of the working tree. */
  sha(): Promise<string>;
  /** Hard-reset the working tree to `sha` (discards the candidate's code changes). */
  resetHard(sha: string): Promise<void>;
}

/** Real git ops via execFileSync (matches migrate-artifact-dir.ts's raw-git use). */
export function realBuildGitOps(projectDir: string): BuildGitOps {
  return {
    async sha() {
      return execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectDir, encoding: "utf8" }).trim();
    },
    async resetHard(sha) {
      execFileSync("git", ["reset", "--hard", sha], { cwd: projectDir, stdio: "ignore" });
    },
  };
}

/** Assemble the BuildSnapshotDeps (captureSha / resetHard / reFork) snapshotBuild
 *  needs. reFork ALWAYS drops the candidate's stale paired branch before forking a
 *  clean one (resetStaleBranch), so a re-tried candidate never inherits the prior
 *  attempt's schema (Finding 27). git + the re-fork are injected for the unit test;
 *  the CLI supplies realBuildGitOps + cutExperiment. */
export function makeBuildSnapshotDeps(args: {
  projectDir: string;
  story: string;
  /** cutExperiment args MINUS storyId + resetStaleBranch (supplied here). */
  cutArgs: Omit<CutExperimentArgs, "storyId" | "projectDir" | "resetStaleBranch">;
  git?: BuildGitOps;
  reForkImpl?: (args: CutExperimentArgs) => Promise<unknown>;
}): BuildSnapshotDeps {
  const git = args.git ?? realBuildGitOps(args.projectDir);
  const reFork = args.reForkImpl ?? ((a: CutExperimentArgs) => cutExperiment(a));
  return {
    captureSha: () => git.sha(),
    resetHard: (sha) => git.resetHard(sha),
    reFork: async () => {
      await reFork({
        ...args.cutArgs,
        projectDir: args.projectDir,
        storyId: args.story,
        resetStaleBranch: true,
      } as CutExperimentArgs);
    },
  };
}

/** Advance the drive from the design-complete boundary to sit exactly ON the first
 *  build ROLE turn (navigator RED / driver GREEN), performing the intervening
 *  build-lane SUBSTRATE actions (dispatch, then cut-experiment , which forks the
 *  paired branch, the pre-turn state the snapshot then captures). Returns the
 *  HandoffPlan the walk should sweep, or null when the next action is not in the
 *  build lane (design not complete / a gate is pending , the caller should drive
 *  those first). Plan + perform are injected so this is unit-tested with no cloud.
 *
 *  Only substrate (non-invoke-role) build-lane actions are auto-performed; the
 *  first invoke-role build turn is LEFT unperformed (that is what the walk sweeps).
 *  A bounded loop (maxSteps) guards against a substrate step that never advances. */
export async function positionToBuildHandoff(args: {
  planNext: () => Promise<{ action: WorkflowAction; commands: unknown[] }>;
  perform: (commands: unknown[]) => Promise<void>;
  maxSteps?: number;
}): Promise<HandoffPlan | null> {
  return positionToNextHandoff({ lane: "build", ...args });
}

/** Advance the drive to sit ON the next ROLE turn in a given LANE, performing the
 *  lane's non-role actions to get there (design: project-architect-notes /
 *  surface-gate / approve-gate; build: dispatch / cut-experiment). Returns the role
 *  handoff to sweep, or null at the lane boundary (design-complete, or the plan
 *  left the lane). The target role turn is LEFT unperformed , that is what the walk
 *  sweeps. A cut-experiment (build) is performed here, so its fork is the pre-turn
 *  state the snapshot captures. Bounded loop; plan + perform injected -> hermetic. */
export async function positionToNextHandoff(args: {
  lane: "design" | "build";
  planNext: () => Promise<{ action: WorkflowAction; commands: unknown[] }>;
  perform: (commands: unknown[]) => Promise<void>;
  maxSteps?: number;
}): Promise<HandoffPlan | null> {
  const maxSteps = args.maxSteps ?? 20;
  for (let i = 0; i < maxSteps; i++) {
    const { action, commands } = await args.planNext();
    // Left the target lane (a build action while sweeping design, a gate the sweep
    // does not own) -> boundary reached.
    if (actionLane(action) !== args.lane) return null;
    // A lane TERMINAL (design-complete) shares the lane tag but is not a turn to
    // perform , it is the boundary. It emits no commands; treat it as done.
    if (action.kind === "design-complete") return null;
    // An invoke-role turn in this lane is the target: land here, do NOT perform it.
    const plan = actionToHandoffPlan(action);
    if (plan) return plan;
    // A non-role lane action (design: gate/architect-notes; build: dispatch/
    // cut-experiment): perform it to advance toward the next role turn.
    await args.perform(commands);
  }
  throw new Error(
    `optimize: could not position on a ${args.lane} role turn within ${maxSteps} steps , the lane is not advancing (a stuck non-role action). Check the drive state.`,
  );
}

/** Injected steps for the multi-handoff LANE sweep. positionNext returns the next
 *  role handoff in the lane (or null at the lane boundary); sweepOne champion-walks
 *  ONE handoff and RECORDS its winner (advancing the drive to the winner's state),
 *  returning the per-handoff result. Both are wired by the CLI over the real drive;
 *  the loop's sequencing + advance-guard is unit-tested with them stubbed. */
export interface LaneSweepDeps {
  positionNext(): Promise<HandoffPlan | null>;
  sweepOne(handoff: HandoffPlan): Promise<HandoffResult>;
}

/** Sweep EVERY role handoff in a lane, in order, until its boundary. The design
 *  lane has inter-turn dependencies (a winner's artifact feeds the next turn), so
 *  this is strictly SEQUENTIAL: position on the next handoff, sweep + record its
 *  winner (which advances the drive), then re-position. Guards against a lane that
 *  does not advance (the same handoff id twice running, or exceeding maxHandoffs)
 *  by throwing rather than spinning. */
export async function runLaneSweep(deps: LaneSweepDeps, opts: { maxHandoffs?: number } = {}): Promise<ChampionWalkResult> {
  const maxHandoffs = opts.maxHandoffs ?? 50;
  const walk: HandoffResult[] = [];
  let prevId: string | undefined;
  for (let i = 0; ; i++) {
    if (i >= maxHandoffs) {
      throw new Error(`optimize lane sweep: exceeded ${maxHandoffs} handoffs without reaching the lane boundary (too many).`);
    }
    const handoff = await deps.positionNext();
    if (!handoff) break; // lane boundary reached
    if (handoff.id === prevId) {
      throw new Error(
        `optimize lane sweep: handoff "${handoff.id}" did not advance after its winner was recorded , the drive is stuck (a gate the sweep cannot pass, or a winner that does not change readState). Check the drive state.`,
      );
    }
    const result = await deps.sweepOne(handoff);
    walk.push(result);
    prevId = handoff.id;
  }
  return { walk };
}

/** Read the prompt-weight tokens (input + cache-read) of the LAST turn.usage the
 *  given role emitted, from the project's agent-log. Backs OptimizeLiveCtx.
 *  readTurnTokens , the pass-2 trim-target signal. Best-effort: returns undefined
 *  when there is no turn.usage yet (older log / turn errored before usage). A role
 *  whose last turn had high input_tokens but was slow is prompt-bound; one whose
 *  input is dominated by cache_read_tokens is not. */
export function readLastTurnTokens(sftddDir: string, role: string): { inputTokens?: number; cacheReadTokens?: number } | undefined {
  const events = readAgentLog({ sftddDir, role: role as never }).filter((e) => e.event === "turn.usage");
  const last = events[events.length - 1];
  if (!last?.metadata) return undefined;
  const m = last.metadata as Record<string, unknown>;
  const num = (k: string): number | undefined => (typeof m[k] === "number" ? (m[k] as number) : undefined);
  const inputTokens = num("input_tokens");
  const cacheReadTokens = num("cache_read_tokens");
  if (inputTokens === undefined && cacheReadTokens === undefined) return undefined;
  return { ...(inputTokens !== undefined ? { inputTokens } : {}), ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}) };
}

/** The build-turn gate: after the handoff's commands ran (the cycle-record CLI
 *  stamped GREEN, or wrote a green-failure + raised an escalation), the turn passed
 *  iff NO unresolved escalation for this story exists. This is the honest signal ,
 *  an honest-GREEN failure / build halt leaves a story-scoped escalation on disk;
 *  the self-heal, if it succeeded, resolved it. Pure read of the .sftdd. */
export function makeBuildGate(sftddDir: string, featureId: string): (args: { handoff: HandoffPlan }) => GateOutcome {
  return ({ handoff }) => {
    const story = handoff.story;
    const open = readEscalations(sftddDir).filter(
      (e) => !e.resolved_at && e.story_id === story && (e.feature_id === undefined || e.feature_id === featureId),
    );
    if (open.length === 0) return { passed: true };
    return { passed: false, reason: `honest-GREEN halt: ${open.length} unresolved escalation(s) for ${story} (${open.map((e) => e.source).join(", ")})` };
  };
}
