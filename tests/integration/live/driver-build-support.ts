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
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { loadRunConfig } from "../../../consort/orchestrator/manifest/run-config-loader.js";
import { catalogueLifecycleDeps } from "../../../consort/orchestrator/manifest/lifecycle-catalogue.js";
import type { LifecycleRunContext } from "../../../consort/orchestrator/manifest/orchestration-runner.js";
import type { ScaffoldHandle } from "../../../consort/orchestrator/manifest/lifecycle-catalogue.js";
import { cutExperiment } from "../../../scripts/sftdd/experiment.js";
import { runDriver } from "../../../consort/orchestrator/drive/orchestrator-run.js";
import { buildDriveEffects } from "../../../consort/orchestrator/drive/orchestrator-effects.js";
import { execRunner } from "../../../consort/orchestrator/drive/drive-runner.js";
import type { DriveEffectsConfig } from "../../../consort/orchestrator/drive/orchestrator-effects.js";
import type { WorkflowAction } from "../../../consort/orchestrator/drive/orchestrator-drive.js";
import { resolveSftddSettings } from "../../../consort/orchestrator/drive/sftdd-config.js";
import { writePipeline, readPipeline } from "../../../scripts/sftdd/story-pipeline.js";
import { beginNextPendingBatch, storyTestProgress } from "../../../scripts/sftdd/cycle-record.js";

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
  const sftddDir = join(projectDir, ".sftdd");
  const featureDir = join(sftddDir, "features", b.feature);
  const storyDir = join(featureDir, "stories", b.story);
  mkdirSync(join(storyDir, "acs"), { recursive: true });
  mkdirSync(join(sftddDir, "architecture"), { recursive: true });

  cpSync(b.preRedCodeDir, projectDir, { recursive: true });
  for (const f of ["architecture.json", "db-design.json"]) {
    cpSync(join(b.recordedArtifactsFeatureDir, f), join(featureDir, f));
  }
  cpSync(join(b.recordedArtifactsFeatureDir, "stories", b.story, "acs", `${b.ac}.json`), join(storyDir, "acs", `${b.ac}.json`));
  cpSync(b.conventionsJson, join(sftddDir, "architecture", "conventions.json"));

  const master = JSON.parse(readFileSync(join(b.recordedArtifactsFeatureDir, "test-list.json"), "utf8")) as {
    items: Array<Record<string, unknown>>;
  };
  const items = master.items.filter((i) => i.ac_id === b.ac);
  expect(items.length, "bundle: S3 has test-list items").toBeGreaterThan(0);
  writeFileSync(join(storyDir, "test-list-per-story.json"), JSON.stringify({ feature_id: b.feature, story_id: b.story, items }, null, 2) + "\n");
}

/** Resolve the workspace host FROM the check's run-config.json (loadRunConfig applies the
 *  ${DATABRICKS_HOST:-…ecparr…} default). Returns the host + the resolved scaffold-project config so
 *  the caller can gate + so setup uses the SAME config. */
export function resolveDriverGreenRunConfig(): { host: string; scaffoldConfig: Record<string, unknown> } {
  const cfg = loadRunConfig(RUN_CONFIG_PATH);
  const scaffoldConfig = (cfg.setup?.config ?? {}) as Record<string, unknown>;
  const host = String(scaffoldConfig.databricksHost ?? "");
  return { host, scaffoldConfig };
}

/**
 * The ONE setup routine + live driver-GREEN run + teardown, driven through the EXISTING
 * orchestration lifecycle catalogue + the check's run-config. GATED , the caller (the test file)
 * only invokes this behind RUN_LIVE_STEP + LAKEBASE_TEST_E2E. Lifecycle bracket:
 *   scaffold-project (catalogue) -> [overlay bundle + cut branch + seed open-RED + live driver GREEN]
 *   -> remove-project (catalogue, finally).
 */
export async function runDriverGreenLive(): Promise<void> {
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
  const sftddDir = join(projectDir, ".sftdd");
  const teardownCtx: LifecycleRunContext = { workspaceDir: KIT, setupHandle: setup.handle };

  try {
    // ── SEED (bundle overlay): the POST-RED app + tests + design + per-story test-list. ──
    layBundle(projectDir);
    execFileSync("git", ["add", "-A"], { cwd: projectDir, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "seed: pre-RED F6/S3 app + tests + design (driver-green live)", "--no-verify"], { cwd: projectDir, stdio: "pipe" });

    // ── SEED (cut the paired experiment branch): writes .env DATABASE_URL; throws if unsynced. ──
    await cutExperiment({
      instance: lakebaseProjectId,
      sftddDir,
      projectDir,
      featureId: b.feature,
      storyId: b.story,
      experimentSlug,
      branch: `experiment/${b.story}`,
      parentBranch,
    });

    // ── SEED (pipeline + open RED cycle): route nextTransition to driver GREEN for S3. ──
    writePipeline(sftddDir, {
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
    writeFileSync(join(sftddDir, "workflow-state.json"), JSON.stringify({ phase: "implementation", phase_feature_id: b.feature }));
    beginNextPendingBatch({ sftddDir, featureId: b.feature, story: b.story }, { cap: Number.MAX_SAFE_INTEGER });
    expect(storyTestProgress(sftddDir, b.feature, b.story).openRed.length, "setup: an open RED cycle exists").toBeGreaterThan(0);

    // Agent defs so the live `--agent driver` resolves.
    const agentsDst = join(projectDir, ".claude", "agents");
    mkdirSync(agentsDst, { recursive: true });
    cpSync(join(KIT, "skills", "consort", "agents"), agentsDst, { recursive: true });

    process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS = "1";
    process.env.LAKEBASE_KIT_DIR = KIT;

    // ── DRIVE one real driver GREEN on the uncontained live executor (performViaExecutor). Driver
    //    tool-scope is WIDER than navigator RED , it needs Bash to run the project's tests. ──
    const settings = resolveSftddSettings({ projectDir });
    const cfg: DriveEffectsConfig = {
      projectDir,
      sftddDir,
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
    expect(storyTestProgress(sftddDir, b.feature, b.story).allGreen, "the AC's honest-GREEN cycle stamped green against the live branch").toBe(true);
    expect(result.stoppedAtBound || result.stoppedAtMax || result.iterations >= 1).toBe(true);
    expect(readPipeline(sftddDir, b.feature).build_active).toBe(b.story);
    void host;
  } finally {
    // ── TEARDOWN (catalogue remove-project): runner + repo + Lakebase project + dir, never-leaking. ──
    delete process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS;
    await catalogueLifecycleDeps.run({ kind: "remove-project", config: {} }, teardownCtx);
  }
}
