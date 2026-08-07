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
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROLE_CHAINS, runRoleChainLive, INTAKE_REL, type RoleChain } from "../../consort/optimize/role-chains.js";
import { roleCandidates } from "./role-levers.js";
import { runRoleSweep, type SweepTrial, type ChainRunner } from "./role-sweep.js";
import { reportRoleSweep, formatRoleSweepReport, type SweepReport } from "./role-sweep-report.js";
import { makeOpusJudge } from "../../consort/evaluation/semantic-gate.js";
import { RECOMMENDED_MODELS, type SpawnableAgentRole } from "../../consort/config/agent-models.js";
import type { StepManifest } from "../../consort/orchestrator/steps/manifest.js";
import type { StepAgent } from "../../consort/orchestrator/agents/agent-types.js";

/** The chain SET keywords that expand to a group of handles. "design" = every design role chain
 *  (the lean, no-cloud tier). Navigator + driver build chains are added at their own stages. */
const CHAIN_SETS: Record<string, string[]> = {
  design: Object.keys(ROLE_CHAINS),
};

/** Expand a --chains spec (a set keyword OR a comma list of handles) into concrete chain handles,
 *  validated against ROLE_CHAINS. Pure + exported for a unit test. De-dupes while preserving order. */
export function expandChains(spec: string, chains: Record<string, RoleChain> = ROLE_CHAINS): string[] {
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
export function parseArgs(argv: string[], chains: Record<string, RoleChain> = ROLE_CHAINS): OptimizeRoleArgs {
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

/** Sweep ONE chain end to end + persist its evidence + report under <runRoot>/<handle>/. Returns
 *  the chain's report (for the multi-chain roll-up). LIVE , each candidate spawns a real claude
 *  turn; candidates fan out under `concurrency`. */
export async function sweepOneChain(
  handle: string,
  runRoot: string,
  opts: { baseModel?: string; concurrency?: number } = {},
): Promise<SweepReport> {
  const chain = ROLE_CHAINS[handle];
  const baseModel = baseModelFor(handle, opts.baseModel);
  const candidates = roleCandidates(baseModel);
  const runDir = join(runRoot, handle);
  mkdirSync(runDir, { recursive: true });

  // The QUALITY gate reference: the RECORDED baseline artifact for this chain (the intake seed the
  // chain replays), scored functionally (test-list = build-ish artifact, looser bar). Absent
  // reference -> quality gate skipped (conformance-only), never a false pass.
  const referenceText = readReference(chain, handle);
  const quality = referenceText
    ? { referenceText, judge: makeOpusJudge({ cwd: process.cwd() }), kind: "tests" as const }
    : undefined;

  // eslint-disable-next-line no-console
  console.log(
    `[optimize-role] ${handle}: baseline model=${baseModel}, ${candidates.length} candidates, concurrency=${opts.concurrency ?? 1}. ` +
      `quality gate: ${quality ? "ON (functional vs recorded baseline)" : "OFF (no reference on disk)"}. run dir: ${runDir}`,
  );

  const runChain: ChainRunner = async (c, agentFor) => runRoleChainLive(c as RoleChain, { agentFor: agentFor as (m: StepManifest) => StepAgent | undefined });
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
  // eslint-disable-next-line no-console
  console.log(`\n[${handle}]\n` + formatRoleSweepReport(report));
  return report;
}

/** Run the sweep for EVERY requested chain, each standalone against its reference example, and
 *  print a per-chain report + a roll-up. Returns the reports keyed by handle. LIVE. Chains run in
 *  sequence; each chain's candidates fan out under `concurrency` (a global cap , the chains do not
 *  overlap, so N concurrency is N in-flight candidates at any moment). */
export async function runOptimizeRole(args: OptimizeRoleArgs): Promise<Record<string, SweepReport>> {
  const runRoot = args.telemetryDir ?? join(process.cwd(), ".role-telemetry", `sweep-${args.chains.join("+").slice(0, 40)}-${runStamp()}`);
  mkdirSync(runRoot, { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`[optimize-role] sweeping ${args.chains.length} chain(s): ${args.chains.join(", ")} , run root ${runRoot}`);

  const reports: Record<string, SweepReport> = {};
  for (const handle of args.chains) {
    reports[handle] = await sweepOneChain(handle, runRoot, {
      ...(args.baseModel ? { baseModel: args.baseModel } : {}),
      ...(args.concurrency ? { concurrency: args.concurrency } : {}),
    });
  }

  // Roll-up: one winner line per chain, written to the run root + printed.
  const rollup = args.chains
    .map((h) => {
      const rep = reports[h];
      const w = rep.winner;
      return w
        ? `${h}: winner ${w.candidateId} (${(w.outerDurationMs / 1000).toFixed(1)}s vs baseline ${(rep.baselineMs / 1000).toFixed(1)}s, saved ${w.speedupPct.toFixed(0)}%)`
        : `${h}: no winner (no quality-holding candidate beat the baseline)`;
    })
    .join("\n");
  writeFileSync(join(runRoot, "rollup.txt"), rollup + "\n");
  // eslint-disable-next-line no-console
  console.log(`\n=== ROLL-UP ===\n${rollup}\n\n(full evidence per chain -> ${runRoot}/<handle>/)`);
  return reports;
}

/** A compact UTC run stamp so repeat sweeps land in distinct, non-clobbering dirs. */
function runStamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15); // YYYYMMDDHHMMSS-ish
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
