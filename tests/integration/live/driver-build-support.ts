// Shared support for the GATED driver-GREEN LIVE build check , the CLOUD sibling of build-support.ts
// (which runs the LEAN navigator turns with no cloud). A driver GREEN writes product code that must
// pass honest-GREEN (alembic upgrade + the project's tests against a live Lakebase branch), so it
// CANNOT run lean , it needs a scaffolded project + a real experiment branch.
//
// CONFIG-DRIVEN + built on the EXISTING orchestration machinery (no bespoke createProject/teardown,
// no hand-picked profile):
//   - the workspace host comes from the check's OWN run-config.json (driver-green-setup/run-config.json)
//     read by loadRunConfig , its databricksHost is `${DATABRICKS_HOST:-…ecparr…}`, so the ecparr
//     default lives IN CONFIG and any operator overrides via DATABRICKS_HOST (run-all-live-tests.sh
//     sets it from --profile). NO `databricks auth env` guessing here.
//   - setup + teardown are the CATALOGUED lifecycle ops scaffold-project / remove-project
//     (lifecycle-catalogue.ts) , the SAME never-leaking create + teardown the stockflow demo uses.
//     We invoke them via catalogueLifecycleDeps, threading the scaffold handle into teardown.
//   - BETWEEN scaffold and teardown we seed the pre-GREEN state from the self-contained SETUP BUNDLE
//     (driver-green-setup/) and run ONE real driver GREEN on the uncontained live executor
//     (performViaExecutor). The vanilla manifest chain is CONTAINED (ClaudeStepAgent); the live drive
//     is uncontained (execRunner), so the turn runs on the proven runDriver path between the
//     catalogued lifecycle ops rather than as a contained chain step.
//
// THE SETUP BUNDLE (self-contained, driver-green-setup/ , NO reach into the moving evaluation corpus):
//   - code-assets/ : the POST-RED F6/S3 app tree (app/ + alembic + client + the authored RED tests),
//     overlaid onto the scaffold. POST-RED so the driver GREEN has a REAL failing test to pass.
//   - design/ : architecture/db-design/test-list/AC + conventions the driver's context pack reads.
//   (deploy-targets.yaml / run-tests.sh / alembic env come from the SCAFFOLD, not the bundle.)

import { expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { loadRunConfig } from "../../../consort/orchestrator/runners/run-config-loader.js";
import { resolveTestEnv } from "../../../consort/orchestrator/provisioning/test-env.js";
import { layDownKitAgents, overlayBundle } from "../../../consort/orchestrator/provisioning/bundle.js";
import { catalogueLifecycleDeps } from "../../../consort/orchestrator/provisioning/lifecycle-catalogue.js";
import type { LifecycleRunContext } from "../../../consort/orchestrator/provisioning/lifecycle-types.js";
import type { ScaffoldHandle } from "../../../consort/orchestrator/provisioning/lifecycle-catalogue.js";
import { cutExperiment } from "../../../consort/experiment/experiment.js";
import { runDriver } from "../../../consort/orchestrator/drive/orchestrator-run.js";
import { buildDriveEffects } from "../../../consort/orchestrator/drive/orchestrator-effects.js";
import { execRunner } from "../../../consort/orchestrator/drive/claude-runner.js";
import type { DriveEffectsConfig } from "../../../consort/orchestrator/drive/orchestrator-effects.js";
import type { WorkflowAction } from "../../../consort/orchestrator/drive/orchestrator-drive.js";
import { resolveConsortSettings } from "../../../consort/orchestrator/settings/project-settings.js";
import { writePipeline, readPipeline } from "../../../consort/pipeline/story-pipeline.js";
import { beginNextPendingBatch, storyTestProgress } from "../../../consort/pipeline/cycle-record.js";

export const KIT = process.cwd();
/** The SELF-CONTAINED setup bundle for this check , NO reach into the moving evaluation corpus. All
 *  pre-step assets live under here (see driver-green-setup/README.md), including its run-config.json. */
const SETUP_DIR = join(KIT, "tests/integration/live/driver-green-setup");
const RUN_CONFIG_PATH = join(SETUP_DIR, "driver-green.run.json");

/** The SETUP BUNDLE: every pre-GREEN precondition, resolved to its on-disk source under SETUP_DIR. */
export const DRIVER_GREEN_BUNDLE = {
  feature: "F6-split-tracking-code",
  story: "S3-stock-shows-split-fields",
  ac: "AC1-split-fields-shown",
  /** The POST-RED application code tree (app/ + alembic + client + the authored RED tests). */
  preRedCodeDir: join(SETUP_DIR, "code-assets"),
  /** The design artifacts the driver's context pack reads. */
  recordedArtifactsFeatureDir: join(SETUP_DIR, "design"),
  conventionsJson: join(SETUP_DIR, "design", "architecture", "conventions.json"),
} as const;

/** True when a dir tree holds >=1 source file (.py/.ts/.tsx). */
function hasSourceFile(dir: string): boolean {
  if (!existsSync(dir)) return false;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (hasSourceFile(abs)) return true;
    } else if (/\.(py|ts|tsx)$/.test(e.name)) {
      return true;
    }
  }
  return false;
}

