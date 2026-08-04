#!/usr/bin/env node
// lakebase-sftdd-optimize-role: the PER-ROLE lever sweep CLI. It runs one design/plan role's
// isolated chain (recorded inputs replayed in, only that role's turn live) once per candidate
// lever patch (model tiers x effort rungs x scan-tight), gates each on the role's conformance
// validator, and reports the fastest gate-passer vs the baseline. This is the lightweight sibling
// of lakebase-sftdd-optimize (which sweeps a whole scaffolded drive); it needs NO cloud project ,
// the isolation substrate (tests/integration/manifests/<role>-chain + intake) is the whole thing.
//
//   lakebase-sftdd-optimize-role --role test-strategist [--base-model sonnet] [--telemetry-dir DIR]
//
// --role is the chain handle (spec-author-story | architect-reviewer | dba | test-strategist |
//   spec-author-propose | architect-estimator). --base-model defaults to the role's recorded
//   default (RECOMMENDED_MODELS). Each candidate's telemetry survives to <telemetry-dir>/
//   <chain>#<candidate>.telemetry.json; the report prints at the end.
//
// LIVE + LEAN: every candidate is a real `claude -p` turn, tool-scoped out of Bash, reporting via
// the agent-report channel, in a throwaway .sftdd workspace , nothing to tear down.

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROLE_CHAINS, runRoleChainLive, type RoleChain } from "../../consort/orchestrator/optimize/role-chains.js";
import { roleCandidates } from "../../consort/orchestrator/optimize/role-levers.js";
import { runRoleSweep } from "../../consort/orchestrator/optimize/role-sweep.js";
import { reportRoleSweep, formatRoleSweepReport } from "../../consort/orchestrator/optimize/role-sweep-report.js";
import { writeRoleTelemetry } from "../../consort/orchestrator/optimize/role-telemetry.js";
import { RECOMMENDED_MODELS, type SpawnableAgentRole } from "./agent-models.js";
import type { StepManifest } from "../../consort/orchestrator/manifest/step-manifest.js";
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
  const telemetryDir = args.telemetryDir ?? join(process.cwd(), ".role-telemetry", `sweep-${args.role}`);
  mkdirSync(telemetryDir, { recursive: true });

  // eslint-disable-next-line no-console
  console.log(`[optimize-role] ${args.role}: baseline model=${baseModel}, ${candidates.length} candidates (baseline + ${candidates.length - 1}).`);

  const trials = await runRoleSweep(
    chain,
    candidates,
    async (c, agentFor) => runRoleChainLive(c, { agentFor: agentFor as (m: StepManifest) => StepAgent | undefined }),
    {
      onStart: (candidate, i, total) => {
        // eslint-disable-next-line no-console
        console.log(`[optimize-role] (${i}/${total}) running ${candidate.id} , levers ${JSON.stringify(candidate.levers)} ...`);
      },
      // Persist each trial's telemetry AS IT COMPLETES (not batched at the end), so an
      // interrupted long sweep still leaves every finished candidate's record on disk.
      onDone: (trial, i, total) => {
        if (trial.telemetry) writeRoleTelemetry(telemetryDir, trial.telemetry);
        const status = trial.disqualified ? `DISQUALIFIED (${trial.reason})` : trial.gatePassed ? "gate PASSED" : "gate failed";
        // eslint-disable-next-line no-console
        console.log(`[optimize-role] (${i}/${total}) ${trial.candidateId}: ${status}${trial.telemetry?.outerDurationMs ? ` , ${(trial.telemetry.outerDurationMs / 1000).toFixed(1)}s` : ""}`);
      },
    },
  );

  const report = reportRoleSweep(trials);
  // eslint-disable-next-line no-console
  console.log("\n" + formatRoleSweepReport(report) + `\n\n(telemetry records -> ${telemetryDir})`);
  return report;
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
