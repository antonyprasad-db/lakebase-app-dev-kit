// Stage G , performTurnViaExecutor derives the REPLAY / RECORD lane from ENV, through the SAME
// buildAgent seam:
//   * LAKEBASE_CONSORT_REPLAY_DIR set  => the manifest's kind is swapped to "replay"; the step-aware
//     corpus agent MATERIALIZES the turn's recorded slice into the workspace , NO claude command
//     reaches the runner (proven by the runner spy recording no "claude:*").
//   * LAKEBASE_CONSORT_RECORD_DIR set  => the live agent runs, then the ReplayRecorderWrapper writes
//     the turn's delta into the corpus (turns/NNNN-<label>/).
// Both selected from env in the executor, not a bespoke lane , the modular point.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildDriveEffects, type DriveCommand, type DriveEffectsConfig } from "../../consort/orchestrator/drive/orchestrator-effects";
import { resetStepReplayCursor } from "../../consort/orchestrator/agents/mock-replay-agent";
import type { WorkflowAction, DriveState } from "../../consort/orchestrator/drive/orchestrator-drive";
import type { ValidateBoundDeps } from "../../consort/orchestrator/steps/step-contract";

const FEATURE = "F1-stock-visibility";
const BREAKDOWN: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };

const routerDeps: ValidateBoundDeps = {
  allowed: () => ({ kind: "design-complete" }) as WorkflowAction,
  reviseBudgetAvailable: () => true,
  recordRetry: () => ({ sanctioned: true }),
};
const state = { phase: "feature" } as unknown as DriveState;

function cfg(consortDir: string, projectDir: string, over: Partial<DriveEffectsConfig> = {}): DriveEffectsConfig {
  return {
    projectDir, consortDir, featureId: FEATURE,
    runner: { async run() {} }, modelForRole: () => "opus",
    approver: "human-proxy", deployTarget: "local",
    useManifestSteps: true,
    ...over,
  } as DriveEffectsConfig;
}

/** A runner spy that records claude/cli labels (to prove replay never dispatches a claude command). */
function spyRunner() {
  const labels: string[] = [];
  return { labels, runner: { async run(cmd: DriveCommand) { labels.push(cmd.kind === "claude" ? `claude:${cmd.role}` : cmd.kind === "cli" ? `cli:${cmd.bin}` : cmd.kind); } } };
}

/** The turn dirs (directories only) under a corpus turns/. */
function turnDirs(root: string): string[] {
  const t = join(root, "turns");
  return existsSync(t) ? readdirSync(t).filter((n) => statSync(join(t, n)).isDirectory()) : [];
}

let projectDir: string;
let consortDir: string;
beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "lane-"));
  consortDir = join(projectDir, ".consort");
  mkdirSync(join(consortDir, "features", FEATURE), { recursive: true });
  // Seed the breakdown manifest's DECLARED inputs so the executor's phase-1 presence gate passes
  // (the replay agent then materializes the OUTPUT; the inputs are the upstream PO artifacts).
  for (const f of ["product-overview.md", "nfrs.md", "feature-request.md"]) {
    writeFileSync(join(consortDir, f), `# ${f}\nseed\n`);
  }
});
afterEach(() => {
  delete process.env.LAKEBASE_CONSORT_REPLAY_DIR;
  delete process.env.LAKEBASE_CONSORT_RECORD_DIR;
  rmSync(projectDir, { recursive: true, force: true });
});

describe("Stage G: executor selects the REPLAY lane from env (kind swap, corpus materialized, no spawn)", () => {
  it("REPLAY_DIR => step-aware replay materializes the recorded slice; the runner sees NO claude command", async () => {
    // A tiny corpus: one recorded breakdown turn whose files/ delta carries feature-spec.json.
    const corpus = mkdtempSync(join(tmpdir(), "lane-corpus-"));
    try {
      const turnDir = join(corpus, "turns", "0004-spec-author-breakdown");
      mkdirSync(join(turnDir, "files", ".sftdd", "features", FEATURE), { recursive: true });
      writeFileSync(join(turnDir, "turn.json"), JSON.stringify({ action: BREAKDOWN, produced: [".sftdd/features/" + FEATURE + "/feature-spec.json"] }));
      writeFileSync(join(turnDir, "files", ".sftdd", "features", FEATURE, "feature-spec.json"),
        JSON.stringify({ id: FEATURE, name: "Stock", status: "draft", tdd_mode: "N=1", stories: ["S1-a"] }) + "\n");

      process.env.LAKEBASE_CONSORT_REPLAY_DIR = corpus;
      const spy = spyRunner();
      const effects = buildDriveEffects(cfg(consortDir, projectDir, { runner: spy.runner }));
      const bounded = await effects.performViaExecutor!(BREAKDOWN, state, routerDeps);

      expect(bounded, "executor-dispatched under replay").toBeDefined();
      // The recorded artifact was MATERIALIZED (remapped .sftdd -> .consort) by the replay agent.
      expect(existsSync(join(consortDir, "features", FEATURE, "feature-spec.json"))).toBe(true);
      // and NO claude command reached the runner (the replay agent stands in for the spawn).
      expect(spy.labels.filter((l) => l.startsWith("claude:"))).toEqual([]);
    } finally {
      resetStepReplayCursor(corpus);
      rmSync(corpus, { recursive: true, force: true });
    }
  });
});

describe("Stage G: executor RECORD lane wraps the agent (records the turn's delta)", () => {
  it("RECORD_DIR => the turn is recorded into turns/NNNN-<label>/ after the (replay) agent produces it", async () => {
    // Use REPLAY as the inner agent (hermetic, no spawn) AND RECORD on: proves the wrapper records
    // whatever agent ran. (Recording a live claude run is the same wrapper over the live agent.)
    const corpus = mkdtempSync(join(tmpdir(), "lane-corpus2-"));
    const recordDir = mkdtempSync(join(tmpdir(), "lane-record-"));
    try {
      const turnDir = join(corpus, "turns", "0004-spec-author-breakdown");
      mkdirSync(join(turnDir, "files", ".sftdd", "features", FEATURE), { recursive: true });
      writeFileSync(join(turnDir, "turn.json"), JSON.stringify({ action: BREAKDOWN, produced: [".sftdd/features/" + FEATURE + "/feature-spec.json"] }));
      writeFileSync(join(turnDir, "files", ".sftdd", "features", FEATURE, "feature-spec.json"),
        JSON.stringify({ id: FEATURE, name: "Stock", status: "draft", tdd_mode: "N=1", stories: ["S1-a"] }) + "\n");

      process.env.LAKEBASE_CONSORT_REPLAY_DIR = corpus;
      process.env.LAKEBASE_CONSORT_RECORD_DIR = recordDir;
      const effects = buildDriveEffects(cfg(consortDir, projectDir, { runner: { async run() {} } }));
      await effects.performViaExecutor!(BREAKDOWN, state, routerDeps);

      // The recorder wrote a turn slice for the breakdown action.
      const dirs = turnDirs(recordDir);
      expect(dirs.length).toBeGreaterThanOrEqual(1);
      expect(dirs.some((d) => d.includes("spec-author"))).toBe(true);
    } finally {
      resetStepReplayCursor(corpus);
      rmSync(corpus, { recursive: true, force: true });
      rmSync(recordDir, { recursive: true, force: true });
    }
  });
});
