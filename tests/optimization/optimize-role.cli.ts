#!/usr/bin/env node
// optimize-role: the per-CHAIN lever sweep CLI , INTERNAL agent performance-tuning tooling (NOT a
// published bin; it lives under tests/optimization/ and is invoked via scripts/optimize-role.sh).
// It sweeps one or MANY manifest turn-chains: each chain runs its isolated chain (recorded inputs
// replayed in, only that role's turn live) once per candidate lever patch (model tiers x effort
// rungs x scan-tight), gates each on the role's conformance validator + a reference-example quality
// judge, and reports the fastest quality-holding candidate vs the baseline. Every chain is measured
// STANDALONE against its recorded reference , so chains AND candidates fan out in parallel with zero
// shared mutable state (each candidate's runIntegrationChain mkdtemps its own workspace; levers ride
// in-memory on the ClaudeStepAgent). This is the lightweight sibling of consort-optimize; it needs
// NO cloud project (the design + navigator tiers), only the isolation substrate + recorded corpus.
//
//   scripts/optimize-role.sh --chains design [--concurrency 3] [--base-model sonnet] [--telemetry-dir DIR]
//   scripts/optimize-role.sh --chains spec-author-story,architect-reviewer [--concurrency 4]
//   scripts/optimize-role.sh --role test-strategist            # back-compat: single chain
//
// --chains is a SET: "design" (every design role chain), or a comma list of chain handles. --role is
//   the back-compat single-chain alias. --concurrency caps in-flight candidates ACROSS the whole run
//   (1 = sequential, the prior behavior). --base-model overrides the per-chain recorded default.
//   Each candidate's telemetry + produced artifacts survive to <telemetry-dir>/<chain>/<candidate>/.
//
// LIVE + LEAN: every candidate is a real `claude -p` turn, tool-scoped out of Bash, reporting via
// the agent-report channel, in a throwaway .sftdd workspace , nothing to tear down.

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { deleteLakebaseProject } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROLE_CHAINS, runRoleChainLive, INTAKE_REL, type RoleChain } from "../../consort/optimize/role-chains.js";
import { BUILD_ROLE_CHAINS, runBuildRoleChainLive, type BuildRoleChain } from "../../consort/optimize/build-role-chains.js";
import { roleCandidates, testStrategistCandidates } from "./role-levers.js";
import { runRoleSweep, type SweepTrial, type ChainRunner } from "./role-sweep.js";
import { reportRoleSweep, formatRoleSweepReport, type SweepReport } from "./role-sweep-report.js";
import { runDriverGreenSweep, type DriverGreenRunner, type DriverSweepTrial } from "./driver-sweep.js";
import { runDriverGreenLive, type RunDriverGreenResult } from "../integration/live/driver-build-support.js";
import { makeOpusJudge, makeVerdictAlignmentJudge, parseVerdictFile, FUNCTIONAL_THRESHOLD, type SemanticJudge, type BuildOutputKind } from "../../consort/evaluation/semantic-gate.js";
import { enabledAnalysts } from "../../consort/test-list/test-analyst-catalogue.js";
import { RECOMMENDED_MODELS, type SpawnableAgentRole } from "../../consort/config/agent-models.js";
import type { StepManifest } from "../../consort/orchestrator/steps/manifest.js";
import type { StepAgent } from "../../consort/orchestrator/agents/agent-types.js";

/** The chain SET keywords that expand to a group of handles. "design" = every design role chain
 *  (the lean, no-cloud tier); "navigator" = navigator build chains (red/assess/review/reflect);
 *  "driver" = driver LIVE lever sweeps (requires RUN_LIVE_STEP + LAKEBASE_TEST_E2E). */
const CHAIN_SETS: Record<string, string[]> = {
  design: Object.keys(ROLE_CHAINS),
  navigator: Object.keys(BUILD_ROLE_CHAINS),
  driver: ["driver-green"],
};

