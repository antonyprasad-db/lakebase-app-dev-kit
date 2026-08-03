// LIVE, config-driven stockflow orchestration (gated behind RUN_LIVE_STEP=1):
//
//   RUN_LIVE_STEP=1 npx vitest run tests/live/stockflow-demo-config-live.test.ts
//
// Drives the 2-turn stockflow chain through the manifest runner with EVERY agent chosen from
// config (manifest.agent), no agentFor:
//   turn 1  stockflow-demo-po-seed    , agent.kind = "replay" , replays the recorded intake
//           files (offline mock of the human PO).
//   turn 2  stockflow-demo-spec-author , agent.kind = "claude" , the REAL agent spawns and
//           AUTHORS feature-spec.json from the PO inputs (this is the point: turn 2 does real
//           work, not a replay).
//
// The test supplies only ENV (agentContext: corpusRoot=intake, kitDir) + the kit-env
// workspace the live claude turn needs + the spec-author's .sftdd output path. Runs through
// vitest so ESM resolution is correct (a raw tsx/CJS run trips over @octokit/app's ESM-only
// exports on the claude agent's transitive import path).

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, cpSync, chmodSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStepManifests, type StepManifest } from "../../consort/orchestrator/manifest/step-manifest.js";
import { runManifestChain, type ManifestRunnerDeps } from "../../consort/orchestrator/manifest/manifest-runner.js";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive.js";
import type { DriveEffectsConfig } from "../../scripts/sftdd/orchestrator-effects.js";

const KIT = process.cwd();
const CORPUS = join(KIT, "examples/sftdd-scenarios/stockflow");
const MANIFEST_DIR = join(CORPUS, "step-manifests");
const INTAKE = join(CORPUS, "intake");
const FEATURE = "F1-stock-visibility";
const SPEC_REL = `.sftdd/features/${FEATURE}/feature-spec.json`;
const LOG_REL = ".sftdd/agent-log.jsonl";
const PO_SEED: WorkflowAction = { kind: "invoke-role", role: "product-owner", mode: "author-requests" };

function setupWorkspace(): string {
  const ws = mkdtempSync(join(tmpdir(), "stockflow-cfg-live-"));
  mkdirSync(join(ws, ".sftdd", "features", FEATURE), { recursive: true });
  mkdirSync(join(ws, ".claude", "agents"), { recursive: true });
  cpSync(join(KIT, "skills/consort/agents/spec-author.md"), join(ws, ".claude", "agents", "spec-author.md"));
  mkdirSync(join(ws, "scripts"), { recursive: true });
  const lkSrc = join(KIT, "templates/project/common/scripts/lk");
  if (existsSync(lkSrc)) {
    cpSync(lkSrc, join(ws, "scripts", "lk"));
    chmodSync(join(ws, "scripts", "lk"), 0o755);
  }
  process.env.LAKEBASE_KIT_DIR = KIT;
  return ws;
}

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

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE: stockflow 2-turn chain, agents from config (replay PO + live claude spec-author)", () => {
  it("PO replays the recorded seed, then the LIVE spec-author authors a conformant feature-spec.json", async () => {
    const workspaceDir = setupWorkspace();
    const manifests = loadStepManifests(MANIFEST_DIR);
    // sanity: the manifests pick the agents (not this test).
    expect(manifests.find((m) => m.role === "product-owner")?.agent?.kind).toBe("replay");
    expect(manifests.find((m) => m.role === "spec-author")?.agent?.kind).toBe("claude");

    const deps: ManifestRunnerDeps = {
      workspaceDir,
      cfg: { projectDir: workspaceDir, sftddDir: join(workspaceDir, ".sftdd"), featureId: FEATURE } as DriveEffectsConfig,
      agentContext: { corpusRoot: INTAKE, kitDir: KIT },
      instructionsFor,
      provisionWorkspace: (m) =>
        m.role === "spec-author"
          ? { workspaceDir, outputPaths: { "feature-spec": SPEC_REL, "agent-log": LOG_REL } }
          : { workspaceDir },
    };

    const turns = await runManifestChain(PO_SEED, manifests, deps);

    expect(turns.map((t) => t.manifestId)).toEqual(["stockflow-demo-po-seed", "stockflow-demo-spec-author"]);
    for (const t of turns) {
      expect(t.result.violations, `${t.manifestId} violations: ${t.result.violations.join("; ")}`).toEqual([]);
    }
    // Turn 1 replayed the PO seed.
    expect(existsSync(join(workspaceDir, "product-overview.md"))).toBe(true);
    // Turn 2 (LIVE) authored the feature-spec at its .sftdd path + it passed its validator.
    const specPath = join(workspaceDir, SPEC_REL);
    expect(existsSync(specPath), "live spec-author did not produce feature-spec.json").toBe(true);
    const spec = JSON.parse(readFileSync(specPath, "utf8")) as { stories?: string[] };
    expect(Array.isArray(spec.stories) && spec.stories.length >= 1).toBe(true);
    // Chain terminated cleanly at design-complete.
    expect(turns[turns.length - 1].result.bounded.action).toEqual({ kind: "design-complete" });
  }, 300_000);
});
