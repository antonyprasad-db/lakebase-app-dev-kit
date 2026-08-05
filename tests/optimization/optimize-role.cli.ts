#!/usr/bin/env node
// optimize-role: the PER-ROLE lever sweep CLI , INTERNAL agent performance-tuning tooling (NOT a
// published bin; it lives under tests/optimization/ and is invoked via scripts/optimize-role.sh).
// It runs one design/plan role's isolated chain (recorded inputs replayed in, only that role's turn
// live) once per candidate lever patch (model tiers x effort rungs x scan-tight), gates each on the
// role's conformance validator, and reports the fastest gate-passer vs the baseline. This is the
// lightweight sibling of lakebase-sftdd-optimize (which sweeps a whole scaffolded drive); it needs
// NO cloud project , the isolation substrate (tests/integration/manifests/<role>-chain + intake) is
// the whole thing.
//
//   scripts/optimize-role.sh --role test-strategist [--base-model sonnet] [--telemetry-dir DIR]
//
// --role is the chain handle (spec-author-story | architect-reviewer | dba | test-strategist |
//   spec-author-propose | architect-estimator). --base-model defaults to the role's recorded
//   default (RECOMMENDED_MODELS). Each candidate's telemetry survives to <telemetry-dir>/
//   <chain>#<candidate>.telemetry.json; the report prints at the end.
//
// LIVE + LEAN: every candidate is a real `claude -p` turn, tool-scoped out of Bash, reporting via
// the agent-report channel, in a throwaway .sftdd workspace , nothing to tear down.

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROLE_CHAINS, runRoleChainLive, INTAKE_REL, type RoleChain } from "../../consort/orchestrator/optimize/role-chains.js";
import { roleCandidates } from "./role-levers.js";
import { runRoleSweep, type SweepTrial } from "./role-sweep.js";
import { reportRoleSweep, formatRoleSweepReport } from "./role-sweep-report.js";
import { makeOpusJudge } from "../../scripts/sftdd/optimize-semantic-gate.js";
import { RECOMMENDED_MODELS, type SpawnableAgentRole } from "../../scripts/sftdd/agent-models.js";
import type { StepManifest } from "../../consort/orchestrator/steps/manifest.js";
import type { StepAgent } from "../../consort/orchestrator/agents/agent-types.js";

/** Parsed CLI args. */
export interface OptimizeRoleArgs {
  role: string;
  baseModel?: string;
  telemetryDir?: string;
}

/** Parse argv (pure + exported for a unit test). Throws loud on an unknown/absent role. */
export function parseArgs(argv: string[], chains: Record<string, RoleChain> = ROLE_CHAINS): OptimizeRoleArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const role = get("--role");
  if (!role) throw new Error(`optimize-role: --role is required. One of: ${Object.keys(chains).join(", ")}`);
  if (!chains[role]) throw new Error(`optimize-role: unknown role "${role}". One of: ${Object.keys(chains).join(", ")}`);
  return {
    role,
    ...(get("--base-model") ? { baseModel: get("--base-model") } : {}),
    ...(get("--telemetry-dir") ? { telemetryDir: get("--telemetry-dir") } : {}),
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

/** Run the sweep for one role end to end + print the report. Returns the report (for the caller
 *  / a future auto-apply). LIVE , each candidate spawns a real claude turn. */
export async function runOptimizeRole(args: OptimizeRoleArgs): Promise<ReturnType<typeof reportRoleSweep>> {
  const chain = ROLE_CHAINS[args.role];
  const baseModel = baseModelFor(args.role, args.baseModel);
  const candidates = roleCandidates(baseModel);
  const runDir = args.telemetryDir ?? join(process.cwd(), ".role-telemetry", `sweep-${args.role}-${runStamp()}`);
  mkdirSync(runDir, { recursive: true });

  // The QUALITY gate reference: the RECORDED baseline artifact for this role (the intake seed the
  // chain replays), scored functionally (test-list = build-ish artifact, looser bar). Absent
  // reference -> quality gate skipped (conformance-only), never a false pass.
  const referenceText = readReference(chain, args.role);
  const quality = referenceText
    ? { referenceText, judge: makeOpusJudge({ cwd: process.cwd() }), kind: "tests" as const }
    : undefined;

  // eslint-disable-next-line no-console
  console.log(
    `[optimize-role] ${args.role}: baseline model=${baseModel}, ${candidates.length} candidates. ` +
      `quality gate: ${quality ? "ON (functional vs recorded baseline)" : "OFF (no reference on disk)"}. run dir: ${runDir}`,
  );

  const trials = await runRoleSweep(
    chain,
    candidates,
    async (c, agentFor) => runRoleChainLive(c, { agentFor: agentFor as (m: StepManifest) => StepAgent | undefined }),
    {
      ...(quality ? { quality } : {}),
      onStart: (candidate, i, total) => {
        // eslint-disable-next-line no-console
        console.log(`[optimize-role] (${i}/${total}) running ${candidate.id} , levers ${JSON.stringify(candidate.levers)} ...`);
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
        console.log(`[optimize-role] (${i}/${total}) ${trial.candidateId}: ${status}${q}${trial.telemetry?.outerDurationMs ? ` , ${(trial.telemetry.outerDurationMs / 1000).toFixed(1)}s` : ""}`);
      },
    },
  );

  const report = reportRoleSweep(trials);
  // Write the report itself into the run dir , the run's own summary lives with its evidence.
  writeFileSync(join(runDir, "report.txt"), formatRoleSweepReport(report) + "\n");
  // eslint-disable-next-line no-console
  console.log("\n" + formatRoleSweepReport(report) + `\n\n(full evidence , telemetry + produced artifacts + replay.json per candidate -> ${runDir})`);
  return report;
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
    .then((r) => process.exit(r.winner ? 0 : 0)) // a sweep with no winner is still a successful run
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(`[optimize-role] FAILED: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    });
}