/** Combined universe of all chains (design + build + driver). Used for validation. "driver-green"
 *  is a synthetic handle that routes to runDriverGreenSweep. */
function allChains(): Record<string, RoleChain | BuildRoleChain | { id: string }> {
  return { ...ROLE_CHAINS, ...BUILD_ROLE_CHAINS, "driver-green": { id: "driver-green" } };
}

/** Expand a --chains spec (a set keyword OR a comma list of handles) into concrete chain handles,
 *  validated against ROLE_CHAINS + BUILD_ROLE_CHAINS + synthetic handles (driver-green). Pure + exported for a unit test.
 *  De-dupes while preserving order. */
export function expandChains(spec: string, chains: Record<string, unknown> = allChains()): string[] {
  const raw = CHAIN_SETS[spec] ?? spec.split(",").map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of raw) {
    if (!chains[h]) {
      throw new Error(`optimize-role: unknown chain "${h}". Sets: ${Object.keys(CHAIN_SETS).join(", ")}. Handles: ${Object.keys(chains).join(", ")}`);
    }
    if (!seen.has(h)) { seen.add(h); out.push(h); }
  }
  if (out.length === 0) throw new Error(`optimize-role: --chains "${spec}" expanded to nothing`);
  return out;
}

/** Parsed CLI args. `chains` is the resolved handle list (one or many). */
export interface OptimizeRoleArgs {
  chains: string[];
  baseModel?: string;
  telemetryDir?: string;
  concurrency?: number;
}

/** Parse argv (pure + exported for a unit test). Accepts --chains <set|list> OR the back-compat
 *  single --role <handle>. Throws loud on an unknown/absent chain. */
export function parseArgs(argv: string[], chains: Record<string, unknown> = allChains()): OptimizeRoleArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const chainsSpec = get("--chains");
  const role = get("--role");
  if (!chainsSpec && !role) {
    throw new Error(`optimize-role: --chains <set|list> (or --role <handle>) is required. Sets: ${Object.keys(CHAIN_SETS).join(", ")}. Handles: ${Object.keys(chains).join(", ")}`);
  }
  const resolved = chainsSpec ? expandChains(chainsSpec, chains) : expandChains(role!, chains);
  const conc = get("--concurrency");
  return {
    chains: resolved,
    ...(get("--base-model") ? { baseModel: get("--base-model") } : {}),
    ...(get("--telemetry-dir") ? { telemetryDir: get("--telemetry-dir") } : {}),
    ...(conc !== undefined ? { concurrency: Math.max(1, Number(conc) || 1) } : {}),
  };
}

/** The role's baseline model: the CLI override, else RECOMMENDED_MODELS, else sonnet. */
function baseModelFor(role: string, override?: string): string {
  if (override) return override;
  // The chain handle is the spawnable role for the design roles; the plan-lane handles
  // (spec-author-propose -> spec-author, architect-estimator -> architect-reviewer) map to their
  // spawnable role for the recommended-model lookup.
  const spawnable: Record<string, SpawnableAgentRole> = {
    "spec-author-story": "spec-author",
    "spec-author-propose": "spec-author",
    "architect-reviewer": "architect-reviewer",
    "architect-estimator": "architect-reviewer",
    dba: "dba",
    "test-strategist": "test-strategist",
  };
  const r = spawnable[role];
  return (r && RECOMMENDED_MODELS[r]) || "sonnet";
}

/** The driver-green sweep: a CLOUD LIVE run (requires RUN_LIVE_STEP + LAKEBASE_TEST_E2E to be set).
 *  Each candidate runs a FULL driver-GREEN cycle with the levers patched, gates on honest-GREEN,
 *  and reports duration + classification. Returns a per-candidate summary in runs/<stamp>/driver-green/. */
