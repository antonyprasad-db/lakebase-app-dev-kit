// Shared support for the GATED design-equivalence LIVE check , the UNCONSTRAINED-channel sibling of
// the lean design-equivalence attempt. The lean version (tool-scoped Write/Read, throwaway .consort)
// could NOT run faithfully: the production roleTaskBody ends each design turn with a `./scripts/lk`
// self-check the agent must pass before returning, and `lk` runs ONLY from the unconstrained channel
// (Bash + the workspace scripts/lk shim on a scaffolded tree). Lean omits that self-correction step,
// so it measured production-turn-MINUS-self-check (a strictly lesser turn). This harness runs the
// design roles the way production does:
//
//   scaffold-project ONCE (beforeAll) -> for each design step: seed the faithful recorded upstream ->
//   run the PRODUCTION-body turn UNCONSTRAINED (Bash allowed, so ./scripts/lk self-check runs) ->
//   judge the output vs the pin -> RESET the built .consort artifacts -> next step -> remove-project.
//
// CONFIG-DRIVEN + on the EXISTING orchestration machinery (no bespoke create/teardown): the workspace
// host comes from the ONE config home (resolveTestEnv -> .env.local.test.config), scaffold + teardown
// are the catalogued lifecycle ops (scaffold-project / remove-project), same as driver-green. A real
// Lakebase project IS created (for consistency) even though design roles never touch the DB.
//
// RESET CONTRACT (tiered + DB-aware): design roles only Write/Read design docs into .sftdd , they never
// run alembic or insert rows , so the design reset is FILESYSTEM-ONLY (restore .sftdd to the pristine
// scaffold via git). resetState is a composable seam: when this pattern extends to CODE/build turns
// (driver GREEN runs `alembic upgrade` + inserts test rows), the build tier's reset MUST additionally
// `alembic downgrade base` (or reset the experiment branch to its parent) + purge test-inserted data.
// The design harness leaves that DB reset unimplemented BY DESIGN (nothing to undo) but names it here.

import { expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, cpSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadRunConfig } from "../../../consort/orchestrator/runners/run-config-loader.js";
import { resolveTestEnv } from "../../../consort/orchestrator/provisioning/test-env.js";
import { layDownKitAgents } from "../../../consort/orchestrator/provisioning/bundle.js";
import { catalogueLifecycleDeps } from "../../../consort/orchestrator/provisioning/lifecycle-catalogue.js";
import type { ScaffoldHandle } from "../../../consort/orchestrator/provisioning/lifecycle-catalogue.js";
import type { LifecycleRunContext } from "../../../consort/orchestrator/provisioning/lifecycle-types.js";
import { buildDriveEffects, type DriveEffectsConfig } from "../../../consort/orchestrator/drive/orchestrator-effects.js";
import { execRunner } from "../../../consort/orchestrator/drive/claude-runner.js";
import { resolveConsortSettings } from "../../../consort/orchestrator/settings/project-settings.js";
import type { WorkflowAction, DriveState } from "../../../consort/orchestrator/drive/orchestrator-drive.js";
import type { ValidateBoundDeps } from "../../../consort/orchestrator/steps/step-contract.js";
import { evaluateSemanticGate, makeOpusJudge, SEMANTIC_THRESHOLD } from "../../../consort/evaluation/semantic-gate.js";
import type { TurnKey } from "../../../consort/orchestrator/settings/project-settings.js";
import { designSpec, DESIGN_LIVE_STEPS, FEATURE, type DesignLiveSpec } from "./executor-dispatch-live-support.js";

export const KIT = process.cwd();
const SETUP_DIR = join(KIT, "tests/integration/live/design-equivalence-setup");
const RUN_CONFIG_PATH = join(SETUP_DIR, "design-equivalence.run.json");
/** The pin's recorded-artifacts , the faithful recorded upstream each equivalence seed copies from. */
const PIN_ARTIFACTS = join(KIT, "consort/evaluation/reference-assets/stockflow/recorded-artifacts");
/** The scaffold's consort dir basename (createProject scaffolds a .sftdd tree). */
const CONSORT_DIRNAME = ".sftdd";

export { DESIGN_LIVE_STEPS, FEATURE };