/** Overlay the SETUP BUNDLE onto a freshly-scaffolded project: the POST-RED app code + tests + the
 *  design artifacts + per-story test-list + acs. The scaffold already provides deploy-targets.yaml /
 *  run-tests.sh / alembic env / Makefile (the package preconditions honest-GREEN needs). */
function layBundle(projectDir: string): void {
  const b = DRIVER_GREEN_BUNDLE;
  const featureRel = join(".sftdd", "features", b.feature);
  const storyRel = join(featureRel, "stories", b.story);

  // Overlay the recorded trees + files via the shared provisioning primitive (it creates parent
  // dirs for each file, so no explicit mkdirSync is needed).
  overlayBundle(projectDir, {
    trees: [{ from: b.preRedCodeDir, to: "." }],
    files: [
      { from: join(b.recordedArtifactsFeatureDir, "architecture.json"), to: join(featureRel, "architecture.json") },
      { from: join(b.recordedArtifactsFeatureDir, "db-design.json"), to: join(featureRel, "db-design.json") },
      { from: join(b.recordedArtifactsFeatureDir, "stories", b.story, "acs", `${b.ac}.json`), to: join(storyRel, "acs", `${b.ac}.json`) },
      { from: b.conventionsJson, to: join(".sftdd", "architecture", "conventions.json") },
    ],
  });

  const master = JSON.parse(readFileSync(join(b.recordedArtifactsFeatureDir, "test-list.json"), "utf8")) as {
    items: Array<Record<string, unknown>>;
  };
  const items = master.items.filter((i) => i.ac_id === b.ac);
  expect(items.length, "bundle: S3 has test-list items").toBeGreaterThan(0);
  writeFileSync(join(projectDir, storyRel, "test-list-per-story.json"), JSON.stringify({ feature_id: b.feature, story_id: b.story, items }, null, 2) + "\n");
}

/** Resolve the scaffold config from the check's run-config. The workspace HOST comes from the ONE
 *  config home (resolveTestEnv -> .env.local.test.config); we export it as DATABRICKS_HOST so the
 *  run-config's required ${DATABRICKS_HOST} marker resolves against it (the run-config carries NO
 *  hardcoded workspace). Returns the host + the resolved scaffold-project config. When the config
 *  home is unset, host is "" (undefined test env) and the caller's gate skips. */
export function resolveDriverGreenRunConfig(): { host: string; scaffoldConfig: Record<string, unknown> } {
  const host = resolveTestEnv().host ?? "";
  if (host && !process.env.DATABRICKS_HOST) process.env.DATABRICKS_HOST = host;
  if (!host) return { host: "", scaffoldConfig: {} }; // unconfigured => skip (loadRunConfig would throw on the required marker)
  const cfg = loadRunConfig(RUN_CONFIG_PATH);
  const scaffoldConfig = (cfg.setup?.config ?? {}) as Record<string, unknown>;
  return { host: String(scaffoldConfig.databricksHost ?? host), scaffoldConfig };
}

/** Context handed to an afterGreen hook: everything needed to judge the driver's produced code (the
 *  live project dir + the bundle's feature + the pin story index) BEFORE teardown removes the tree. */
export interface DriverGreenContext {
  /** The scaffolded project dir , the driver's app/ product code lives at its root. */
  projectDir: string;
  /** The feature the bundle built (F6-split-tracking-code). */
  featureId: string;
  /** The story's positional index in the pin's recorded-build (S3 is the 2nd F6 story => 1). */
  storyIndex: number;
}

/** Options for the live driver-GREEN run: an OPTIONAL afterGreen hook the caller uses to judge the
 *  produced code against the pin (the CODE-equivalence proof) BEFORE the project is torn down. */
export interface RunDriverGreenOptions {
  afterGreen?(ctx: DriverGreenContext): Promise<void>;
}

/**
 * The ONE setup routine + live driver-GREEN run + teardown, driven through the EXISTING
 * orchestration lifecycle catalogue + the check's run-config. GATED , the caller (the test file)
 * only invokes this behind RUN_LIVE_STEP + LAKEBASE_TEST_E2E. Lifecycle bracket:
 *   scaffold-project (catalogue) -> [overlay bundle + cut branch + seed open-RED + live driver GREEN]
 *   -> remove-project (catalogue, finally).
 * An optional afterGreen hook runs against the produced code (before teardown) , the CODE-equivalence
 * comparison drives this to judge the driver's app/ tree against the pin's recorded-build reference.
 */
