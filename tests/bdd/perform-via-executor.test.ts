// Stage 2 (#578) 2b golden: dispatching spec-author breakdown THROUGH the StepExecutor
// (buildDriveEffects.performViaExecutor) drives the SAME deterministic CLIs, in the SAME order,
// as the legacy perform() path , the byte-identical contract that lets the executor own the live
// turn. The ONE declared delta (kept intentionally, per the plan) is execute()'s validate-outputs
// gate, which runs the manifest validators at the turn; the CLI sequence around the agent is
// identical: reset-breakdown (pre) -> agent -> reconcile (materialize) -> sync-breakdown (post).
//
// Hermetic: a fake runner records every DriveCommand. The agent's `claude` command is dispatched
// by LiveDriveStepAgent through that same runner, so both paths funnel through one command stream
// we can compare. No live spawn , the fake runner just records + returns.

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDriveEffects, type DriveCommand, type DriveEffectsConfig } from "../../consort/orchestrator/drive/orchestrator-effects";
import type { WorkflowAction, DriveState } from "../../consort/orchestrator/drive/orchestrator-drive";
import type { ValidateBoundDeps } from "../../consort/orchestrator/steps/step-contract";

const BREAKDOWN: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };
const FEATURE = "F1-stock-visibility";
const RED_STORY = "S1-create-sku";
const RED: WorkflowAction = { kind: "invoke-role", role: "navigator", story: RED_STORY };

/** Seed the breakdown manifest's declared inputs into the real .sftdd (product-overview/nfrs/
 *  feature-request) , the uncontained agent reads them there, and the executor's phase-1 gate
 *  checks their presence. Absent them, resolveInputs returns {missing} and the agent never runs. */
function seedBreakdownInputs(sftddDir: string): void {
  for (const f of ["product-overview.md", "nfrs.md", "feature-request.md"]) {
    writeFileSync(join(sftddDir, f), `# ${f}\nseed\n`);
  }
}

/** A recording runner: captures each command as a compact label, and (crucially) SIMULATES the
 *  agent turn by writing the artifacts the executor's phase-5 validate + phase-4.5 reconcile need,
 *  so the executor path reaches a clean produce without a live spawn. */
function recordingRunner(sftddDir: string) {
  const labels: string[] = [];
  return {
    labels,
    runner: {
      async run(cmd: DriveCommand) {
        if (cmd.kind === "claude") {
          labels.push(`claude:${cmd.role}`);
          // Simulate the live spec-author writing its artifact channel outputs.
          const specDir = join(sftddDir, "features", FEATURE);
          mkdirSync(specDir, { recursive: true });
          writeFileSync(join(specDir, "feature-spec.json"), JSON.stringify({ id: FEATURE, name: "Stock visibility", status: "draft", tdd_mode: "N=1", stories: ["S1-a"] }) + "\n");
          return;
        }
        if (cmd.kind === "cli") {
          const verb = cmd.args[0];
          labels.push(`cli:${cmd.bin.replace("lakebase-sftdd-", "")}:${verb}`);
          // The reconcile CLI materializes the agent-log , simulate that so validate-outputs passes.
          if (cmd.bin.endsWith("-log") && verb === "--reconcile") {
            writeFileSync(join(sftddDir, "agent-log.jsonl"),
              JSON.stringify({ timestamp: "2026-08-05T00:00:00Z", level: "info", role: "spec-author", event: "artifact.written", message: "wrote feature-spec.json" }) + "\n");
          }
          return;
        }
        labels.push(cmd.kind);
      },
    },
  };
}

function cfg(sftddDir: string, projectDir: string, over: Partial<DriveEffectsConfig> = {}): DriveEffectsConfig {
  return {
    projectDir,
    sftddDir,
    featureId: FEATURE,
    runner: { async run() {} },
    modelForRole: () => "opus",
    approver: "human-proxy",
    deployTarget: "local",
    ...over,
  } as DriveEffectsConfig;
}

const routerDeps: ValidateBoundDeps = {
  allowed: () => ({ kind: "design-complete" }) as WorkflowAction,
  reviseBudgetAvailable: () => true,
  recordRetry: () => ({ sanctioned: true }),
};
const state = { phase: "feature" } as unknown as DriveState;

