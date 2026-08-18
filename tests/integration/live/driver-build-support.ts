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

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { classifyBuildTrial, type BuildTrialSignals } from "../../../consort/optimize/optimize-build-trial.js";
import { loadRunConfig } from "../../../consort/orchestrator/runners/run-config-loader.js";
import { resolveTestEnv } from "../../../consort/orchestrator/provisioning/test-env.js";
import { layDownKitAgents, overlayBundle } from "../../../consort/orchestrator/provisioning/bundle.js";
import { resolveKitSingleSource, assertKitSingleSource, clearKitSingleSource } from "./kit-resolution.js";
import { catalogueLifecycleDeps } from "../../../consort/orchestrator/provisioning/lifecycle-catalogue.js";
import type { LifecycleRunContext } from "../../../consort/orchestrator/provisioning/lifecycle-types.js";
import type { ScaffoldHandle } from "../../../consort/orchestrator/provisioning/lifecycle-catalogue.js";
import { cutExperiment, deleteExperiment } from "../../../consort/experiment/experiment.js";
import { cutWorktree, forceRemoveWorktree } from "./shared-scaffold-support.js";
import { snapshotTree } from "../../../consort/orchestrator/scenarios/integration-chain.js";
import { sweepOrphanProjects, DEFAULT_TEST_PROJECT_PREFIXES } from "../../../consort/setup/orphan-project-sweep.js";
import { runDriver } from "../../../consort/orchestrator/drive/orchestrator-run.js";
import { buildDriveEffects } from "../../../consort/orchestrator/drive/orchestrator-effects.js";
import { execRunner } from "../../../consort/orchestrator/drive/claude-runner.js";
import type { DriveEffectsConfig } from "../../../consort/orchestrator/drive/orchestrator-effects.js";
import type { WorkflowAction } from "../../../consort/orchestrator/drive/orchestrator-drive.js";
import { writePipeline, readPipeline } from "../../../consort/pipeline/story-pipeline.js";
import { beginNextPendingBatch, storyTestProgress } from "../../../consort/pipeline/cycle-record.js";
import { cycleDir } from "../../../consort/config/consort-paths.js";
import { readRunConfig, type RunConfig } from "../../../consort/session/run-config.js";
import { readReplaySet, rehydrate, type ReplaySet } from "../../optimization/replay-turn.js";
import { applyDriverLevers, assignWorktreePort } from "../../optimization/driver-green-enforcement.js";
import { peekLastAgentTranscript, peekLastAgentUsage } from "../../../consort/orchestrator/drive/claude-runner.js";
import type { TurnUsage } from "../../../consort/session/claude-usage.js";

export const KIT = process.cwd();

/** Runner-independent assertion. This module is imported BOTH by the vitest live test AND by the
 *  standalone optimize-role CLI (the driver-green sweep), so it must NOT import `expect` from vitest
 *  , that pulls in the test-runner's worker state and throws at import time outside a vitest run. A
 *  local throw-on-false gives the same fail-loud behavior in both contexts. */
