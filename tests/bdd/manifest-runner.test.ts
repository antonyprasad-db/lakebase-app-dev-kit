// manifest-runner: the bridge that takes a step MANIFEST and hands it to the orchestrator
// (the StepExecutor / Template Method). It builds the ManifestStep, assembles the
// orchestrator-owned seams (resolve inputs from the shared workspace, provision it, source
// instructions, reconcile routing), and runs the fixed 7 phases , so a caller drives a
// manifest without hand-wiring StepCtx/StepExecutorDeps every turn.
//
// runManifestStep runs ONE manifest. runManifestChain follows each turn's routing to the
// next manifest until the chain leaves the manifest set (a terminal / off-graph action),
// which is exactly the 2-turn stockflow demo: PO seed -> spec-author breakdown -> done.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runManifestStep, runManifestChain, type ManifestRunnerDeps } from "../../scripts/sftdd/manifest-runner";
import { loadStepManifests } from "../../scripts/sftdd/step-manifest";
import { makeReplayPoMockAgent } from "../../scripts/sftdd/replay-po-mock-agent";
import type { StepAgent } from "../../scripts/sftdd/spec-author-breakdown-step-types";
import type { StepManifest } from "../../scripts/sftdd/step-manifest";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive";

const KIT = process.cwd();
const CORPUS = join(KIT, "examples/sftdd-scenarios/stockflow");
const MANIFEST_DIR = join(CORPUS, "step-manifests");
const INTAKE = join(CORPUS, "intake");

const PO_SEED: WorkflowAction = { kind: "invoke-role", role: "product-owner", mode: "author-requests" };
const SPEC_AUTHOR: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };

let ws: string;
beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "manifest-runner-ws-"));
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

/** The PO mock (turn 1) + a mock spec-author (turn 2), keyed by the manifest's role. */
function agentFor(manifest: StepManifest): StepAgent {
  if (manifest.role === "product-owner") {
    return makeReplayPoMockAgent({
      corpusRoot: INTAKE,
      seeds: [
        { outputId: "product-overview", from: "product-overview.md", to: "product-overview.md" },
        { outputId: "nfrs", from: "nfrs.md", to: "nfrs.md" },
        { outputId: "design-guideline", from: "design-brief.md", to: "design-brief.md" },
      ],
    });
  }
  // Mock spec-author: reads the provided PO inputs, writes feature-spec + a log.
  return {
    async invoke(inv) {
      expect(Object.keys(inv.inputs).sort()).toEqual(["design-guideline", "nfrs", "product-overview"]);
      writeFileSync(
        join(inv.workspaceDir, "feature-spec.json"),
        JSON.stringify({ id: "F1-stock-visibility", name: "Stock Visibility", status: "draft", tdd_mode: "N>=2", stories: ["S1-record-stock"] }) + "\n",
      );
      writeFileSync(
        join(inv.workspaceDir, "agent-log.jsonl"),
        JSON.stringify({ timestamp: "2026-08-03T12:00:00Z", level: "info", role: "spec-author", event: "artifact.written", message: "wrote feature-spec.json" }) + "\n",
      );
    },
  };
}

function deps(): ManifestRunnerDeps {
  return {
    agentFor,
    workspaceDir: ws,
    cfg: { projectDir: ws, sftddDir: join(ws, ".sftdd"), featureId: "F1-stock-visibility" } as ManifestRunnerDeps["cfg"],
  };
}

describe("runManifestStep: one manifest -> the orchestrator (StepExecutor)", () => {
  it("runs turn 1 (PO seed) , materializes the recorded files, routes to spec-author", async () => {
    const manifests = loadStepManifests(MANIFEST_DIR);
    const res = await runManifestStep(PO_SEED, manifests, deps());
    expect(res.violations).toEqual([]);
    expect(existsSync(join(ws, "product-overview.md"))).toBe(true);
    expect(existsSync(join(ws, "nfrs.md"))).toBe(true);
    expect(existsSync(join(ws, "design-brief.md"))).toBe(true);
    expect(res.bounded.action).toEqual(SPEC_AUTHOR);
  });

  it("resolves turn 2's inputs from the shared workspace + produces feature-spec.json", async () => {
    // Seed the workspace as turn 1 would have.
    for (const f of ["product-overview.md", "nfrs.md", "design-brief.md"]) {
      writeFileSync(join(ws, f), readFileSync(join(INTAKE, f), "utf8"));
    }
    const manifests = loadStepManifests(MANIFEST_DIR);
    const res = await runManifestStep(SPEC_AUTHOR, manifests, deps());
    expect(res.violations).toEqual([]);
    expect(existsSync(join(ws, "feature-spec.json"))).toBe(true);
    expect(res.bounded.action).toEqual({ kind: "design-complete" });
  });

  it("THROWS when no manifest matches the action (the runner never silently no-ops)", async () => {
    const manifests = loadStepManifests(MANIFEST_DIR);
    await expect(runManifestStep({ kind: "planning-complete" } as WorkflowAction, manifests, deps())).rejects.toThrow(/no manifest|no step manifest/i);
  });
});

describe("runManifestChain: follow the routing across turns", () => {
  it("drives the full 2-turn stockflow demo from the PO seed to design-complete", async () => {
    const manifests = loadStepManifests(MANIFEST_DIR);
    const turns = await runManifestChain(PO_SEED, manifests, deps());

    // Two turns ran, in order, each clean.
    expect(turns.map((t) => t.manifestId)).toEqual(["stockflow-demo-po-seed", "stockflow-demo-spec-author"]);
    for (const t of turns) expect(t.result.violations).toEqual([]);

    // The chain produced BOTH turns' artifacts in the one shared workspace.
    expect(existsSync(join(ws, "product-overview.md"))).toBe(true);
    expect(existsSync(join(ws, "feature-spec.json"))).toBe(true);

    // It stopped at the terminal (design-complete has no matching manifest).
    expect(turns[turns.length - 1].result.bounded.action).toEqual({ kind: "design-complete" });
  });

  it("stops at a maxTurns guard rather than looping forever", async () => {
    const manifests = loadStepManifests(MANIFEST_DIR);
    const turns = await runManifestChain(PO_SEED, manifests, deps(), { maxTurns: 1 });
    expect(turns).toHaveLength(1);
    expect(turns[0].manifestId).toBe("stockflow-demo-po-seed");
  });
});
