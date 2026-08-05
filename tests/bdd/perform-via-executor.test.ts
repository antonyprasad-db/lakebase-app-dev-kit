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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDriveEffects, type DriveCommand, type DriveEffectsConfig } from "../../scripts/sftdd/orchestrator-effects";
import type { WorkflowAction, DriveState } from "../../scripts/sftdd/orchestrator-drive";
import type { ValidateBoundDeps } from "../../consort/orchestrator/contract/step-contract";

const BREAKDOWN: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };
const FEATURE = "F1-stock-visibility";

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

  it("returns undefined for an action NOT on the executor allowlist (e.g. a build turn)", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-"));
    try {
      const effects = buildDriveEffects(cfg(join(projectDir, ".sftdd"), projectDir, { useManifestSteps: true }));
      const green: WorkflowAction = { kind: "invoke-role", role: "driver", story: "S1-a" };
      expect(await effects.performViaExecutor!(green, state, routerDeps)).toBeUndefined();
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