describe("performViaExecutor (Stage 2 2b): spec-author breakdown through the StepExecutor", () => {
  it("runs the SAME CLI sequence as the legacy path: reset-breakdown, claude, reconcile, sync-breakdown", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-"));
    const sftddDir = join(projectDir, ".sftdd");
    mkdirSync(sftddDir, { recursive: true });
    seedBreakdownInputs(sftddDir);
    try {
      const rec = recordingRunner(sftddDir);
      const effects = buildDriveEffects(cfg(sftddDir, projectDir, { useManifestSteps: true, runner: rec.runner }));
      const bounded = await effects.performViaExecutor!(BREAKDOWN, state, routerDeps);

      // The executor produced a bounded route (not undefined => it WAS executor-dispatched).
      expect(bounded).toBeDefined();
      // The command stream funneled through the runner, in the Template-Method phase order:
      // pre-turn (reset-breakdown), agent, materialize (reconcile log), post-turn (sync-breakdown).
      expect(rec.labels).toEqual([
        "cli:pipeline:reset-breakdown",
        "claude:spec-author",
        "cli:log:--reconcile",
        "cli:pipeline:sync-breakdown",
      ]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns undefined (falls through to perform) when useManifestSteps is OFF", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-"));
    try {
      const effects = buildDriveEffects(cfg(join(projectDir, ".sftdd"), projectDir)); // flag off
      expect(await effects.performViaExecutor!(BREAKDOWN, state, routerDeps)).toBeUndefined();
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns undefined for an action NOT on the executor allowlist (e.g. a design turn not yet migrated)", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-"));
    try {
      const effects = buildDriveEffects(cfg(join(projectDir, ".sftdd"), projectDir, { useManifestSteps: true }));
      // architect estimate is a design turn NOT yet on the allowlist (breakdown, navigator RED,
      // driver GREEN are; the rest fall through to perform). Its own dedicated cases below cover
      // the migrated build turns.
      const notMigrated: WorkflowAction = { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" } as WorkflowAction;
      expect(await effects.performViaExecutor!(notMigrated, state, routerDeps)).toBeUndefined();
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("BLOCKS (no post-turn sync-breakdown) when the agent's artifact fails validation", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-"));
    const sftddDir = join(projectDir, ".sftdd");
    mkdirSync(sftddDir, { recursive: true });
    seedBreakdownInputs(sftddDir);
    try {
      // A runner whose "agent" writes a NON-conformant feature-spec (empty stories) => validate fails.
      const labels: string[] = [];
      const runner = {
        async run(cmd: DriveCommand) {
          if (cmd.kind === "claude") {
            labels.push("claude");
            const d = join(sftddDir, "features", FEATURE); mkdirSync(d, { recursive: true });
            writeFileSync(join(d, "feature-spec.json"), JSON.stringify({ id: FEATURE, name: "X", status: "draft", tdd_mode: "N=1", stories: [] }) + "\n");
            return;
          }
          if (cmd.kind === "cli") { labels.push(`cli:${cmd.args[0]}`); if (cmd.bin.endsWith("-log")) writeFileSync(join(sftddDir, "agent-log.jsonl"), "{}\n"); }
        },
      };
      const effects = buildDriveEffects(cfg(sftddDir, projectDir, { useManifestSteps: true, runner }));
      const bounded = await effects.performViaExecutor!(BREAKDOWN, state, routerDeps);
      expect(bounded).toBeDefined();
      // sync-breakdown (the `after` CLI) must NOT have run , validation blocked the turn.
      expect(labels).not.toContain("cli:sync-breakdown");
      // reset-breakdown (pre) + reconcile still ran (they precede the gate).
      expect(labels).toContain("cli:reset-breakdown");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

// ─── navigator RED (a BUILD turn, LEAN , no cloud) through the StepExecutor ───────────────────────
// Same performViaExecutor seam, widened to a build turn. The 3 divergences from breakdown:
//   1. inputs are STORY-scoped (test-list-per-story.json + the story's acs/ DIR), not feature-flat.
//   2. the output is the PRODUCT channel , a real tests/ tree at the PROJECT ROOT (not .sftdd).
//   3. the post-turn CLI is the `@build-cycle` marker (the RED cycle stamp), NOT sync-breakdown , so
//      the expander must RESOLVE the marker (via buildCycleCommand), not filter it. Absent that, no
//      RED is stamped, testsWritten never flips, and the loop re-proposes RED and stalls.

/** Seed navigator RED's story-scoped inputs on the live tree: the per-story test-list + the acs/
 *  dir (a DIRECTORY input , presence-checked, not injected). The executor's phase-1 gate needs both. */
function seedRedInputs(sftddDir: string): void {
  const storyDir = join(sftddDir, "features", FEATURE, "stories", RED_STORY);
  mkdirSync(join(storyDir, "acs"), { recursive: true });
  writeFileSync(
    join(storyDir, "test-list-per-story.json"),
    JSON.stringify({ feature_id: FEATURE, story_id: RED_STORY, items: [{ id: "T1", kind: "behavior", description: "create a SKU" }] }) + "\n",
  );
  writeFileSync(
    join(storyDir, "acs", "AC1-create-sku.json"),
    JSON.stringify({ id: "AC1-create-sku", story_id: RED_STORY, statement: "A SKU can be created", layer: "persistence" }) + "\n",
  );
}

/** A recording runner for RED: labels each command, and SIMULATES the navigator writing its PRODUCT
 *  output (a tests/ tree at the PROJECT ROOT) + the reconcile materializing the meta agent-log. */
function redRecordingRunner(projectDir: string, sftddDir: string) {
  const labels: string[] = [];
  return {
    labels,
    runner: {
      async run(cmd: DriveCommand) {
        if (cmd.kind === "claude") {
          labels.push(`claude:${cmd.role}`);
          // The navigator authors tests/ at the project ROOT (the product channel).
          const testsDir = join(projectDir, "tests");
          mkdirSync(testsDir, { recursive: true });
          writeFileSync(join(testsDir, "test_create_sku.py"), "def test_create_sku():\n    assert False  # RED\n");
          return;
        }
        if (cmd.kind === "cli") {
          const verb = cmd.args[0];
          labels.push(`cli:${cmd.bin.replace("lakebase-sftdd-", "")}:${verb}`);
          if (cmd.bin.endsWith("-log") && verb === "--reconcile") {
            writeFileSync(join(sftddDir, "agent-log.jsonl"),
              JSON.stringify({ timestamp: "2026-08-05T00:00:00Z", level: "info", role: "navigator", event: "artifact.written", message: "wrote tests/test_create_sku.py" }) + "\n");
          }
          return;
        }
        labels.push(cmd.kind);
      },
    },
  };
}

describe("performViaExecutor (#590): navigator RED (the PRODUCT channel) through the StepExecutor", () => {
  it("runs the build-turn CLI sequence: claude, @build-cycle (RED stamp), reconcile , and writes tests/ at the project ROOT", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-red-"));
    const sftddDir = join(projectDir, ".sftdd");
    mkdirSync(sftddDir, { recursive: true });
    seedRedInputs(sftddDir);
    try {
      const rec = redRecordingRunner(projectDir, sftddDir);
      const effects = buildDriveEffects(cfg(sftddDir, projectDir, { useManifestSteps: true, runner: rec.runner, loopGranularity: "story" }));
      const bounded = await effects.performViaExecutor!(RED, state, routerDeps);

      // Executor-dispatched (not undefined).
      expect(bounded).toBeDefined();
      // The command stream in Template-Method phase order: RED has NO pre-turn CLI; the agent writes
      // its tests; reconcile materializes the meta agent-log; the post-turn `@build-cycle` marker
      // RESOLVES to the cycle `begin` (RED stamp) , NOT filtered out, NOT sync-breakdown.
      expect(rec.labels).toEqual([
        "claude:navigator",
        "cli:log:--reconcile",
        "cli:cycle:begin",
      ]);
      // The PRODUCT artifact landed at the project ROOT (the real code tree), not under .sftdd.
      expect(existsSync(join(projectDir, "tests", "test_create_sku.py"))).toBe(true);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("BLOCKS (no RED cycle stamp) when the navigator writes no tests/ tree", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-red-"));
    const sftddDir = join(projectDir, ".sftdd");
    mkdirSync(sftddDir, { recursive: true });
    seedRedInputs(sftddDir);
    try {
      const labels: string[] = [];
      const runner = {
        async run(cmd: DriveCommand) {
          if (cmd.kind === "claude") { labels.push("claude"); return; /* writes NO tests/ */ }
          if (cmd.kind === "cli") { labels.push(`cli:${cmd.args[0]}`); if (cmd.bin.endsWith("-log")) writeFileSync(join(sftddDir, "agent-log.jsonl"), "{}\n"); }
        },
      };
      const effects = buildDriveEffects(cfg(sftddDir, projectDir, { useManifestSteps: true, runner, loopGranularity: "story" }));
      const bounded = await effects.performViaExecutor!(RED, state, routerDeps);
      expect(bounded).toBeDefined();
      // The `@build-cycle` RED stamp (cycle begin) must NOT have run , validation (no tests/) blocked it.
      expect(labels).not.toContain("cli:begin");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns undefined for a navigator turn that is NOT plain RED (e.g. a review/assess buildMode)", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-red-"));
    try {
      const effects = buildDriveEffects(cfg(join(projectDir, ".sftdd"), projectDir, { useManifestSteps: true }));
      const review: WorkflowAction = { kind: "invoke-role", role: "navigator", story: RED_STORY, buildMode: "review" } as WorkflowAction;
      expect(await effects.performViaExecutor!(review, state, routerDeps)).toBeUndefined();
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

// ─── driver GREEN (a BUILD turn) through the StepExecutor ─────────────────────────────────────────
// The build lane's other half, same performViaExecutor seam. Divergences from navigator RED:
//   - the PRODUCT edits span the app (app/ + migrations + client/), so there is NO single product
//     file to validate , the manifest's validated output is the META agent-log; the post-turn
//     @build-cycle honest-GREEN verify (the `green` verb) is what proves the code + flips codeWritten.
//   - HERE (hermetic) the @build-cycle green is just recorded as a label + its DB verify is NOT run
//     (no cloud); the LIVE honest-GREEN is the cloud-gated proof. This golden asserts the DISPATCH
//     is identical: the CLI stream + channel resolution, not the verify outcome.

const GREEN: WorkflowAction = { kind: "invoke-role", role: "driver", story: RED_STORY };

describe("performViaExecutor (#594): driver GREEN through the StepExecutor", () => {
  it("runs the build-turn CLI sequence: claude, reconcile, @build-cycle (green) , with agent-log as the validated meta output", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-green-"));
    const sftddDir = join(projectDir, ".sftdd");
    mkdirSync(sftddDir, { recursive: true });
    seedRedInputs(sftddDir); // same story-scoped inputs (test-list-per-story + acs)
    try {
      const labels: string[] = [];
      const runner = {
        async run(cmd: DriveCommand) {
          if (cmd.kind === "claude") {
            labels.push(`claude:${cmd.role}`);
            // Simulate the driver editing app code (the product channel spans the app , not a single file).
            mkdirSync(join(projectDir, "app"), { recursive: true });
            writeFileSync(join(projectDir, "app", "models.py"), "class Sku:\n    pass\n");
            return;
          }
          if (cmd.kind === "cli") {
            labels.push(`cli:${cmd.bin.replace("lakebase-sftdd-", "")}:${cmd.args[0]}`);
            if (cmd.bin.endsWith("-log") && cmd.args[0] === "--reconcile") {
              writeFileSync(join(sftddDir, "agent-log.jsonl"),
                JSON.stringify({ timestamp: "2026-08-05T00:00:00Z", level: "info", role: "driver", event: "artifact.written", message: "wrote app/models.py" }) + "\n");
            }
            return;
          }
          labels.push(cmd.kind);
        },
      };
      const effects = buildDriveEffects(cfg(sftddDir, projectDir, { useManifestSteps: true, runner, loopGranularity: "story" }));
      const bounded = await effects.performViaExecutor!(GREEN, state, routerDeps);

      expect(bounded).toBeDefined();
      // Same phase order as RED: agent, reconcile (materialize the meta agent-log the validator
      // checks), then the post-turn @build-cycle , here the `green` verb (honest-GREEN), NOT `begin`.
      expect(labels).toEqual([
        "claude:driver",
        "cli:log:--reconcile",
        "cli:cycle:green",
      ]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("BLOCKS (no @build-cycle green) when the driver's turn produces no reconciled agent-log", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-green-"));
    const sftddDir = join(projectDir, ".sftdd");
    mkdirSync(sftddDir, { recursive: true });
    seedRedInputs(sftddDir);
    try {
      const labels: string[] = [];
      const runner = {
        async run(cmd: DriveCommand) {
          if (cmd.kind === "claude") { labels.push("claude"); return; /* no code, and reconcile writes no log below */ }
          if (cmd.kind === "cli") { labels.push(`cli:${cmd.args[0]}`); /* reconcile writes NO agent-log => validate fails */ }
        },
      };
      const effects = buildDriveEffects(cfg(sftddDir, projectDir, { useManifestSteps: true, runner, loopGranularity: "story" }));
      const bounded = await effects.performViaExecutor!(GREEN, state, routerDeps);
      expect(bounded).toBeDefined();
      // The honest-GREEN @build-cycle (cycle:green) must NOT have run , validation (missing agent-log) blocked it.
      expect(labels).not.toContain("cli:green");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns undefined for a driver turn that is NOT plain GREEN (e.g. a refactor/repair buildMode)", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-green-"));
    try {
      const effects = buildDriveEffects(cfg(join(projectDir, ".sftdd"), projectDir, { useManifestSteps: true }));
      const refactor: WorkflowAction = { kind: "invoke-role", role: "driver", story: RED_STORY, buildMode: "refactor" } as WorkflowAction;
      expect(await effects.performViaExecutor!(refactor, state, routerDeps)).toBeUndefined();
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