class DriverGreenAssertionError extends Error {}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new DriverGreenAssertionError(message);
}
function assertGt(actual: number, floor: number, message: string): void {
  assert(actual > floor, `${message} (expected > ${floor}, got ${actual})`);
}
function assertEq<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} (expected ${String(expected)}, got ${String(actual)})`);
}
/** The SELF-CONTAINED setup bundle for this check , NO reach into the moving evaluation corpus. All
 *  pre-step assets live under here (see driver-green-setup/README.md), including its run-config.json. */
const SETUP_DIR = join(KIT, "tests/integration/live/driver-green-setup");
const RUN_CONFIG_PATH = join(SETUP_DIR, "driver-green.run.json");
/** The RECORDED corpus run-config (the run-config.json snapshot the drive itself wrote at record time,
 *  curated into this bundle). It is the SINGLE SOURCE OF SETTINGS for the experiment: EVERY optimization
 *  experiment runs the turn on what the corpus recorded (per-role models, ui_track, loop granularity,
 *  deploy target, session scope, batch cap, gates, review effort), then a candidate's LEVERS override
 *  specific settings to test a perturbation. Read via the COMMON readRunConfig (the same reader the drive
 *  uses) into the COMMON RunConfig type , no bespoke resolver, no inverse mapper: the snapshot already
 *  holds the RESOLVED values, so we read them, never re-derive them. */
function corpusRunConfig(): RunConfig {
  const rc = readRunConfig(SETUP_DIR);
  if (!rc) throw new Error(`driver-green bundle is missing its recorded run-config.json under ${SETUP_DIR}`);
  return rc;
}

/** A resolved pre-GREEN setup bundle: the story identity + the on-disk sources under a bundle dir. */
export interface DriverGreenBundle {
  feature: string;
  story: string;
  ac: string;
  preRedCodeDir: string;
  recordedArtifactsFeatureDir: string;
  conventionsJson: string;
  /** The design-system dir (design-guide.json + .md + ia.md) laid under <consortDir>/design/. */
  designDir: string;
  /** REPLAY source (set when the bundle is a corpus turn): the recorded replay-set. When present,
   *  preRedCodeDir is the recorded pre-project (its <PROJECT_ROOT> token is rehydrated on laydown), the
   *  recorded prompt.txt drives the target turn verbatim (cfg.instructionsOverride), and the recorded
   *  levers.json is the model/effort baseline a candidate lever overrides. Absent => hand-curated seed. */
  replay?: ReplaySet;
}

/** Build a bundle spec from a hand-curated bundle dir (code-assets/ + design/) + story identity. */
function bundleFromDir(dir: string, feature: string, story: string, ac: string): DriverGreenBundle {
  return {
    feature,
    story,
    ac,
    preRedCodeDir: join(dir, "code-assets"),
    recordedArtifactsFeatureDir: join(dir, "design"),
    conventionsJson: join(dir, "design", "architecture", "conventions.json"),
    designDir: join(dir, "design-assets"),
  };
}

/** The recorded stockflow-full corpus root (the source of truth for replay experiments). */
const CORPUS_DIR = join(KIT, "examples/replay/corpora/stockflow-full");
const CORPUS_TURNS = join(CORPUS_DIR, "turns");
const CORPUS_RA = join(CORPUS_DIR, "recorded-artifacts");

/** Build a bundle from an actual CORPUS turn: the pre-turn CODE is the recorded pre-project, the design
 *  artifacts are the corpus recorded-artifacts, and the recorded prompt/levers ride along (replay). This
 *  is how an optimization experiment holds the recorded preconditions constant and perturbs only a lever
 *  , see [[feedback_experiments_replay_corpus_preconditions]]. `turnLabel` = the corpus turn dir name. */
function replayBundleFromTurn(turnLabel: string, ac: string): DriverGreenBundle {
  const rs = readReplaySet(join(CORPUS_TURNS, turnLabel));
  const feature = String((rs.action as { feature?: string }).feature ?? deriveFeatureForStory(rs.story ?? ""));
  const story = rs.story ?? "";
  return {
    feature,
    story,
    ac,
    preRedCodeDir: rs.preProjectDir,
    recordedArtifactsFeatureDir: join(CORPUS_RA, "features", feature),
    conventionsJson: join(CORPUS_RA, "architecture", "conventions.json"),
    designDir: join(CORPUS_RA, "design"),
    replay: rs,
  };
}

/** The default REPLAY bundle per driver-turn kind , the actual corpus turn for the F6-S3 read-UI story
 *  (0156 green / 0158 repair / 0160 refactor). The AC identifies the story's primary AC for the artifact
 *  copy; the recorded per-story test-list covers the whole story regardless. */
function replayBundleForTurn(driverTurn: "green" | "repair" | "refactor"): DriverGreenBundle {
  const AC = "AC1-detail-view-shows-batch-and-serial";
  // GREEN has a deterministic pre-turn routing state (design done + open RED), fully reconstructable from
  // the corpus. REPAIR/REFACTOR need the recorded pre-turn CYCLE state (assessed green-failure + regression,
  // or a refactor:true review-verdict), which the cumulative corpus does not expose per-turn , that
  // reconstruction is the next slice, so fail loud rather than mis-route to green.
  if (driverTurn !== "green") {
    throw new Error(`replay bundle for driverTurn="${driverTurn}" not wired yet: needs pre-turn cycle-state reconstruction (only green is deterministic). Pass opts.bundle explicitly to use a legacy seed.`);
  }
  return replayBundleFromTurn("0156-driver", AC);
}

/** The corpus turn's action carries the story but not always the feature; the corpus has one feature per
 *  story slug family, so resolve it from recorded-artifacts/features (the single dir whose stories/ holds
 *  the story). */
function deriveFeatureForStory(story: string): string {
  for (const f of readdirSync(join(CORPUS_RA, "features"), { withFileTypes: true })) {
    if (f.isDirectory() && existsSync(join(CORPUS_RA, "features", f.name, "stories", story))) return f.name;
  }
  throw new Error(`no corpus feature owns story "${story}" under ${CORPUS_RA}/features`);
}

/** The DEFAULT setup bundle (S3-stock-shows-split-fields, the read-UI turn). A sweep can override it
 *  (opts.bundle) to target another pinned turn , e.g. the S2-drop-combined-code MIGRATION thrasher. */
export const DRIVER_GREEN_BUNDLE: DriverGreenBundle = bundleFromDir(
  SETUP_DIR,
  "F6-split-tracking-code",
  "S3-stock-shows-split-fields",
  "AC1-split-fields-shown",
);

/** Pre-built S2 migration bundle (driver-green-setup-s2/, the run-17 thrasher). Its own dir + story. */
export const DRIVER_GREEN_BUNDLE_S2: DriverGreenBundle = bundleFromDir(
  join(KIT, "tests/integration/live/driver-green-setup-s2"),
  "F6-split-tracking-code",
  "S2-drop-combined-code",
  "AC1-column-dropped",
);

/** Per-driver-turn SEED SOURCES (contained under SETUP_DIR; corpus assumed deleted). Each is the
 *  recorded PRE-TURN snapshot the corpus held right before that driver turn , the drive reads the SAME
 *  cycle-record files, so overlaying the snapshot reproduces the routing state (no probe archaeology):
 *   - green    : the post-RED bundle above (no extra cycles) => nextTransition routes to driver GREEN.
 *   - repair   : recorded 006-navigator-assess snapshot , code/ + cycles/ (green-failure assessed +
 *                regression-assessment with fixDirective => repairRegressionAc routes to driver REPAIR).
 *   - refactor : recorded 010-navigator-review snapshot , code/ + cycles/ (S3 story review-verdict
 *                refactor:true => refactorStoryPending routes to driver REFACTOR). */
const DRIVER_TURN_SEEDS: Record<"repair" | "refactor", { codeDir: string; cyclesDir: string }> = {
  repair: { codeDir: join(SETUP_DIR, "repair-seed", "code-assets"), cyclesDir: join(SETUP_DIR, "repair-seed", "cycles") },
  refactor: { codeDir: join(SETUP_DIR, "refactor-seed", "code-assets"), cyclesDir: join(SETUP_DIR, "refactor-seed", "cycles") },
};

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
 *  run-tests.sh / alembic env / Makefile (the package preconditions honest-GREEN needs).
 *  The artifact-root segment is DERIVED from the caller's resolved `consortDir` (relative to
 *  projectDir), so the bundle lands in the EXACT dir the reads (storyTestProgress, beginNextPendingBatch)
 *  use , no re-derivation, no path string to drift from what the caller already resolved. */
function layBundle(projectDir: string, consortDir: string, driverTurn: "green" | "repair" | "refactor" = "green", bundle: DriverGreenBundle = DRIVER_GREEN_BUNDLE): void {
  const b = bundle;
  const artifactRel = relative(projectDir, consortDir); // the one true artifact root, as the caller resolved it
  const featureRel = join(artifactRel, "features", b.feature);
  const storyRel = join(featureRel, "stories", b.story);

  // The recorded DESIGN output (design-guide.json + .md + ia.md) under <consortDir>/design/. The
  // recording ran ux-designer before any build turn (full-stack corpus), so with uiTrack ON the drive's
  // design gate (orchestrator-drive.ts: uiTrack && breakdownDone && !designGuideReady -> ux-designer) is
  // satisfied by design-guide.json being present , WITHOUT it the drive re-derives ux-designer before the
  // driver turn under test and fails loud on the missing design-brief input. Feature-agnostic (the
  // project design system), so laid for green/repair/refactor alike.
  overlayBundle(projectDir, { trees: [{ from: b.designDir, to: join(artifactRel, "design") }] });

  if (b.replay) {
    // REPLAY: the pre-turn CODE is the recorded pre-project (the exact tree the agent ran against); the
    // build-input artifacts are the corpus recorded-artifacts (architecture / db-design / conventions /
    // story.json + acs/ + the recorded per-story test-list). We copy the SAME build-input set the proven
    // legacy routing needs (not the whole recorded story dir, which also holds post-completion artifacts
    // like deploy-evidence/reflect-verdict that could mis-route), sourced from the recording. The
    // <consortDir>/design/ system + pipeline/open-RED routing (below) do the rest; the recorded prompt.txt
    // drives the turn (cfg.instructionsOverride).
    const raStoryDir = join(b.recordedArtifactsFeatureDir, "stories", b.story);
    const acFiles = readdirSync(join(raStoryDir, "acs")).filter((f) => f.endsWith(".json"));
    overlayBundle(projectDir, {
      trees: [{ from: b.preRedCodeDir, to: "." }],
      files: [
        { from: join(b.recordedArtifactsFeatureDir, "architecture.json"), to: join(featureRel, "architecture.json") },
        { from: join(b.recordedArtifactsFeatureDir, "db-design.json"), to: join(featureRel, "db-design.json") },
        { from: b.conventionsJson, to: join(artifactRel, "architecture", "conventions.json") },
        { from: join(raStoryDir, "story.json"), to: join(storyRel, "story.json") },
        { from: join(raStoryDir, "test-list-per-story.json"), to: join(storyRel, "test-list-per-story.json") },
        ...acFiles.map((f) => ({ from: join(raStoryDir, "acs", f), to: join(storyRel, "acs", f) })),
      ],
    });
    // The recorded prompt's RUBRIC cites the narrative .md artifacts ("open ONLY if you need more"); lay
    // whichever the recording has so no cited path dangles when the driver follows it.
    for (const [src, dst] of [
      [join(b.recordedArtifactsFeatureDir, "architecture.md"), join(featureRel, "architecture.md")],
      [join(b.recordedArtifactsFeatureDir, "db-design.md"), join(featureRel, "db-design.md")],
      [join(CORPUS_RA, "nfrs.md"), join(artifactRel, "nfrs.md")],
    ] as const) {
      if (existsSync(src)) overlayBundle(projectDir, { files: [{ from: src, to: dst }] });
    }
    return;
  }

  // ── LEGACY hand-curated seed (SETUP_DIR bundles) , superseded by the replay path above. ──
  // The CODE tree: green seeds the post-RED bundle; repair/refactor seed their recorded PRE-TURN snapshot.
  const codeDir = driverTurn === "green" ? b.preRedCodeDir : DRIVER_TURN_SEEDS[driverTurn].codeDir;
  overlayBundle(projectDir, {
    trees: [{ from: codeDir, to: "." }],
    files: [
      { from: join(b.recordedArtifactsFeatureDir, "architecture.json"), to: join(featureRel, "architecture.json") },
      { from: join(b.recordedArtifactsFeatureDir, "db-design.json"), to: join(featureRel, "db-design.json") },
      { from: join(b.recordedArtifactsFeatureDir, "stories", b.story, "acs", `${b.ac}.json`), to: join(storyRel, "acs", `${b.ac}.json`) },
      { from: b.conventionsJson, to: join(artifactRel, "architecture", "conventions.json") },
    ],
  });

  const master = JSON.parse(readFileSync(join(b.recordedArtifactsFeatureDir, "test-list.json"), "utf8")) as {
    items: Array<Record<string, unknown>>;
  };
  const items = master.items.filter((i) => i.ac_id === b.ac);
  assertGt(items.length, 0, "bundle: S3 has test-list items");
  writeFileSync(join(projectDir, storyRel, "test-list-per-story.json"), JSON.stringify({ feature_id: b.feature, story_id: b.story, items }, null, 2) + "\n");

  // repair/refactor: overlay the recorded PRE-TURN cycle markers into <consortDir>/cycles/ so the drive's
  // probes (repairRegressionAc / refactorStoryPending) read the SAME on-disk state the corpus recorded and
  // route to the intended driver turn. green writes no cycles here (its open-RED cycle is seeded by the
  // pipeline block via beginNextPendingBatch).
  if (driverTurn !== "green") {
    overlayBundle(consortDir, { trees: [{ from: DRIVER_TURN_SEEDS[driverTurn].cyclesDir, to: "cycles" }] });
  }
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
  /** Per-candidate override for experimentSlug (default: "s3-driver-green"). Must be unique per
   *  concurrent candidate so branch+project names don't collide. */
  experimentSlug?: string;
  /** Per-candidate override for the experiment branch name (default: "experiment/S3-stock-shows-split-fields").
   *  Must be unique per concurrent candidate. */
  branch?: string;
  /** Per-candidate deploy port. When set, the worktree's deploy-targets.yaml is rewritten so the
   *  honest-GREEN verify binds + polls THIS port instead of the shared :8000 , the concurrency-safety
   *  fix for --concurrency > 1 (each candidate owns a distinct port, deterministic by index). */
  port?: number;
  /** Override the setup bundle (default S3). Pass DRIVER_GREEN_BUNDLE_S2 to sweep the S2-drop-combined
   *  MIGRATION thrasher instead. Selects the post-RED tree, design, story/ac the turn drives against. */
  bundle?: DriverGreenBundle;
  /** Per-candidate lever overrides: model, effort, allowedTools, disallowedTools. Merged into the
   *  driver turn's config ONLY (does not affect navigator or other roles). When absent, uses the
   *  settings defaults. */
  leverOverride?: {
    model?: string;
    effort?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    /** DRIVER-GREEN enforcement + context levers (DRIVER-GREEN-LEVERS.md). Applied to the worktree
     *  before the driver turn via applyDriverLevers: guardSuite installs the single-test-guard
     *  PreToolUse hook, denyBash writes permissions.deny globs, ctxPack writes the ctx-levers marker
     *  buildContextPack reads. */
    guardSuite?: boolean;
    guardScan?: boolean;
    denyBash?: string[];
    ctxPack?: ("db-state" | "failing-test" | "scope-note" | "migration")[];
    /** ENVIRONMENT/replay levers. Each DEFAULTS to the RECORDED corpus run-config value; a candidate may
     *  OVERRIDE it here to vary the environment the turn replays under. Mirrors the same fields on
     *  RoleLeverPatch. */
    uiTrack?: boolean;
    loopGranularity?: "story" | "ac" | "hybrid-a";
    deployTarget?: "local" | "workspace";
    buildSessionScope?: "cycle" | "story";
    batchCap?: number;
  };
  /** Which driver turn to exercise (each seeded to its own flagged pre-turn state, then evaluated by the
   *  navigator turn that follows it): "green" (default , post-RED seed -> driver GREEN -> navigator
   *  assess), "repair" (post-assess regression seed -> driver REPAIR -> navigator assess), "refactor"
   *  (post-review refactor:true seed -> driver REFACTOR -> navigator review-for-resolution). */
  driverTurn?: "green" | "repair" | "refactor";
}

/** Result of a live driver-GREEN run: the outcome (honestGreen), wall-clock duration, produced app
 *  dir, escalation flag, and a classification verdict. */
export interface RunDriverGreenResult {
  /** The honest-GREEN gate passed (all-green cycle). */
  honestGreen: boolean;
  /** Wall-clock milliseconds from start to finish (includes all retries + repairs). */
  durationMs: number;
  /** The scaffolded project directory where app/ + .sftdd live (caller can inspect before it's torn down). */
  producedCodeDir: string;
  /** Raised-to-HIL during the run (the loop did not self-heal). */
  escalated?: boolean;
  /** The build trial classification (self-healed / not-viable / systemic). */
  classify: { outcome: "self-healed" | "not-viable" | "systemic"; reason?: string };
  /** The produced code as {relpath -> contents} (app/ + tests/), captured BEFORE teardown so the ONE
   *  sweep engine can PRESERVE it per candidate + hand it to the mandatory judge. This is the driver's
   *  equivalent of a chain's producedArtifacts (you cannot judge what was torn down). */
  producedArtifacts: Record<string, string>;
  /** The NEXT-STEP navigator determination for this driver turn ({relpath -> contents} of the AC cycle
   *  dir the navigator eval turn wrote: superseded-tests.json / regression-assessment.json /
   *  review-verdict.json, or EMPTY when the navigator judged the code clean). The driver-turn
   *  discriminator (evaluateNextStepDetermination) compares this to the recorded determination. */
  nextStepMarker: Record<string, string>;
  /** The DRIVER turn's usage (cost + tokens + numTurns + agent duration), for cost parity across runs.
   *  Undefined only if the CLI reported no usage line. The sweep records it into the trial telemetry. */
  usage?: TurnUsage;
  /** The DRIVER turn's tool-call count (from its transcript). */
  toolCalls?: number;
}

/**
 * The ONE setup routine + live driver-GREEN run + teardown, driven through the EXISTING
 * orchestration lifecycle catalogue + the check's run-config. GATED , the caller (the test file)
 * only invokes this behind RUN_LIVE_STEP + LAKEBASE_TEST_E2E. Lifecycle bracket:
 *   scaffold-project (catalogue) -> [overlay bundle + cut branch + seed open-RED + live driver GREEN]
 *   -> remove-project (catalogue, finally).
 * An optional afterGreen hook runs against the produced code (before teardown) , the CODE-equivalence
 * comparison drives this to judge the driver's app/ tree against the pin's recorded-build reference.
 * When leverOverride is provided, only the DRIVER turn's config is patched; navigator and other
 * roles run with their defaults. Returns a RunDriverGreenResult; when options are absent, returns
 * void for backwards compatibility (the default single-call path).
 */
/** A driver-green scaffold shared across candidates: scaffolded ONCE (one Databricks + Lakebase project +
 *  deploy infra), then each candidate cuts its OWN worktree off HEAD + its OWN Lakebase branch off
 *  `parentBranch`. Held for the lifetime of a sweep. The #589 model, mirroring DesignEquivProject. */
export interface ScaffoldedDriverProject {
  /** The scaffold's project root (.git HEAD is the pristine committed tree each worktree checks out). */
  projectDir: string;
  /** The shared Lakebase project id , every candidate's branch is cut off it. */
  lakebaseProjectId: string;
  /** The Databricks workspace host. */
  host: string;
  /** The Lakebase default/trunk branch each candidate's experiment branch forks from. */
  parentBranch: string;
  /** Temp dir the per-candidate worktrees are cut under. */
  worktreesRoot: string;
  /** The catalogue teardown context (remove-project). */
  teardownCtx: LifecycleRunContext;
}

/** Pre/post-clean leaked dg-live-* scaffold dirs under KIT (a run KILLED before teardown orphans its
 *  Lakebase project). Best-effort + no-op when nothing is orphaned or the cloud env is unset. */
export async function sweepDriverGreenOrphans(): Promise<void> {
  try {
    const scm = await import("@databricks-solutions/lakebase-scm-utils/lakebase");
    const report = await sweepOrphanProjects({
      parentDir: KIT,
      deleteLakebaseProject: (a) => scm.deleteLakebaseProject({ projectId: a.projectId, host: a.host } as never),
      prefixes: [...DEFAULT_TEST_PROJECT_PREFIXES, "dg-live-"],
    });
    if (report.length) {
      // eslint-disable-next-line no-console
      console.log(`[driver-green] orphan sweep: ${report.map((r) => `${r.projectId}=${r.deleted ? "deleted" : `LEFT (${r.error ?? "?"})`}`).join(", ")}`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`[driver-green] orphan sweep skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** SCAFFOLD ONCE: a real project (Databricks + Lakebase + deploy infra) via the catalogued
 *  scaffold-project op, reading databricksHost from the run-config. The scaffold commits a pristine
 *  tree into its initial commit, so every per-candidate worktree checks out a clean, production-shaped
 *  tree. Pre-sweeps orphans first. Sets the suite-scoped manifest-step + kit-dir env ONCE (constant for
 *  every candidate) so PARALLEL candidates never race a per-candidate set/delete. */