const routerDeps: ValidateBoundDeps = {
  allowed: () => ({ kind: "state-derived" }) as unknown as WorkflowAction,
  reviseBudgetAvailable: () => true,
  recordRetry: () => ({ sanctioned: true }),
};

/** Resolve the scaffold config from this check's run-config, exporting the config-home host as
 *  DATABRICKS_HOST so the run-config's required ${DATABRICKS_HOST} marker resolves (mirrors driver-
 *  green). Returns "" host when the config home is unset => the caller's gate skips. */
export function resolveDesignEquivRunConfig(): { host: string; scaffoldConfig: Record<string, unknown> } {
  const host = resolveTestEnv().host ?? "";
  if (host && !process.env.DATABRICKS_HOST) process.env.DATABRICKS_HOST = host;
  if (!host) return { host: "", scaffoldConfig: {} };
  const cfg = loadRunConfig(RUN_CONFIG_PATH);
  const scaffoldConfig = (cfg.setup?.config ?? {}) as Record<string, unknown>;
  return { host: String(scaffoldConfig.databricksHost ?? host), scaffoldConfig };
}

/** True when a directory tree holds at least one file (the acs/ dir-primary check). */
function nonEmptyDir(dir: string): boolean {
  return existsSync(dir) && statSync(dir).isDirectory() && readdirSync(dir).length > 0;
}

/** The scaffolded project a design-equivalence run drives , held for the lifetime of the suite so all
 *  8 steps share ONE scaffold (amortized) and reset between them. */
export interface DesignEquivProject {
  projectDir: string;
  consortDir: string;
  handle: ScaffoldHandle;
  teardownCtx: LifecycleRunContext;
}

/** SCAFFOLD ONCE: a real project (Databricks + Lakebase + optional GitHub) via the catalogued
 *  scaffold-project op, reading databricksHost from the run-config. Lays the kit's role agent defs so
 *  the live `--agent <role>` resolves. Returns the handle the per-step runs seed into + teardown consumes. */
export async function scaffoldDesignEquivProject(): Promise<DesignEquivProject> {
  const { scaffoldConfig } = resolveDesignEquivRunConfig();
  const setupCtx: LifecycleRunContext = { workspaceDir: KIT };
  const setup = await catalogueLifecycleDeps.run({ kind: "scaffold-project", config: scaffoldConfig }, setupCtx);
  if (!setup.ok || !setup.handle) throw new Error(`scaffold-project failed: ${setup.error ?? "no handle"}`);
  const handle = setup.handle as ScaffoldHandle;
  const projectDir = handle.projectDir!;
  layDownKitAgents(projectDir, KIT);
  return {
    projectDir,
    consortDir: join(projectDir, CONSORT_DIRNAME),
    handle,
    teardownCtx: { workspaceDir: KIT, setupHandle: setup.handle },
  };
}

/** TEARDOWN: remove everything scaffold-project created (never-leaking catalogue remove-project). */
export async function teardownDesignEquivProject(project: DesignEquivProject): Promise<void> {
  await catalogueLifecycleDeps.run({ kind: "remove-project", config: {} }, project.teardownCtx);
}

/** RESET the built state between per-step runs. DESIGN tier = FILESYSTEM-ONLY: restore the scaffold's
 *  .sftdd tree to its pristine (post-scaffold) commit + drop anything the turn added, so the next
 *  step's seed lands on a clean tree. The scaffold is a git repo (createProject inits one + commits
 *  the initial tree), so `git checkout -- .sftdd` reverts tracked edits and `git clean -fd .sftdd`
 *  removes newly-created files/dirs. NO DB reset here (design roles never ran alembic or inserted
 *  rows); the build tier that extends this MUST add `alembic downgrade base` + a data purge here. */
function resetDesignState(projectDir: string): void {
  // Best-effort , the scaffold commits its initial tree, so both ops are safe no-ops if nothing changed.
  execFileSync("git", ["checkout", "--", CONSORT_DIRNAME], { cwd: projectDir, stdio: "pipe" });
  execFileSync("git", ["clean", "-fd", CONSORT_DIRNAME], { cwd: projectDir, stdio: "pipe" });
}

/** The DriveEffectsConfig for a design-equivalence turn: UNCONSTRAINED (Bash allowed) so the role's
 *  ./scripts/lk self-check runs exactly as production does. NO taskSuffix , the production buildTaskBody
 *  is the whole prompt (the equivalence proof measures the REAL production turn). */