export async function sweepDriverGreen(
  handle: string,
  runRoot: string,
  opts: { concurrency?: number } = {},
): Promise<{ summary: { chain: string; baseModel: string; winner: string | null; candidates: Array<{ candidate: string; honestGreen: boolean; durationMs: number; classify: { outcome: string }; disqualified?: boolean }> } }> {
  // GATED: only meaningful with a live test env (RUN_LIVE_STEP + LAKEBASE_TEST_E2E).
  if (!process.env.RUN_LIVE_STEP || !process.env.LAKEBASE_TEST_E2E) {
    throw new Error(
      `optimize-role: driver-green sweep requires RUN_LIVE_STEP=1 LAKEBASE_TEST_E2E=1 (live cloud gate). ` +
        `This is a LIVE driver-GREEN harness, not a lean chain run. Use the driver-build-support harness directly or set the gates.`,
    );
  }

  const runDir = join(runRoot, handle);
  mkdirSync(runDir, { recursive: true });

  // eslint-disable-next-line no-console
  console.log(`[optimize-role] ${handle}: CLOUD LIVE driver-GREEN sweep, ${roleCandidates("sonnet").length} candidates, concurrency=${opts.concurrency ?? 1}. run dir: ${runDir}`);

  const candidates = roleCandidates("sonnet");
  const trials: DriverSweepTrial[] = [];
  const runner: DriverGreenRunner = async (candidateId, _levers, slug, branch) => {
    // Call the live harness with per-candidate overrides.
    const result = (await runDriverGreenLive({
      experimentSlug: slug,
      branch,
      leverOverride: candidates.find((c) => c.id === candidateId)?.levers,
    })) as RunDriverGreenResult | undefined;

    if (!result) throw new Error(`runDriverGreenLive returned void (expected RunDriverGreenResult)`);
    return result;
  };

  await runDriverGreenSweep(candidates, runner, {
    concurrency: opts.concurrency ?? 1,
    orphanParentDir: process.cwd(),
    deleteLakebaseProject: async (args) => {
      await deleteLakebaseProject(args);
    },
    onStart: (candidate, i, total) => {
      // eslint-disable-next-line no-console
      console.log(`[optimize-role] ${handle} (${i}/${total}) running ${candidate.id} ...`);
    },
    onDone: (trial, i, total) => {
      trials.push(trial);
      const status = trial.disqualified ? `DISQUALIFIED (${trial.reason})` : trial.honestGreen ? "PASSED" : "FAILED";
      // eslint-disable-next-line no-console
      console.log(`[optimize-role] ${handle} (${i}/${total}) ${trial.candidateId}: ${status}${trial.durationMs ? ` , ${(trial.durationMs / 1000).toFixed(1)}s` : ""}`);
    },
  });

  // Build a summary in the same shape as role-sweep (but driver-GREEN specific).
  const winner = trials.filter((t) => !t.disqualified && t.honestGreen).sort((a, b) => a.durationMs - b.durationMs)[0] ?? null;
  const summary = {
    chain: handle,
    baseModel: "sonnet",
    winner: winner?.candidateId ?? null,
    candidates: trials.map((t) => ({
      candidate: t.candidateId,
      honestGreen: t.honestGreen,
      durationMs: t.durationMs,
      classify: t.classify,
      ...(t.disqualified ? { disqualified: true } : {}),
    })),
  };

  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  // eslint-disable-next-line no-console
  console.log(`\n[${handle}] winner: ${summary.winner ?? "none (no honest-GREEN candidate)"}, ${trials.length} candidates total`);

  return { summary };
}

/** Sweep ONE chain end to end + persist its evidence + report under <runRoot>/<handle>/. Returns
 *  the chain's report (for the multi-chain roll-up). LIVE , each candidate spawns a real claude
 *  turn; candidates fan out under `concurrency`. Handles both design role chains and build chains. */
