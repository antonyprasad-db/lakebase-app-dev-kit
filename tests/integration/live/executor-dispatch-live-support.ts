// Shared support for the DESIGN-role executor-dispatch LIVE proofs (Stage 2 of the channel-model
// live-proof plan, task #641). Each per-role live test is a thin wrapper that names its role +
// calls runDesignExecutorDispatchLive(SPEC) so the file stays a few lines.
//
// WHAT THIS PROVES (that the hermetic perform-via-executor golden + the isolated runIntegrationChain
// tests do NOT): a REAL `claude -p` agent, dispatched THROUGH the SHIPPED performViaExecutor path
// (buildDriveEffects(cfg).performViaExecutor -> performTurnViaExecutor -> execute()), with the
// shipped manifests' input `source` strings resolving on a real `.consort` tree (the {feature}/
// {story} scope fix), lands its artifact under the provisioned `.consort` via the channel model +
// the reconciled agent-log under `.consort` (meta). This is the LIVE half of retirement-map step (2).
//
// LEAN , NO cloud. Every design role is tool-scoped to Write/Read (never runs ./scripts/lk) and
// reports via the agent-report channel; the turn runs in a throwaway project dir. We call
// performViaExecutor DIRECTLY with the design action (rather than driving the whole runDriver loop):
// that exercises the identical dispatch + input-resolution + channel-placement + validate path a
// production turn takes, without seeding the pipeline state nextTransition would need to route there
// , the routing itself is proven hermetically + by the navigator-red production-drive test.
//
// NOT a .test.ts itself (no vitest include match), so importing it adds no suite.

import { expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, existsSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { buildDriveEffects, type DriveEffectsConfig } from "../../../consort/orchestrator/drive/orchestrator-effects.js";
import { execRunner } from "../../../consort/orchestrator/drive/claude-runner.js";
import { resolveConsortSettings } from "../../../consort/orchestrator/settings/project-settings.js";
import { layDownKitAgents } from "../../../consort/orchestrator/provisioning/bundle.js";
import type { WorkflowAction, DriveState } from "../../../consort/orchestrator/drive/orchestrator-drive.js";
import type { ValidateBoundDeps } from "../../../consort/orchestrator/steps/step-contract.js";

const KIT = process.cwd();
const INTAKE = join(KIT, "tests/integration/intake");
export const FEATURE = "F1-stock-visibility";
export const STORY = "S1-file-stock";

/** One design-role live spec: the action to dispatch, the inputs to seed at their REAL scope (each
 *  a consort-relative dest + the intake source to copy from, or inline content), the artifact the
 *  agent must land (consort-relative), whether it is a directory primary, and the live prompt. */
export interface DesignLiveSpec {
  name: string;
  action: WorkflowAction;
  /** Files to seed under .consort at their REAL relative scope (the {feature}/{story} the manifest
   *  source resolves to). `from` copies the recorded intake file; `content` writes inline. */
  seed: Array<{ rel: string; from?: string; content?: string }>;
  /** The artifact the live agent must produce, consort-relative (feature/story-scoped). */
  artifactRel: string;
  /** True when artifactRel is a DIRECTORY (spec-author acs/) , assert it holds >=1 file. */
  artifactIsDir?: boolean;
  /** The live-turn prompt (the agent writes ONLY artifactRel, tool-scoped, reports, no shell). */
  prompt: string;
}

/** The role's live turn is tool-scoped to Write/Read (no Bash -> never runs ./scripts/lk), matching
 *  the proven per-role chain scope; with Bash/Glob it explores the tree open-endedly + never converges. */
function scopedCfg(projectDir: string, consortDir: string): DriveEffectsConfig {
  const settings = resolveConsortSettings({ projectDir });
  const cfg: DriveEffectsConfig = {
    projectDir,
    consortDir,
    featureId: FEATURE,
    runner: { async run() {} },
    useManifestSteps: true,
    uiTrack: false,
    approver: "human-proxy",
    deployTarget: "local",
    loopGranularity: "story",
    modelForRole: (role) => settings.models[role] ?? "sonnet",
    modelForTurn: (role, turn) => settings.modelFor(role, turn),
    effortForTurn: (role, turn) => {
      const e = settings.effortFor(role, turn);
      return e === "default" ? "" : e;
    },
    allowedToolsForRole: () => ["Write", "Read"],
    disallowedToolsForRole: () => ["Bash", "Glob", "Grep", "WebFetch", "WebSearch", "Task"],
  } as DriveEffectsConfig;
  cfg.runner = execRunner(cfg);
  return cfg;
}

const routerDeps: ValidateBoundDeps = {
  allowed: () => ({ kind: "state-derived" }) as unknown as WorkflowAction,
  reviseBudgetAvailable: () => true,
  recordRetry: () => ({ sanctioned: true }),
};

/** True when a directory tree holds at least one file. */
function nonEmptyDir(dir: string): boolean {
  return existsSync(dir) && statSync(dir).isDirectory() && readdirSync(dir).length > 0;
}

/**
 * Run ONE design role's turn LIVE through the shipped performViaExecutor path + assert it produced
 * its artifact under the provisioned `.consort` (the artifact channel) + the reconciled agent-log
 * under `.consort` (meta). Seeds the role's inputs at their REAL feature/story scope so the shipped
 * manifest's {feature}/{story} source resolves on the tree. Throwaway dir, no cloud.
 */
export async function runDesignExecutorDispatchLive(spec: DesignLiveSpec): Promise<void> {
  const projectDir = mkdtempSync(join(tmpdir(), "design-exec-live-"));
  const consortDir = join(projectDir, ".consort");
  mkdirSync(consortDir, { recursive: true });

  // Seed the role's declared inputs at their real relative scope under .consort.
  for (const s of spec.seed) {
    const dest = join(consortDir, s.rel);
    mkdirSync(dirname(dest), { recursive: true });
    if (s.from) cpSync(join(INTAKE, s.from), dest);
    else writeFileSync(dest, s.content ?? "seed\n");
  }
  // Lay the kit's role agent defs so the live `--agent <role>` resolves (plain copy, no cloud).
  layDownKitAgents(projectDir);

  process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS = "1";
  process.env.LAKEBASE_KIT_DIR = KIT;
  const cfg = scopedCfg(projectDir, consortDir);
  // The live agent's prompt is threaded through the cfg's task suffix seam , performViaExecutor's
  // LiveDriveStepAgent builds the claude command from buildClaudeCommand(roleTask) + this suffix, so
  // the design role receives the exact write-ONLY-this-file + report + no-shell instruction here.
  cfg.taskSuffix = () => `\n\n${spec.prompt}`;

  const state = { phase: "feature" } as unknown as DriveState;
  try {
    const effects = buildDriveEffects(cfg);
    const bounded = await effects.performViaExecutor!(spec.action, state, routerDeps);

    // Executor-dispatched (not undefined => it took the shipped executor path).
    expect(bounded, `${spec.name} should be executor-dispatched`).toBeDefined();

    // The artifact landed under .consort at its feature/story-scoped path (the artifact channel,
    // placed by the channel model , NOT double-encoded).
    const artifactAbs = join(consortDir, spec.artifactRel);
    if (spec.artifactIsDir) {
      expect(nonEmptyDir(artifactAbs), `${spec.name} produced a non-empty ${spec.artifactRel}/ under .consort`).toBe(true);
    } else {
      expect(existsSync(artifactAbs), `${spec.name} produced ${spec.artifactRel} under .consort`).toBe(true);
    }
    expect(existsSync(join(consortDir, ".consort")), `${spec.name} must NOT double-encode .consort`).toBe(false);

    // The reconciled agent-log (meta channel) landed under .consort (planning modes skip it).
    const isPlanning = "mode" in spec.action && (spec.action.mode === "propose" || spec.action.mode === "estimate");
    if (!isPlanning) {
      expect(existsSync(join(consortDir, "agent-log.jsonl")), `${spec.name} reconciled agent-log under .consort (meta)`).toBe(true);
    }

    // A clean produce routed (no violations blocked it) , the executor returned a bounded action.
    expect(bounded!.action, `${spec.name} produced a route`).toBeDefined();
  } finally {
    delete process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS;
    rmSync(projectDir, { recursive: true, force: true });
  }
}
