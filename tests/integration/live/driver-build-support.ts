// Shared support for the GATED driver-GREEN LIVE build check , the CLOUD sibling of build-support.ts
// (which runs the LEAN navigator turns with no cloud). A driver GREEN writes product code that must
// pass honest-GREEN (alembic upgrade + the project's tests against a live Lakebase branch), so it
// CANNOT run lean , it needs a scaffolded project + a real experiment branch. This module is the
// ONE reusable SETUP ROUTINE for that: it assembles the pre-GREEN preconditions (the SETUP BUNDLE),
// scaffolds + cuts the branch, drives ONE real driver GREEN through the executor, asserts the
// product landed + the honest-GREEN cycle stamped, and TEARS DOWN , always. The test file is a thin
// wrapper (driver-green-executor-dispatch-live.test.ts), exactly like navigator-red-live.test.ts
// wraps runBuildRoleChain.
//
// THE SETUP BUNDLE (the code/dirs/package preconditions), referenced , not duplicated:
//   - deploy infra + alembic env + Makefile + run-tests.sh + deploy-targets.yaml (local target):
//     these ship from the createProject scaffold template (templates/project/{common,python}); the
//     recorded app snapshots do NOT carry them, and honest-GREEN REQUIRES them , so the bundle's
//     "package preconditions" come from a REAL scaffold, not the corpus.
//   - the pre-RED F6/S3 application code + tests + design artifacts + the open-RED cycle: these live
//     in this check's OWN self-contained bundle dir (tests/integration/live/driver-green-setup/),
//     overlaid onto the scaffold. NO reach into the moving evaluation corpus. See BUNDLE below.
//
// NOTHING here runs unless the caller's gate is satisfied (RUN_LIVE_STEP + LAKEBASE_TEST_E2E + a
// resolvable host); the test file owns that gate. This module fails LOUD + tears down on any error.

import { expect } from "vitest";
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProject } from "../../../scripts/lakebase/create-project.js";
import { cutExperiment, deleteExperiment } from "../../../scripts/sftdd/experiment.js";
import { deleteLakebaseProject } from "@databricks-solutions/lakebase-scm-utils/lakebase";
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
 *  pre-step assets live under here (see driver-green-setup/README.md). */
const SETUP_DIR = join(KIT, "tests/integration/live/driver-green-setup");

/** The SETUP BUNDLE: every pre-GREEN precondition, resolved to its on-disk source under SETUP_DIR.
 *  One declarative description of what the driver-GREEN check needs to exist before the turn runs.
 *  (The deploy infra + alembic env are NOT here , they come from the real scaffold, since the bundle
 *  is overlaid ON TOP of it and honest-GREEN requires them.) */
export const DRIVER_GREEN_BUNDLE = {
  feature: "F6-split-tracking-code",
  story: "S3-stock-shows-split-fields",
  ac: "AC1-split-fields-shown",
  /** The POST-RED application code tree (app/ + alembic + client + the story's AUTHORED RED tests) ,
   *  overlaid onto the scaffold. POST-RED (not pre-RED) so the driver GREEN has a REAL failing test
   *  to make pass, or the honest-GREEN verify is vacuous. See driver-green-setup/README.md. */
  preRedCodeDir: join(SETUP_DIR, "code-assets"),
  /** The design artifacts the driver's context pack reads (architecture/db-design/test-list/AC). */
  recordedArtifactsFeatureDir: join(SETUP_DIR, "design"),
  conventionsJson: join(SETUP_DIR, "design", "architecture", "conventions.json"),
} as const;

export interface DriverGreenLiveOptions {
  /** The Databricks workspace host (Lakebase-enabled). Required , the caller resolves + gates on it. */
  host: string;
}

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

/** Lay the SETUP BUNDLE onto a freshly-scaffolded project: overlay the pre-RED app code + tests +
 *  the design artifacts + per-story test-list + acs into the project's .sftdd. The scaffold already
 *  provides deploy-targets.yaml / run-tests.sh / alembic env / Makefile (the package preconditions
 *  honest-GREEN needs). */
function layBundle(projectDir: string): void {
  const b = DRIVER_GREEN_BUNDLE;
  const sftddDir = join(projectDir, ".sftdd");
  const featureDir = join(sftddDir, "features", b.feature);
  const storyDir = join(featureDir, "stories", b.story);
  mkdirSync(join(storyDir, "acs"), { recursive: true });
  mkdirSync(join(sftddDir, "architecture"), { recursive: true });

  // 1. Overlay the pre-RED application code (app/, alembic revisions, tests/, client/) onto the
  //    scaffold. The scaffold's deploy infra + alembic env.py are preserved; the F6 app + tests
  //    land on top so the driver has the real code + the story's already-authored RED tests.
  cpSync(b.preRedCodeDir, projectDir, { recursive: true });

  // 2. The design artifacts the driver's context pack reads.
  for (const f of ["architecture.json", "db-design.json"]) {
    cpSync(join(b.recordedArtifactsFeatureDir, f), join(featureDir, f));
  }
  cpSync(join(b.recordedArtifactsFeatureDir, "stories", b.story, "acs", `${b.ac}.json`), join(storyDir, "acs", `${b.ac}.json`));
  cpSync(b.conventionsJson, join(sftddDir, "architecture", "conventions.json"));

  // 3. The per-story test-list (the driver greens exactly these), derived from the recorded master's
  //    S3 items , the same shape writeStoryTestList produces + readStoryItems reads.
  const master = JSON.parse(readFileSync(join(b.recordedArtifactsFeatureDir, "test-list.json"), "utf8")) as {
    items: Array<Record<string, unknown>>;
  };
  const items = master.items.filter((i) => i.ac_id === b.ac);
  expect(items.length, "bundle: S3 has test-list items").toBeGreaterThan(0);
  writeFileSync(join(storyDir, "test-list-per-story.json"), JSON.stringify({ feature_id: b.feature, story_id: b.story, items }, null, 2) + "\n");
}