export async function sweepOneChain(
  handle: string,
  runRoot: string,
  opts: { baseModel?: string; concurrency?: number; baselineDir?: string } = {},
): Promise<SweepReport> {
  // Determine if this is a design or build chain.
  const isBuildChain = handle in BUILD_ROLE_CHAINS;
  const chain = isBuildChain ? BUILD_ROLE_CHAINS[handle] : ROLE_CHAINS[handle];
  if (!chain) {
    throw new Error(`optimize-role: unknown chain "${handle}"`);
  }

  const baseModel = baseModelFor(handle, opts.baseModel);
  // The test-strategist is a SUPERVISOR , its optimization target is the per-analyst SUBAGENT levers,
  // not its own model. Its candidate set permutes ALL enabled analysts (behavior/fitness/client);
  // every other chain uses the single-role model/effort set.
  const candidates =
    handle === "test-strategist"
      ? testStrategistCandidates(enabledAnalysts({ projectDir: "", uiTrack: true }).map((a) => a.kind))
      : roleCandidates(baseModel);
  const runDir = join(runRoot, handle);
  mkdirSync(runDir, { recursive: true });

  // BUILD CHAINS: route to appropriate quality gate.
  // DESIGN CHAINS: use the recorded baseline reference + opus judge (functional for tests).
  let quality: { referenceText: string; judge: SemanticJudge; kind?: BuildOutputKind; threshold?: number } | undefined;

  if (isBuildChain) {
    const bChain = chain as BuildRoleChain;
    if (bChain.assertKind === "red") {
      // RED: functional coverage gate (handled in runRedCoverageGate).
      // For the sweep, we score the produced tests against the recorded reference.
      const refPath = join(process.cwd(), "consort/evaluation/reference-assets/stockflow/recorded-artifacts", "features/F6-split-tracking-code/test-list.json");
      const referenceText = existsSync(refPath) ? readFileSync(refPath, "utf8") : undefined;
      quality = referenceText
        ? { referenceText, judge: makeOpusJudge({ cwd: process.cwd() }), kind: "tests", threshold: FUNCTIONAL_THRESHOLD }
        : undefined;
    } else if (bChain.assertKind === "assess") {
      // ASSESS: discriminator alignment (handled in runAssessAlignmentGate).
      // For the sweep, we skip the quality gate (handled post-run via the verdict judge).
      quality = undefined;
    } else if (bChain.assertKind === "review" || bChain.assertKind === "reflect") {
      // REVIEW/REFLECT: verdict-alignment gate (custom judge on the verdict file).
      // For the sweep, we skip here and handle in onDone post-run.
      quality = undefined;
    }
  } else {
    // DESIGN CHAIN: use the recorded baseline artifact.
    const referenceText = readReference(chain as RoleChain, handle);
    quality = referenceText
      ? { referenceText, judge: makeOpusJudge({ cwd: process.cwd() }), kind: undefined }
      : undefined;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[optimize-role] ${handle}: ${isBuildChain ? "BUILD" : "DESIGN"} chain, baseline model=${baseModel}, ${candidates.length} candidates, concurrency=${opts.concurrency ?? 1}. ` +
      `quality gate: ${quality ? "ON" : "OFF (no reference on disk)"}. run dir: ${runDir}`,
  );

  const runChain: ChainRunner = isBuildChain
    ? async (c, agentFor, _id, levers) =>
        runBuildRoleChainLive(c as BuildRoleChain, {
          agentFor: agentFor as (m: StepManifest) => StepAgent | undefined,
        })
    : async (c, agentFor, _id, levers) =>
        runRoleChainLive(c as RoleChain, {
          agentFor: agentFor as (m: StepManifest) => StepAgent | undefined,
          // TEST-STRATEGIST: forward the candidate's per-analyst overrides into the roster preparer.
          ...(levers.analystOverrides ? { analystOverrides: levers.analystOverrides } : {}),
        });
  const trials = await runRoleSweep(chain, candidates, runChain, {
    ...(quality ? { quality } : {}),
    ...(opts.concurrency ? { concurrency: opts.concurrency } : {}),
    onStart: (candidate, i, total) => {
      // eslint-disable-next-line no-console
      console.log(`[optimize-role] ${handle} (${i}/${total}) running ${candidate.id} , levers ${JSON.stringify(candidate.levers)} ...`);
    },
    // PRESERVE each candidate's full result AS IT COMPLETES (not batched at the end): its
    // telemetry, its produced artifacts (the actual files), and a replay.json (levers + seed
    // corpus ref) , so the experiment is reproducible + re-judgeable, and an interrupted sweep
    // still leaves every finished candidate's evidence on disk.
    onDone: (trial, i, total) => {
      persistTrial(runDir, chain, baseModel, trial);
      const q = trial.qualityPassed === undefined ? "" : trial.qualityPassed ? " quality PASSED" : ` quality FAILED (${trial.telemetry?.semanticScore?.toFixed(2)})`;
      const status = trial.disqualified ? `DISQUALIFIED (${trial.reason})` : trial.gatePassed ? "gate PASSED" : "gate failed";
      // eslint-disable-next-line no-console
      console.log(`[optimize-role] ${handle} (${i}/${total}) ${trial.candidateId}: ${status}${q}${trial.telemetry?.outerDurationMs ? ` , ${(trial.telemetry.outerDurationMs / 1000).toFixed(1)}s` : ""}`);
    },
  });

  const report = reportRoleSweep(trials);
  // Write the report itself into the chain's run dir , the run's own summary lives with its evidence.
  writeFileSync(join(runDir, "report.txt"), formatRoleSweepReport(report) + "\n");

  // Write a machine-readable summary.json (winner + per-candidate median/gate) in the SAME shape the
  // committed design-lane corpus (examples/replay/optimize-results/<handle>/summary.json) uses, so a
  // run is durable + diffable. When a PRIOR summary exists for this chain (a baseline / last run),
  // print the delta so "repeat + compare" is a first-class output, not a manual diff.
  const summary = buildChainSummary(handle, baseModel, trials, report);
  const prior = opts.baselineDir ? readPriorSummary(opts.baselineDir, handle) : undefined;
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  // eslint-disable-next-line no-console
  console.log(`\n[${handle}]\n` + formatRoleSweepReport(report));
  if (prior) {
    // eslint-disable-next-line no-console
    console.log(formatBaselineDelta(handle, prior, summary));
  }
  return report;
}

/** One chain's durable summary , winner + per-candidate median ms / gate / quality. Mirrors the
 *  committed examples/replay/optimize-results/<handle>/summary.json shape so both corpora are diffable. */
interface ChainSummary {
  chain: string;
  baseModel: string;
  winner: string | null;
  baselineMs: number | null;
  capturedAt: string;
  candidates: Array<{ candidate: string; gatePassed: boolean; qualityPassed?: boolean; medianMs: number | null; disqualified?: boolean }>;
}

function buildChainSummary(handle: string, baseModel: string, trials: SweepTrial[], report: ReturnType<typeof reportRoleSweep>): ChainSummary {
  return {
    chain: handle,
    baseModel,
    winner: report.winner?.candidateId ?? null,
    baselineMs: report.baselineMs ?? null,
    capturedAt: new Date().toISOString(),
    candidates: trials.map((t) => ({
      candidate: t.candidateId,
      gatePassed: t.gatePassed,
      ...(t.qualityPassed !== undefined ? { qualityPassed: t.qualityPassed } : {}),
      medianMs: t.telemetry?.outerDurationMs ?? null,
      ...(t.disqualified ? { disqualified: true } : {}),
    })),
  };
}

/** Read a prior run's summary.json for a chain (the baseline to compare against), if present. */
function readPriorSummary(baselineDir: string, handle: string): ChainSummary | undefined {
  const p = join(baselineDir, handle, "summary.json");
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ChainSummary;
  } catch {
    return undefined;
  }
}

/** A human delta line comparing this run's summary to a prior one: winner change + baseline wall-clock drift. */
function formatBaselineDelta(handle: string, prior: ChainSummary, now: ChainSummary): string {
  const winnerChange = prior.winner === now.winner ? `winner unchanged (${now.winner ?? "none"})` : `winner CHANGED: ${prior.winner ?? "none"} -> ${now.winner ?? "none"}`;
  const ms = (v: number | null) => (v == null ? "?" : `${(v / 1000).toFixed(1)}s`);
  const drift =
    prior.baselineMs != null && now.baselineMs != null
      ? ` , baseline ${ms(prior.baselineMs)} -> ${ms(now.baselineMs)} (${(((now.baselineMs - prior.baselineMs) / prior.baselineMs) * 100).toFixed(0)}%)`
      : "";
  return `[compare] ${handle}: ${winnerChange}${drift} , prior run ${prior.capturedAt}`;
}

/** Run the sweep for EVERY requested chain, each standalone against its reference example, and
 *  print a per-chain report + a roll-up. Returns the reports keyed by handle. LIVE. Chains run in
 *  sequence; each chain's candidates fan out under `concurrency` (a global cap , the chains do not
 *  overlap, so N concurrency is N in-flight candidates at any moment). */
export async function runOptimizeRole(args: OptimizeRoleArgs): Promise<Record<string, SweepReport | { summary: unknown }>> {
  // Results land in the VISIBLE, git-tracked corpus (examples/replay/optimize-results/), NOT a hidden
  // dir , so a run is durable + reviewable + diffable. Each run gets a timestamped subdir under runs/
  // so prior runs accumulate; the newest prior run (if any) is the BASELINE this run's summary.json is
  // compared against + a delta printed. Override with --telemetry-dir for an ad-hoc scratch run.
  const resultsHome = join(process.cwd(), "examples/replay/optimize-results");
  const runsDir = join(resultsHome, "runs");
  const baselineDir = latestRunDir(runsDir); // the most recent prior run, or undefined on the first
  const runRoot = args.telemetryDir ?? join(runsDir, runStamp());
  mkdirSync(runRoot, { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`[optimize-role] sweeping ${args.chains.length} chain(s): ${args.chains.join(", ")} , run root ${runRoot}${baselineDir ? ` (baseline: ${baselineDir})` : " (no prior run , this is the baseline)"}`);

  const reports: Record<string, SweepReport | { summary: unknown }> = {};
  for (const handle of args.chains) {
    if (handle === "driver-green") {
      reports[handle] = await sweepDriverGreen(handle, runRoot, {
        ...(args.concurrency ? { concurrency: args.concurrency } : {}),
      });
    } else {
      reports[handle] = await sweepOneChain(handle, runRoot, {
        ...(args.baseModel ? { baseModel: args.baseModel } : {}),
        ...(args.concurrency ? { concurrency: args.concurrency } : {}),
        ...(baselineDir ? { baselineDir } : {}),
      });
    }
  }

  // Roll-up: one winner line per chain, written to the run root + printed.
  // Driver-green is CLOUD LIVE and has a different result shape, so we skip it from the role-sweep rollup.
  const rollupChains = args.chains.filter((h) => h !== "driver-green");
  const rollup = rollupChains
    .map((h) => {
      const rep = reports[h] as SweepReport | undefined;
      if (!rep) return `${h}: (no report)`;
      const w = rep.winner;
      return w
        ? `${h}: winner ${w.candidateId} (${(w.outerDurationMs / 1000).toFixed(1)}s vs baseline ${(rep.baselineMs / 1000).toFixed(1)}s, saved ${w.speedupPct.toFixed(0)}%)`
        : `${h}: no winner (no quality-holding candidate beat the baseline)`;
    })
    .join("\n");

  // Driver-green summary (if present).
  const driverResult = reports["driver-green"];
  if (driverResult && "summary" in driverResult) {
    const s = (driverResult.summary as { winner?: string | null; candidates?: Array<{ candidate: string }> }) ?? {};
    const w = s.winner;
    const driverLine = w ? `driver-green: winner ${w}` : `driver-green: no winner`;
    // eslint-disable-next-line no-console
    console.log(`\n[driver-green]\n${driverLine}`);
  }

  if (rollup) {
    writeFileSync(join(runRoot, "rollup.txt"), rollup + "\n");
    // eslint-disable-next-line no-console
    console.log(`\n=== ROLL-UP ===\n${rollup}\n\n(full evidence per chain -> ${runRoot}/<handle>/)`);
  }
  return reports;
}

/** A compact UTC run stamp so repeat sweeps land in distinct, non-clobbering dirs. */
function runStamp(): string {
  // YYYYMMDDHHMMSS (14 digits). toISOString -> 2026-08-07T13:46:37.123Z; strip separators + the
  // fractional-seconds tail so the dir name is clean (no trailing dot from slicing mid-fraction).
  return new Date().toISOString().replace(/[-:T]/g, "").replace(/\..*$/, "");
}

/** The most recent prior run dir under runs/ (the baseline this run compares against), or undefined
 *  on the first-ever run. Run dirs are timestamp-named (runStamp), so lexical max = newest. */
function latestRunDir(runsDir: string): string | undefined {
  if (!existsSync(runsDir)) return undefined;
  const dirs = readdirSync(runsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const newest = dirs[dirs.length - 1];
  return newest ? join(runsDir, newest) : undefined;
}

/** The recorded baseline artifact the quality gate scores a candidate against: the role's
 *  primary output as it exists in the RECORDED intake corpus (the seed the chain replays). This
 *  is the known-good reference. Absent -> undefined (gate skipped). */
function readReference(chain: RoleChain, _role: string): string | undefined {
  // Prefer an explicit reference override (a SLICE of the recorded artifact matching the
  // isolated turn's scope); else the produced artifact's recorded form. See RoleChain.referenceFile.
  const p = join(process.cwd(), INTAKE_REL, chain.referenceFile ?? chain.outputFile);
  return existsSync(p) ? readFileSync(p, "utf8") : undefined;
}

/** Persist ONE candidate's full evidence under <runDir>/<candidate>/: telemetry.json, the
 *  produced artifact tree (artifacts/<relpath>), and replay.json (levers + seed corpus ref +
 *  base model), so the experiment can be reproduced + independently re-judged. */
function persistTrial(runDir: string, chain: RoleChain, baseModel: string, trial: SweepTrial): void {
  const dir = join(runDir, trial.candidateId);
  mkdirSync(dir, { recursive: true });
  if (trial.telemetry) writeFileSync(join(dir, "telemetry.json"), JSON.stringify(trial.telemetry, null, 2) + "\n");
  // The actual produced files (the outputs) , the evidence telemetry alone can't provide.
  for (const [rel, contents] of Object.entries(trial.producedArtifacts ?? {})) {
    const dest = join(dir, "artifacts", rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, contents);
  }
  // How to recreate this exact trial.
  const replay = {
    role: chain.dir,
    candidateId: trial.candidateId,
    baseModel,
    levers: trial.levers,
    seedCorpus: `${INTAKE_REL} (recorded intake replayed into the chain)`,
    gatePassed: trial.gatePassed,
    ...(trial.qualityPassed !== undefined ? { qualityPassed: trial.qualityPassed } : {}),
    ...(trial.disqualified ? { disqualified: true, reason: trial.reason } : {}),
  };
  writeFileSync(join(dir, "replay.json"), JSON.stringify(replay, null, 2) + "\n");
}

if (isCliEntry(import.meta.url)) {
  runOptimizeRole(parseArgs(process.argv.slice(2)))
    .then(() => process.exit(0)) // a sweep with no winner is still a successful run
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(`[optimize-role] FAILED: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    });
}
