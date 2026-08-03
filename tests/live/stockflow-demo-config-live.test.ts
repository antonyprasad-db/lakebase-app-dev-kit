// LIVE, fully config-driven stockflow orchestration (gated behind RUN_LIVE_STEP=1):
//
//   RUN_LIVE_STEP=1 npx vitest run tests/live/stockflow-demo-config-live.test.ts
//
// Everything comes from config , NOTHING hardcoded in this file:
//   - the RUN-CONFIG (examples/.../stockflow/stockflow-demo.run.json) supplies setup
//     (scaffold a REAL project) + teardown (remove it), with DEFAULTS anyone overrides via env
//     (DATABRICKS_HOST, STOCKFLOW_DEMO_GH_OWNER, STOCKFLOW_DEMO_TIERS, ...).
//   - the STEP MANIFESTS pick the agents: po-seed -> replay (mock the human PO from the
//     recorded intake), spec-author -> claude (the REAL agent authors feature-spec.json).
// The runner runs scaffold-project -> chain -> remove-project (finally). Scaffolding a real
// project is what makes ./scripts/lk resolve so the live spec-author's self-check + log work.
//
// CLOUD: this creates a real GitHub repo + Lakebase project (per the run-config defaults) and
// deletes them in teardown. It needs Databricks + gh creds present. Anyone runs it against
// their own workspace by setting the env overrides.

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, cpSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRunConfig } from "../../consort/orchestrator/manifest/run-config-loader.js";
import { loadStepManifests, type StepManifest } from "../../consort/orchestrator/manifest/step-manifest.js";
import { runOrchestration } from "../../consort/orchestrator/manifest/orchestration-runner.js";
import { catalogueLifecycleDeps } from "../../consort/orchestrator/manifest/lifecycle-catalogue.js";
import type { ManifestRunnerDeps } from "../../consort/orchestrator/manifest/manifest-runner.js";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive.js";
import type { DriveEffectsConfig } from "../../scripts/sftdd/orchestrator-effects.js";

const KIT = process.cwd();
const CORPUS = join(KIT, "examples/sftdd-scenarios/stockflow");
const RUN_CONFIG = join(CORPUS, "stockflow-demo.run.json");
const MANIFEST_DIR = join(CORPUS, "step-manifests");
const INTAKE = join(CORPUS, "intake");
const FEATURE = "F1-stock-visibility";
const SPEC_REL = `.sftdd/features/${FEATURE}/feature-spec.json`;
const LOG_REL = ".sftdd/agent-log.jsonl";

function instructionsFor(manifest: StepManifest): { prompt: string; guidelines: string[] } {
  if (manifest.role !== "spec-author") return { prompt: `Run ${manifest.role} step ${manifest.id}.`, guidelines: [] };
  return {
    prompt:
      `Break feature ${FEATURE} into its stories from the provided inputs. WRITE ${SPEC_REL} ` +
      `(id, name, status "draft", tdd_mode, NON-EMPTY stories[]) + a stub dir per story under ` +
      `.sftdd/features/${FEATURE}/stories/<S>/. Then run your self-check: ./scripts/lk ` +
      `lakebase-sftdd-response-formatter --role spec-author --feature ${FEATURE} --tdd-dir .sftdd , ` +
      `fix anything it flags. Then log: ./scripts/lk lakebase-sftdd-log --role spec-author --level ` +
      `info --event artifact.written --message "<what you wrote>" --tdd-dir .sftdd. Read ONLY the provided inputs.`,
    guidelines: [
      "feature-spec.json is REQUIRED and must have a non-empty stories[].",
      "The self-check must pass before you return; log at least one spec-author event.",
    ],
  };
}

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE: stockflow demo end-to-end from config (scaffold -> replay PO -> live claude -> teardown)", () => {
  it("runs the shipped run-config: scaffolds a real project, drives the 2-turn chain, tears it down", async () => {
    const runConfig = loadRunConfig(RUN_CONFIG);
    const manifests = loadStepManifests(MANIFEST_DIR);
    // The agents are chosen by the MANIFESTS, not this test.
    expect(manifests.find((m) => m.role === "product-owner")?.agent?.kind).toBe("replay");
    expect(manifests.find((m) => m.role === "spec-author")?.agent?.kind).toBe("claude");
    // setup/teardown come from the RUN-CONFIG.
    expect(runConfig.setup?.kind).toBe("scaffold-project");
    expect(runConfig.teardown?.kind).toBe("remove-project");

    // The runner works inside the scaffolded project. scaffold-project creates it under this
    // parentDir; the chain + the live claude agent run there so ./scripts/lk resolves.
    const parentDir = mkdtempSync(join(tmpdir(), "stockflow-demo-parent-"));
    (runConfig.setup!.config as Record<string, unknown>).parentDir = parentDir;
    const projectName = String((runConfig.setup!.config as Record<string, unknown>).projectName);
    const workspaceDir = join(parentDir, projectName);

    const runnerDeps: ManifestRunnerDeps = {
      workspaceDir,
      cfg: { projectDir: workspaceDir, sftddDir: join(workspaceDir, ".sftdd"), featureId: FEATURE } as DriveEffectsConfig,
      agentContext: { corpusRoot: INTAKE, kitDir: KIT },
      instructionsFor,
      provisionWorkspace: (m) =>
        m.role === "spec-author"
          ? { workspaceDir, outputPaths: { "feature-spec": SPEC_REL, "agent-log": LOG_REL } }
          : { workspaceDir },
    };
    // The scaffolded project provides scripts/lk; point the agent's kit resolution at the kit.
    process.env.LAKEBASE_KIT_DIR = KIT;

    const result = await runOrchestration(runConfig, manifests, runnerDeps, catalogueLifecycleDeps);

    // Setup scaffolded a project; teardown removed it.
    expect(result.setup?.ok, `scaffold failed: ${result.setup?.error}`).toBe(true);
    // Chain: PO replayed, then the LIVE spec-author authored a conformant feature-spec.
    expect(result.turns.map((t) => t.manifestId)).toEqual(["stockflow-demo-po-seed", "stockflow-demo-spec-author"]);
    for (const t of result.turns) {
      expect(t.result.violations, `${t.manifestId}: ${t.result.violations.join("; ")}`).toEqual([]);
    }
    expect(existsSync(join(workspaceDir, SPEC_REL))).toBe(true);
    expect(result.turns[result.turns.length - 1].result.bounded.action).toEqual({ kind: "design-complete" });
    expect(result.teardown?.ok, `teardown failed: ${result.teardown?.error}`).toBe(true);
  }, 900_000);
});