export async function scaffoldDriverGreenProject(): Promise<ScaffoldedDriverProject> {
  await sweepDriverGreenOrphans();
  const { scaffoldConfig } = resolveDriverGreenRunConfig();
  // The scaffold-project op scaffolds the client only when uiTrack is on. Take uiTrack from the RECORDED
  // corpus run-config (full-stack => true), not the run-config template's default , so the scaffolded
  // project + its honest-GREEN verify include the client, matching the recording.
  scaffoldConfig.uiTrack = corpusRunConfig().ui_track;
  const setupCtx: LifecycleRunContext = { workspaceDir: KIT };
  const setup = await catalogueLifecycleDeps.run({ kind: "scaffold-project", config: scaffoldConfig }, setupCtx);
  if (!setup.ok || !setup.handle) throw new Error(`scaffold-project failed: ${setup.error ?? "no handle"}`);
  const handle = setup.handle as ScaffoldHandle;
  const projectDir = handle.projectDir!;
  layDownKitAgents(projectDir, KIT);
  const worktreesRoot = mkdtempSync(join(tmpdir(), "dg-worktrees-"));
  process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS = "1";
  // ONE kit resolution (split-brain-safe): pin the local ref's cache slot to THIS checkout + write
  // the ref hint into the project so the env-less claude -p driver resolves the SAME bits (never
  // set LAKEBASE_KIT_DIR, which the agent process does not inherit). Done ONCE for the shared scaffold.
  resolveKitSingleSource(KIT);
  assertKitSingleSource(projectDir, KIT);
  return {
    projectDir,
    lakebaseProjectId: handle.lakebaseProjectId!,
    host: handle.databricksHost!,
    parentBranch: handle.lakebaseDefaultBranch ?? "production",
    worktreesRoot,
    teardownCtx: { workspaceDir: KIT, setupHandle: setup.handle },
  };
}