function equivCfg(projectDir: string, consortDir: string): DriveEffectsConfig {
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
    // UNCONSTRAINED: the design role gets the full production tool set (Bash for ./scripts/lk). NO
    // taskSuffix set => performViaExecutor uses the pure production buildTaskBody.
  } as DriveEffectsConfig;
  cfg.runner = execRunner(cfg);
  return cfg;
}

/** Seed a spec's faithful recorded upstream (equivalenceSeed) into the scaffold's .sftdd. */
function seedUpstream(consortDir: string, spec: DesignLiveSpec): void {
  const seed = spec.equivalenceSeed ?? spec.seed;
  for (const s of seed) {
    const dest = join(consortDir, s.rel);
    mkdirSync(dirname(dest), { recursive: true });
    const withAbs = s as { rel: string; from?: string; fromAbs?: string; content?: string };
    if (withAbs.fromAbs) cpSync(withAbs.fromAbs, dest, { recursive: true });
    else if (s.from) cpSync(join(KIT, "tests/integration/intake", s.from), dest);
    else writeFileSync(dest, s.content ?? "seed\n");
  }
}

/**
 * Run ONE design step's PRODUCTION-body turn on the shared scaffold, judge it vs the pin, and RESET.
 * Seeds the faithful recorded upstream, dispatches through the shipped performViaExecutor path with the
 * pure production prompt (unconstrained, so ./scripts/lk self-check runs), asserts the artifact landed,
 * then judges semantic equivalence to the pin at spec.step (per-story slice for the story-scoped roles).
 * Always resets the .sftdd tree afterward (finally), so the next step starts pristine.
 */
export async function runDesignEquivStep(project: DesignEquivProject, step: TurnKey): Promise<void> {
  const spec = designSpec(step);
  const { projectDir, consortDir } = project;

  process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS = "1";
  process.env.LAKEBASE_KIT_DIR = KIT;
  try {
    seedUpstream(consortDir, spec);
    const cfg = equivCfg(projectDir, consortDir);
    const state = { phase: "feature" } as unknown as DriveState;
    const effects = buildDriveEffects(cfg);
    const bounded = await effects.performViaExecutor!(spec.action, state, routerDeps);
    expect(bounded, `${spec.name} should be executor-dispatched`).toBeDefined();

    // The artifact landed under .sftdd at its feature/story-scoped path (the artifact channel).
    const artifactAbs = join(consortDir, spec.artifactRel);
    if (spec.artifactIsDir) {
      expect(nonEmptyDir(artifactAbs), `${spec.name} produced a non-empty ${spec.artifactRel}/`).toBe(true);
    } else {
      expect(existsSync(artifactAbs), `${spec.name} produced ${spec.artifactRel}`).toBe(true);
    }

    // Judge semantic equivalence to the pin , the SHARED judge, per-story slice where the role is
    // story-scoped (its feature artifact is accreted across stories in the real drive).
    const referencePaths = spec.equivalenceReferencePaths?.(KIT);
    const outcome = await evaluateSemanticGate({
      kitRoot: KIT,
      consortDir,
      featureId: FEATURE,
      step: spec.step,
      judge: makeOpusJudge({ cwd: KIT }),
      ...(spec.equivalenceStoryId ? { storyId: spec.equivalenceStoryId } : {}),
      ...(referencePaths?.length ? { referencePaths } : {}),
    });
    // eslint-disable-next-line no-console
    console.log(
      `[design-equivalence] ${step}: ${outcome.skipped ? "SKIPPED (no pinned reference)" : outcome.passed ? `PASSED (score ${outcome.score?.toFixed(2)} >= ${SEMANTIC_THRESHOLD})` : `FAILED , ${outcome.reason}`}`,
    );
    expect(
      outcome.passed,
      `${step}: produced artifact not semantically equivalent to the pin , ${outcome.reason ?? "below threshold"}`,
    ).toBe(true);
  } finally {
    delete process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS;
    // RESET (filesystem) so the next step seeds onto a pristine .sftdd , see resetDesignState's note
    // on the tiered/DB-aware contract the build tier extends.
    resetDesignState(projectDir);
  }
}