export async function runDriverGreenLive(opts: RunDriverGreenOptions = {}): Promise<void> {
  const b = DRIVER_GREEN_BUNDLE;
  const { scaffoldConfig } = resolveDriverGreenRunConfig();
  const experimentSlug = "s3-driver-green";

  // ── SETUP (catalogue scaffold-project): a REAL project on the config-resolved host. The op reads
  //    databricksHost from the run-config, ships deploy infra + alembic env, returns the handle. ──
  const setupCtx: LifecycleRunContext = { workspaceDir: KIT };
  const setup = await catalogueLifecycleDeps.run({ kind: "scaffold-project", config: scaffoldConfig }, setupCtx);
  if (!setup.ok || !setup.handle) throw new Error(`scaffold-project failed: ${setup.error ?? "no handle"}`);
  const handle = setup.handle as ScaffoldHandle;
  const projectDir = handle.projectDir!;
  const lakebaseProjectId = handle.lakebaseProjectId!;
  const host = handle.databricksHost!;
  const parentBranch = handle.lakebaseDefaultBranch ?? "production";
  const consortDir = join(projectDir, ".sftdd");
  const teardownCtx: LifecycleRunContext = { workspaceDir: KIT, setupHandle: setup.handle };

  try {
    // ── SEED (bundle overlay): the POST-RED app + tests + design + per-story test-list. ──
    layBundle(projectDir);
    execFileSync("git", ["add", "-A"], { cwd: projectDir, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "seed: pre-RED F6/S3 app + tests + design (driver-green live)", "--no-verify"], { cwd: projectDir, stdio: "pipe" });

    // ── SEED (cut the paired experiment branch): writes .env DATABASE_URL; throws if unsynced. ──
    await cutExperiment({
      instance: lakebaseProjectId,
      consortDir,
      projectDir,
      featureId: b.feature,
      storyId: b.story,
      experimentSlug,
      branch: `experiment/${b.story}`,
      parentBranch,
    });

    // ── SEED (pipeline + open RED cycle): route nextTransition to driver GREEN for S3. ──
    writePipeline(consortDir, {
      version: 1,
      feature_id: b.feature,
      stories: {
        [b.story]: {
          status: "ready",
          gate: { status: "approved", approver: "human-proxy", approved_at: "2026-08-05T00:00:00Z", history: [] },
          experiment: { slug: experimentSlug, branch: `experiment/${b.story}`, parent: parentBranch, n: 1, status: "active", cut_at: "2026-08-05T00:00:00Z" },
        },
      },
      build_queue: [b.story],
      build_active: b.story,
    } as never);
    writeFileSync(join(consortDir, "workflow-state.json"), JSON.stringify({ phase: "implementation", phase_feature_id: b.feature }));
    beginNextPendingBatch({ consortDir, featureId: b.feature, story: b.story }, { cap: Number.MAX_SAFE_INTEGER });
    expect(storyTestProgress(consortDir, b.feature, b.story).openRed.length, "setup: an open RED cycle exists").toBeGreaterThan(0);

    // Agent defs so the live `--agent driver` resolves , the shared provisioning primitive (KIT is
    // process.cwd(), layDownKitAgents's default kitDir), no inline copy.
    layDownKitAgents(projectDir, KIT);

    process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS = "1";
    process.env.LAKEBASE_KIT_DIR = KIT;

    // ── DRIVE one real driver GREEN on the uncontained live executor (performViaExecutor). Driver
    //    tool-scope is WIDER than navigator RED , it needs Bash to run the project's tests. ──
    const settings = resolveConsortSettings({ projectDir });
    const cfg: DriveEffectsConfig = {
      projectDir,
      consortDir,
      featureId: b.feature,
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
      allowedToolsForRole: (role) => (role === "driver" ? ["Write", "Read", "Edit", "Bash"] : undefined),
    } as DriveEffectsConfig;
    cfg.runner = execRunner(cfg);

    const isGreen = (a: WorkflowAction): boolean =>
      a.kind === "invoke-role" && a.role === "driver" && !("mode" in a) && !("buildMode" in a) && "story" in a && a.story === b.story;
    const result = await runDriver(buildDriveEffects(cfg), { stopWhen: (a: WorkflowAction) => !isGreen(a), maxSteps: 4 });

    // ── ASSERT: the honest-GREEN product-channel proof ──
    expect(hasSourceFile(join(projectDir, "app")), "driver wrote product code under app/").toBe(true);
    expect(storyTestProgress(consortDir, b.feature, b.story).allGreen, "the AC's honest-GREEN cycle stamped green against the live branch").toBe(true);
    expect(result.stoppedAtBound || result.stoppedAtMax || result.iterations >= 1).toBe(true);
    expect(readPipeline(consortDir, b.feature).build_active).toBe(b.story);
    void host;

    // The CODE-equivalence proof (when the caller supplied one) judges the driver's app/ tree against
    // the pin BEFORE teardown. S3 is the 2nd recorded F6 story => storyIndex 1 (resolveBuildReference
    // matches positionally, since slugs differ across corpora).
    if (opts.afterGreen) await opts.afterGreen({ projectDir, featureId: b.feature, storyIndex: 1 });
  } finally {
    // ── TEARDOWN (catalogue remove-project): runner + repo + Lakebase project + dir, never-leaking. ──
    delete process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS;
    await catalogueLifecycleDeps.run({ kind: "remove-project", config: {} }, teardownCtx);
  }
}