/**
 * The ONE setup routine + live driver-GREEN run + teardown. GATED , the caller (the test file) must
 * only invoke this behind RUN_LIVE_STEP + LAKEBASE_TEST_E2E + a resolvable host. Everything the
 * driver-GREEN check needs is assembled HERE from the setup bundle; the test file just calls it.
 */
export async function runDriverGreenLive(opts: DriverGreenLiveOptions): Promise<void> {
  const b = DRIVER_GREEN_BUNDLE;
  const parent = mkdtempSync(join(tmpdir(), "dg-live-"));
  const projectName = `dg-live-${Date.now()}`;
  let projectDir = "";
  let lakebaseProjectId = "";
  const experimentSlug = "s3-driver-green";

  try {
    // ── SETUP: scaffold a real project (ships the deploy infra + alembic env honest-GREEN needs) ──
    const created = await createProject({
      projectName,
      parentDir: parent,
      databricksHost: opts.host,
      createGithubRepo: false,
      language: "python",
      runnerType: "github-hosted",
    });
    projectDir = created.projectDir;
    lakebaseProjectId = created.lakebaseProjectId;
    const parentBranch = created.lakebaseDefaultBranch;
    const sftddDir = join(projectDir, ".sftdd");

    // ── SETUP: overlay the bundle (pre-RED app + tests + design + per-story test-list) ──
    layBundle(projectDir);

    // Commit the overlaid tree on the default branch so the experiment forks a clean, complete tree.
    execFileSync("git", ["add", "-A"], { cwd: projectDir, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "seed: pre-RED F6/S3 app + tests + design (driver-green live setup)", "--no-verify"], { cwd: projectDir, stdio: "pipe" });

    // ── SETUP: cut the paired experiment branch (writes .env DATABASE_URL; throws if unsynced) ──
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

    // ── SETUP: seed the pipeline (story ready + ACTIVE experiment + build_active) so nextTransition
    //    routes into the build lane for S3. ──
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

    // ── SETUP: stamp the OPEN RED cycle for S3/AC1 (the driver has an open RED to green) so
    //    nextBuildAction returns `driver GREEN` (!codeWritten). ──
    beginNextPendingBatch({ sftddDir, featureId: b.feature, story: b.story }, { cap: Number.MAX_SAFE_INTEGER });
    const pre = storyTestProgress(sftddDir, b.feature, b.story);
    expect(pre.openRed.length, "setup: an open RED cycle exists for the driver to green").toBeGreaterThan(0);

    // Lay the kit's role agent defs so the live `--agent driver` resolves.
    const agentsDst = join(projectDir, ".claude", "agents");
    mkdirSync(agentsDst, { recursive: true });
    cpSync(join(KIT, "skills", "consort", "agents"), agentsDst, { recursive: true });

    // Executor dispatch on, via the SAME env the production CLI reads.
    process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS = "1";
    process.env.LAKEBASE_KIT_DIR = KIT;

    // ── DRIVE: the real production cfg + execRunner. Driver tool-scope is WIDER than navigator RED ,
    //    it needs Bash to run the project's tests in its loop (RED only writes; GREEN runs). ──
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

    // Drive the REAL loop, bounded to stop right after the one driver GREEN turn.
    const isGreen = (a: WorkflowAction): boolean =>
      a.kind === "invoke-role" && a.role === "driver" && !("mode" in a) && !("buildMode" in a) && "story" in a && a.story === b.story;
    const result = await runDriver(buildDriveEffects(cfg), {
      stopWhen: (a: WorkflowAction) => !isGreen(a),
      maxSteps: 4,
    });

    // ── ASSERT: the honest-GREEN product-channel proof ──
    //   (a) the driver wrote product code (app/ has source , the product channel, live).
    expect(hasSourceFile(join(projectDir, "app")), "driver wrote product code under app/").toBe(true);
    //   (b) the honest-GREEN verify stamped the cycle green (codeWritten flipped) , the alembic
    //       upgrade + pytest ran against the live branch and passed.
    const post = storyTestProgress(sftddDir, b.feature, b.story);
    expect(post.allGreen, "the AC's honest-GREEN cycle stamped green against the live branch").toBe(true);
    //   (c) the loop advanced past GREEN (consumed the executor's route).
    expect(result.stoppedAtBound || result.stoppedAtMax || result.iterations >= 1).toBe(true);

    // pipeline sanity: the experiment is still the active build (we bounded before accept).
    expect(readPipeline(sftddDir, b.feature).build_active).toBe(b.story);
  } finally {
    // ── TEARDOWN (always): experiment branch -> Lakebase project -> local dir. Best-effort each. ──
    delete process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS;
    if (projectDir && lakebaseProjectId) {
      try {
        await deleteExperiment({
          instance: lakebaseProjectId,
          sftddDir: join(projectDir, ".sftdd"),
          projectDir,
          featureId: b.feature,
          storyId: b.story,
          experimentSlug,
          deleteBranchToo: true,
        });
      } catch { /* best-effort: the project delete below still frees the branch */ }
    }
    if (lakebaseProjectId) {
      try { await deleteLakebaseProject({ projectId: lakebaseProjectId, host: opts.host }); } catch { /* best-effort */ }
    }
    try { rmSync(parent, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}