/** TEARDOWN: remove everything scaffold-project created (never-leaking catalogue remove-project) + drop
 *  the worktrees-root temp dir + clear the suite env, then post-sweep any orphan a killed sibling left. */
export async function teardownDriverGreenProject(project: ScaffoldedDriverProject): Promise<void> {
  try {
    // remove-project is best-effort (it collects step failures, never throws), so a FAILED Lakebase
    // delete would otherwise be SILENT , exactly what leaked an orphan project on the Stage-5 run with
    // no teardown line in the log. SURFACE ok:false loudly so the next failure is visible (+ the orphan
    // sweep below is the safety net that actually reclaims it). Do NOT throw , teardown must not mask a
    // sweep result, and the orphan sweep still runs in the finally.
    const res = await catalogueLifecycleDeps.run({ kind: "remove-project", config: {} }, project.teardownCtx);
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.log(`[driver-green] ⚠️ remove-project reported failures for ${project.lakebaseProjectId}: ${res.error ?? "unknown"} , confirming below.`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`[driver-green] ⚠️ remove-project THREW for ${project.lakebaseProjectId}: ${e instanceof Error ? e.message : String(e)} , confirming below.`);
  } finally {
    // CONFIRM the Lakebase project is ACTUALLY gone , not just that delete-project returned exit 0.
    // `databricks postgres delete-project` is ASYNC/eventually-consistent: it accepts the request
    // (exit 0 => remove-project reports ok, deletes the local dir), but the project can LINGER
    // (a candidate branch still being torn down, or plain propagation delay). Both Stage-5 runs left a
    // live dg-live project despite an ok teardown + no error , and the orphan sweep couldn't reclaim it
    // because remove-project had already removed the local dir it keys off. So VERIFY via getProjectInfo
    // and RE-DELETE (using the id+host we hold, no local-dir dependency) until it's confirmed gone.
    await confirmLakebaseProjectDeleted(project.lakebaseProjectId, project.host);
    delete process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS;
    clearKitSingleSource();
    rmSync(project.worktreesRoot, { recursive: true, force: true });
    await sweepDriverGreenOrphans();
  }
}

/** Poll getProjectInfo (undefined == 404 == gone) and re-issue deleteLakebaseProject until the project
 *  is confirmed deleted or attempts run out. Guards against delete-project's async exit-0-but-lingering
 *  behavior (the Stage-5 leak). Best-effort + never throws (teardown must not mask a sweep result); the
 *  orphan sweep is the final backstop. Uses the id+host held on the scaffold, so it does not need the
 *  local project dir (which remove-project may already have removed). */
async function confirmLakebaseProjectDeleted(projectId: string, host: string, attempts = 5): Promise<void> {
  if (!projectId || !host) return;
  try {
    const scm = await import("@databricks-solutions/lakebase-scm-utils/lakebase");
    for (let i = 1; i <= attempts; i++) {
      let stillThere: boolean;
      try {
        stillThere = (await scm.getProjectInfo({ projectId, host } as never)) !== undefined;
      } catch {
        stillThere = false; // treat a probe error as "cannot confirm alive" , don't spin
      }
      if (!stillThere) {
        if (i > 1) {
          // eslint-disable-next-line no-console
          console.log(`[driver-green] confirmed ${projectId} deleted after ${i} check(s).`);
        }
        return;
      }
      // eslint-disable-next-line no-console
      console.log(`[driver-green] ⚠️ ${projectId} still present after delete (attempt ${i}/${attempts}); re-deleting.`);
      try { await scm.deleteLakebaseProject({ projectId, host } as never); } catch { /* re-delete hiccup; next probe decides */ }
      await new Promise((r) => setTimeout(r, 3000));
    }
    // eslint-disable-next-line no-console
    console.log(`[driver-green] ⚠️ ${projectId} STILL present after ${attempts} delete attempts , run the orphan sweep / delete by hand.`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`[driver-green] confirm-deleted skipped for ${projectId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Run ONE driver-GREEN candidate on a SHARED scaffold: cut a fresh worktree off the scaffold HEAD + a
 *  paired Lakebase branch off parentBranch (both keyed by the candidate's slug, so PARALLEL candidates
 *  are fully isolated), seed the POST-RED bundle into the worktree, drive one live driver GREEN, verify
 *  honest-GREEN, classify. ALWAYS tears down THIS candidate's branch + worktree in finally (the shared
 *  scaffold is torn down once by teardownDriverGreenProject). No shared mutable state => safe in parallel. */
export async function runDriverGreenOnScaffold(
  project: ScaffoldedDriverProject,
  opts: RunDriverGreenOptions = {},
): Promise<RunDriverGreenResult | void> {
  // Which driver turn to exercise. green -> driver GREEN -> navigator ASSESS; repair -> driver REPAIR ->
  // navigator ASSESS; refactor -> driver REFACTOR -> navigator REVIEW. The default bundle REPLAYS the
  // actual corpus turn for that kind (recorded pre-project + recorded prompt + recorded levers), so the
  // preconditions are held constant and a candidate lever is the only perturbation.
  const driverTurn = opts.driverTurn ?? "green";
  const b = opts.bundle ?? replayBundleForTurn(driverTurn);
  const experimentSlug = opts.experimentSlug ?? `s3-driver-${driverTurn}`;
  const branchName = opts.branch ?? `experiment/${b.story}`;
  const { lakebaseProjectId, host, parentBranch } = project;

  // Each candidate gets its OWN worktree off the scaffold's committed HEAD (clean, production-shaped tree).
  const { wtDir, consortDir } = await cutWorktree({
    projectDir: project.projectDir,
    worktreesRoot: project.worktreesRoot,
    label: experimentSlug,
    branchPrefix: "dg",
    kitDir: KIT,
  });
  const projectDir = wtDir;

  try {
    // ── SEED (bundle overlay): the pre-turn app + tests + design + per-story test-list (+ the recorded
    //    pre-turn cycle markers for repair/refactor, which route the drive to that turn). ──
    layBundle(projectDir, consortDir, driverTurn, b);
    execFileSync("git", ["add", "-A"], { cwd: projectDir, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", `seed: pre-turn F6/S3 snapshot for driver ${driverTurn} (live)`, "--no-verify"], { cwd: projectDir, stdio: "pipe" });

    // ── SEED (cut the paired experiment branch off the SHARED project's parent): writes .env
    //    DATABASE_URL. resetStaleBranch drops any same-named branch a prior candidate left, so a
    //    re-cut forks clean off parentBranch. ──
    await cutExperiment({
      instance: lakebaseProjectId,
      consortDir,
      projectDir,
      featureId: b.feature,
      storyId: b.story,
      experimentSlug,
      branch: branchName,
      parentBranch,
      resetStaleBranch: true,
    });

    // ── REALIGN repair/refactor seed cycle markers to the JUST-CUT experiment. ──
    // The overlaid seed's cycle-*.json hardcode the RECORDED experiment_slug ("exp1") + branch_id (the
    // recorded experiment branch). Those do NOT match the experiment THIS sweep just cut (per-candidate
    // slug + branch). The drive reads the ACTIVE story's cycle experiment_slug to locate
    // experiments/<slug>/outcomes.json (and branch_id for the DB branch), so a stale slug => ENOENT +
    // crash (all candidates DQ'd on this before the fix). Rewrite the active story's markers to point at
    // the just-cut experiment: slug from experimentSlug, branch_id from the cut's branch.txt.
    if (driverTurn !== "green") {
      const cutBranchId = readFileSync(join(consortDir, "experiments", b.feature, b.story, experimentSlug, "branch.txt"), "utf8").trim();
      const storyCyclesDir = join(consortDir, "cycles", b.feature, b.story);
      for (const acDir of readdirSync(storyCyclesDir)) {
        const acPath = join(storyCyclesDir, acDir);
        if (!statSync(acPath).isDirectory()) continue;
        for (const f of readdirSync(acPath)) {
          if (!/^cycle-.*\.json$/.test(f)) continue;
          const p = join(acPath, f);
          const c = JSON.parse(readFileSync(p, "utf8")) as { experiment_slug?: string; branch_id?: string };
          if (c.experiment_slug !== undefined) c.experiment_slug = experimentSlug;
          if (c.branch_id !== undefined) c.branch_id = cutBranchId;
          writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
        }
      }
    }

    // ── SEED (pipeline + open RED cycle): route nextTransition to driver GREEN for S3. ──
    writePipeline(consortDir, {
      version: 1,
      feature_id: b.feature,
      stories: {
        [b.story]: {
          status: "ready",
          gate: { status: "approved", approver: "human-proxy", approved_at: "2026-08-05T00:00:00Z", history: [] },
          experiment: { slug: experimentSlug, branch: branchName, parent: parentBranch, n: 1, status: "active", cut_at: "2026-08-05T00:00:00Z" },
        },
      },
      build_queue: [b.story],
      build_active: b.story,
    } as never);
    writeFileSync(join(consortDir, "workflow-state.json"), JSON.stringify({ phase: "implementation", phase_feature_id: b.feature }));
    // green: begin the open-RED batch so nextTransition routes to driver GREEN + assert it opened.
    // repair/refactor: the recorded pre-turn cycle markers (overlaid by layBundle) ALREADY carry the
    // routing state (assessed green-failure + regression / refactor:true review-verdict) , beginning a
    // fresh batch would clobber it, so we do NOT re-batch; the drive resumes from the seeded cycles.
    if (driverTurn === "green") {
      beginNextPendingBatch({ consortDir, featureId: b.feature, story: b.story }, { cap: Number.MAX_SAFE_INTEGER });
      assertGt(storyTestProgress(consortDir, b.feature, b.story).openRed.length, 0, "setup: an open RED cycle exists");
    }

    // Agent defs so the live `--agent driver` resolves (worktree carries a copy from HEAD; re-lay freshest).
    layDownKitAgents(projectDir, KIT);

    // DRIVER-GREEN enforcement + context levers (per-candidate, per-worktree): write .claude/settings.json
    // (single-test-guard hook + deny globs) + the ctx-levers marker into THIS candidate's worktree. All
    // per-workspace, so concurrent candidates never race; the guard/deny gate only the driver agent's tool
    // calls (headless --setting-sources project), the orchestrator's honest-GREEN verify is untouched.
    if (opts.leverOverride) applyDriverLevers(projectDir, opts.leverOverride, consortDir);

    // Concurrency safety: give this worktree its OWN deploy port so the honest-GREEN verify does not
    // collide with a sibling candidate on the shared :8000 (rewrites base_url + the uvicorn run command).
    if (opts.port) assignWorktreePort(projectDir, opts.port);

    process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS = "1";
    // Kit resolution is pinned ONCE by scaffoldDriverGreenProject (shared scaffold); no per-candidate
    // re-pin here (the whole sweep shares the one scaffold + its single-source cache slot).

    // ── DRIVE one real driver GREEN on the uncontained live executor (performViaExecutor). Driver
    //    tool-scope is WIDER than navigator RED , it needs Bash to run the project's tests.
    //    When leverOverride is provided, patch the driver turn's model/effort/tools. ──
    // EVERY setting the turn runs under comes from the RECORDED corpus run-config (corpusRunConfig, read
    // via the common readRunConfig into the common RunConfig type) , the snapshot already holds the
    // RESOLVED per-role models + options, so we READ them, never re-derive. A candidate's LEVER then
    // OVERRIDES specific settings to test a perturbation (?? , so a falsy override like uiTrack:false
    // wins). This is the ONE path for every optimization experiment: corpus settings, lever overrides.
    const rc = corpusRunConfig();
    const lever = opts.leverOverride;
    const driverModel = lever?.model;
    const driverEffort = lever?.effort;
    const driverAllowedTools = lever?.allowedTools;
    const driverDisallowedTools = lever?.disallowedTools;
    // The gate approver identity is fixed by the recorded gates mode: only "proxy" gates are headless-
    // viable (interactive gates would deadlock an unattended sweep), and proxy => the human-proxy approver.
    if (rc.gates && rc.gates !== "proxy") throw new Error(`recorded gates=${rc.gates}: only "proxy" gates are headless-viable for the sweep`);

    const cfg: DriveEffectsConfig = {
      projectDir,
      consortDir,
      featureId: b.feature,
      runner: { async run() {} },
      useManifestSteps: true,
      // Recorded corpus value, lever-overridable. uiTrack was recorded full-stack (true); a client story
      // (e.g. the S3 StockViewPage repair) is unresolvable when it is forced off.
      uiTrack: lever?.uiTrack ?? rc.ui_track,
      approver: "human-proxy",
      deployTarget: (lever?.deployTarget ?? rc.deploy_target) as "local" | "workspace",
      loopGranularity: (lever?.loopGranularity ?? rc.loop_granularity) as "story" | "ac" | "hybrid-a",
      buildSessionScope: (lever?.buildSessionScope ?? rc.build_session_scope) as "cycle" | "story",
      batchCap: lever?.batchCap ?? rc.batch_cap,
      // Per-role MODEL from the recording (rc.models[role]); the DRIVER role is perturbed by the lever.
      // The corpus records one model per role (not per-turn), so every turn of a role uses that model ,
      // faithful to the recording.
      modelForRole: (role) => (role === "driver" && driverModel ? driverModel : (rc.models[role] ?? "sonnet")),
      modelForTurn: (role) => (role === "driver" && driverModel ? driverModel : (rc.models[role] ?? "sonnet")),
      // EFFORT: the corpus recorded no per-driver effort, so the driver turn's baseline is the model
      // default (""); the lever perturbs it. (The one recorded effort, review_effort, is for the review
      // turn, which the navigator EVAL below pins to opus/high explicitly.)
      effortForTurn: (role) => (role === "driver" && driverEffort ? (driverEffort === "default" ? "" : driverEffort) : ""),
      // REPLAY: drive the TARGET driver turn from the corpus turn's recorded prompt.txt verbatim (the exact
      // context the agent saw), rehydrated to this worktree , so the recorded context is held constant and
      // the lever is the only perturbation. The navigator EVAL turn that follows returns undefined here, so
      // it derives its determination normally (the discriminator). Context levers append via contextPackSuffix.
      ...(b.replay
        ? {
            instructionsOverride: (action: Extract<WorkflowAction, { kind: "invoke-role" }>): string | undefined => {
              if (action.role !== "driver" || !("story" in action) || action.story !== b.story) return undefined;
              const bm = (action as { buildMode?: unknown }).buildMode;
              const isTarget = driverTurn === "green" ? bm === undefined : bm === driverTurn;
              return isTarget ? rehydrate(b.replay!.promptRaw, projectDir) : undefined;
            },
          }
        : {}),
      allowedToolsForRole: (role) => {
        if (role === "driver") {
          if (driverAllowedTools) return driverAllowedTools;
          return ["Write", "Read", "Edit", "Bash"];
        }
        return undefined;
      },
      disallowedToolsForRole: (role) => {
        if (role === "driver" && driverDisallowedTools) return driverDisallowedTools;
        return undefined;
      },
    } as DriveEffectsConfig;
    cfg.runner = execRunner(cfg);

    const startTime = Date.now();
    // The TARGET driver turn to exercise, by buildMode: green = a plain driver turn (no buildMode);
    // repair = buildMode "repair"; refactor = buildMode "refactor". Run until the drive LEAVES that turn
    // (so the driver turn executes; the navigator EVAL turn that follows it is driven separately below).
    const isTargetDriverTurn = (a: WorkflowAction): boolean => {
      if (a.kind !== "invoke-role" || a.role !== "driver" || !("story" in a) || a.story !== b.story) return false;
      const bm = (a as { buildMode?: unknown }).buildMode;
      if (driverTurn === "green") return !("mode" in a) && bm === undefined;
      return bm === driverTurn;
    };
    const result = await runDriver(buildDriveEffects(cfg), { stopWhen: (a: WorkflowAction) => !isTargetDriverTurn(a), maxSteps: 4 });
    const durationMs = Date.now() - startTime;
    // Capture the DRIVER turn's prompt + reasoning + tool trace (peek, before the eval turn overwrites
    // it) so each experiment preserves what the driver was told + how it reasoned , the new judge can be
    // re-run against this offline, no re-execution.
    // Peek BY the candidate's worktree (cwd) , concurrency-safe: a parallel sibling must NOT clobber
    // this candidate's transcript (the driver spawns with cwd=cfg.projectDir=projectDir=wtDir).
    const driverTx = peekLastAgentTranscript(projectDir);
    // The DRIVER turn's usage (cost + tokens + numTurns + duration) + tool-call count, peeked BY cwd
    // before the eval turn overwrites it , so EVERY experiment run records cost with the consistent
    // TurnUsage attribute set (parity with the design-lane sweep). toolCalls comes from the transcript.
    const driverUsage: TurnUsage | undefined = peekLastAgentUsage(projectDir);
    const driverToolCalls = driverTx?.tools.length;

    // ── ASSERT: the honest-GREEN product-channel proof ──
    const productCodeExists = hasSourceFile(join(projectDir, "app"));
    const storyProgress = storyTestProgress(consortDir, b.feature, b.story);
    const allGreen = storyProgress.allGreen;
    assert(productCodeExists, "driver wrote product code under app/");
    // SINGLE-TURN measurement: this is ONE driver turn's worth of function, NOT the whole story. We do
    // NOT require the story to be all-green , that is a MULTI-turn property (a 41-turn story like
    // S2-drop-combined can never green in one bounded turn, and requiring it wrongly DQ'd every
    // candidate). A FAILING green is a valid, scorable turn: it flows to the navigator assess below,
    // and the judge scores that determination SAME/BETTER/WORSE vs the recorded original turn. `allGreen`
    // is kept as an informational SIGNAL (classifyBuildTrial + the trial), never a hard gate.
    assert(result.stoppedAtBound || result.stoppedAtMax || result.iterations >= 1, "driver ran at least one bounded iteration");
    assertEq(readPipeline(consortDir, b.feature).build_active, b.story, "the pipeline's build_active is the swept story");
    void host;

    // Classify the build trial for sweep reporting (self-healed / not-viable / systemic).
    const classify = classifyBuildTrial({
      result: {
        escalated: result.escalated ?? false,
        stoppedAtBound: result.stoppedAtBound ?? false,
        escalation: result.escalation,
      },
      honestGreen: { passed: allGreen },
    } as BuildTrialSignals);

    // ── CAPTURE the produced code (app/ + tests/) as text BEFORE teardown, so the ONE sweep engine can
    //    PRESERVE it per candidate AND hand it to the mandatory judge (you cannot judge what was torn
    //    down). This is the driver's producedArtifacts, the same currency every chain returns. ──
    const producedArtifactsRaw: Record<string, string> = {
      ...snapshotTree(join(projectDir, "app"), projectDir),
      ...snapshotTree(join(projectDir, "tests"), projectDir),
      // CLIENT surface: on a UI story (uiTrack on , e.g. the S3 read-UI repair), the repair work lands
      // under client/, so the judge MUST see it , without this the client story was scored blind to its
      // own code (the confounder that made the driver-repair ladder plateau). Scope to client/src +
      // client/tests ONLY: snapshotTree does not filter, and the whole client/ tree includes
      // node_modules/.vite/dist (thousands of files) which would swamp the produced artifacts + judge.
      ...(cfg.uiTrack ? snapshotTree(join(projectDir, "client", "src"), projectDir) : {}),
      ...(cfg.uiTrack ? snapshotTree(join(projectDir, "client", "tests"), projectDir) : {}),
    };
    // Drop build junk (compiled bytecode) so the preserved artifacts are source-only , consistent across
    // candidates + not swamped by machine-specific .pyc noise. snapshotTree does not filter.
    const producedArtifacts: Record<string, string> = Object.fromEntries(
      Object.entries(producedArtifactsRaw).filter(([p]) => !p.includes("__pycache__") && !p.endsWith(".pyc")),
    );

    // ── THE NEXT-STEP NAVIGATOR EVALUATION (opus-high): after the driver turn greened, run ONE more
    //    live turn , the navigator EVALUATION turn nextTransition routes to (assess for a green that
    //    tripped the full-suite verify; review/accept for a clean one). The NAVIGATOR is pinned
    //    opus-high (a fixed, strong evaluator) regardless of the driver lever being swept, so the
    //    determination is a stable judge of the driver's output. Its marker lands in the AC cycle dir
    //    UNDER THE RESOLVED consortDir (never a hardcoded artifact root). We capture that marker dir as
    //    text so the mandatory judge compares the candidate's next-step determination to the recorded
    //    one (evaluateNextStepDetermination). Best-effort + bounded: a clean green routes to
    //    review/accept and writes no assess marker => empty capture => the judge's "candidate clean"
    //    (pass-with-honors) input. ──
    const isDriverTurn = (a: WorkflowAction): boolean => a.kind === "invoke-role" && a.role === "driver";
    const isNavigatorEval = (a: WorkflowAction): boolean =>
      a.kind === "invoke-role" && a.role === "navigator" &&
      typeof (a as { buildMode?: unknown }).buildMode === "string" &&
      ["assess", "review", "assess-refactor", "reflect"].includes(String((a as { buildMode?: unknown }).buildMode));
    // Pin the navigator opus-high for the eval turn; keep the driver lever untouched (it already greened).
    const evalCfg: DriveEffectsConfig = {
      ...cfg,
      modelForRole: (role) => (role === "navigator" ? "opus" : cfg.modelForRole!(role)),
      modelForTurn: (role, turn) => (role === "navigator" ? "opus" : cfg.modelForTurn!(role, turn)),
      effortForTurn: (role, turn) => (role === "navigator" ? "high" : cfg.effortForTurn!(role, turn)),
    } as DriveEffectsConfig;
    evalCfg.runner = execRunner(evalCfg);
    // Run until we LEAVE the navigator-eval turn (i.e. stop once the drive would hand back to the driver
    // or advance): the single eval turn is what we want. If the drive routes straight past eval (clean),
    // this stops immediately and the marker capture below is empty (= candidate clean).
    await runDriver(buildDriveEffects(evalCfg), { stopWhen: (a: WorkflowAction) => isDriverTurn(a), maxSteps: 3 });
    const markerDirAbs = cycleDir(consortDir, b.feature, b.story, b.ac);
    const nextStepMarker = snapshotTree(markerDirAbs, markerDirAbs);

    // PRESERVE the prompts + reasoning + tool traces for BOTH turns (driver + navigator-eval) alongside
    // the code + determination, so the whole experiment is recorded and the judge can be re-run offline
    // (no re-execution). Under a `transcripts/` prefix so it never collides with the judge's
    // `navigator-eval/` marker reads. Best-effort (a turn with no captured transcript => empty).
    const evalTx = peekLastAgentTranscript(projectDir); // same worktree cwd; the eval overwrote the driver's entry (temporal, correct)
    if (driverTx) {
      producedArtifacts["transcripts/driver-prompt.txt"] = driverTx.prompt;
      producedArtifacts["transcripts/driver-reasoning.txt"] = driverTx.finalText;
      producedArtifacts["transcripts/driver-tools.txt"] = driverTx.tools.join("\n");
    }
    if (evalTx) {
      producedArtifacts["transcripts/navigator-eval-prompt.txt"] = evalTx.prompt;
      producedArtifacts["transcripts/navigator-eval-reasoning.txt"] = evalTx.finalText;
      producedArtifacts["transcripts/navigator-eval-tools.txt"] = evalTx.tools.join("\n");
    }

    // `afterGreen` remains for the standalone equivalence test (which judges + asserts in-hook before
    // teardown). The SWEEP does NOT use it , it judges via the shared engine's mandatory judgeCandidate.
    if (opts.afterGreen) await opts.afterGreen({ projectDir, featureId: b.feature, storyIndex: 1 });

    // Return the result when called with options (sweep scenario); void when called with defaults (test scenario).
    if (opts.experimentSlug || opts.branch || opts.leverOverride) {
      return {
        honestGreen: allGreen,
        durationMs,
        producedCodeDir: projectDir,
        escalated: result.escalated,
        classify,
        producedArtifacts,
        nextStepMarker,
        ...(driverUsage ? { usage: driverUsage } : {}),
        ...(driverToolCalls !== undefined ? { toolCalls: driverToolCalls } : {}),
      };
    }
  } finally {
    // ── PER-CANDIDATE TEARDOWN: drop THIS candidate's Lakebase branch (paired delete) + remove its
    //    worktree. The SHARED scaffold (Lakebase project + repo) is torn down once by
    //    teardownDriverGreenProject. Best-effort , both are also swept at scaffold teardown. ──
    try {
      await deleteExperiment({
        instance: lakebaseProjectId,
        consortDir,
        projectDir,
        featureId: b.feature,
        storyId: b.story,
        experimentSlug,
        deleteBranchToo: true,
      });
    } catch {
      /* branch teardown hiccup must not mask the trial result; scaffold teardown + orphan sweep backstop */
    }
    forceRemoveWorktree(project.projectDir, wtDir);
    void host;
  }
}

/**
 * The ONE-CALL driver-GREEN live run (backwards-compatible): scaffold a project, run ONE candidate on it,
 * tear the scaffold down. Preserves the single-call full-lifecycle contract the standalone live tests rely
 * on (driver-code-equivalence-live.test.ts, driver-green-executor-dispatch-live.test.ts). GATED , the
 * caller only invokes this behind RUN_LIVE_STEP + LAKEBASE_TEST_E2E. Returns a RunDriverGreenResult when
 * called with options (sweep-shaped), void with defaults. The SWEEP does NOT call this , it scaffolds ONCE
 * and calls runDriverGreenOnScaffold per candidate (share one scaffold across the whole sweep).
 */
export async function runDriverGreenLive(opts: RunDriverGreenOptions = {}): Promise<RunDriverGreenResult | void> {
  const project = await scaffoldDriverGreenProject();
  try {
    return await runDriverGreenOnScaffold(project, opts);
  } finally {
    // teardownDriverGreenProject clears the env + the single-source pin (shared-scaffold owner).
    await teardownDriverGreenProject(project);
  }
}
