// ManifestStep: the GENERIC StepContract driven ENTIRELY by a manifest + the validator
// registry + an injected agent. It is the norm; a bespoke StepContract class is the escape
// hatch. This slice proves ManifestStep(breakdownManifest, mockAgent) is behaviorally
// EQUIVALENT to the hand-written SpecAuthorBreakdownStep , same inputs/outputs/
// conformanceValidators/route/run assertions , so the bespoke class can collapse to it.
//
// It also pins the validator registry: the two breakdown validators are registered by name,
// resolveValidator returns the SAME deterministic fn, and an unknown name throws loud (a
// manifest typo is a hard failure, never a silent skip).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ManifestStep } from "../../consort/orchestrator/manifest/manifest-step";
import { VALIDATOR_REGISTRY, resolveValidator } from "../../consort/orchestrator/validators/conformance/validator-registry";
import { manifestForAction } from "../../consort/orchestrator/manifest/step-manifest";
import type { StepAgent, AgentInvocation } from "../../consort/orchestrator/agents/spec-author-breakdown-step-types";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive";

let ws: string;

const BREAKDOWN: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };

const PROVIDED_INPUTS: Record<string, string> = {
  "product-overview": "# Overview\nA stock app.\n",
  nfrs: "# NFRs\n## Required\n- R1: durability\n",
  "feature-request": "# Request\nRecord + view stock.\n",
};

function mockAgent(opts: { writes: boolean }): { agent: StepAgent; seen: AgentInvocation[] } {
  const seen: AgentInvocation[] = [];
  const agent: StepAgent = {
    async invoke(invocation) {
      seen.push(invocation);
      if (opts.writes) {
        writeFileSync(
          join(invocation.workspaceDir, "feature-spec.json"),
          JSON.stringify({ id: "F1-stock-visibility", name: "Stock", status: "draft", tdd_mode: "N>=2", stories: ["S1-record-stock"] }) + "\n",
        );
      }
    },
  };
  return { agent, seen };
}

/** The breakdown step, built purely from the shipped manifest + registry + agent. */
function breakdownStep(agent: StepAgent): ManifestStep {
  const manifest = manifestForAction(BREAKDOWN);
  if (!manifest) throw new Error("no breakdown manifest shipped");
  return new ManifestStep(manifest, agent);
}

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "manifest-step-ws-"));
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

describe("validator registry", () => {
  it("registers the two breakdown validators by name", () => {
    expect(Object.keys(VALIDATOR_REGISTRY)).toEqual(
      expect.arrayContaining(["featureSpecNonEmptyStories", "agentLogHasRoleEvent"]),
    );
  });

  it("resolveValidator returns the deterministic fn (rejects a storyless spec)", () => {
    const check = resolveValidator("featureSpecNonEmptyStories");
    const bad = join(ws, "storyless.json");
    writeFileSync(bad, JSON.stringify({ id: "F1-x", name: "Feature X", status: "draft", tdd_mode: "N=1", stories: [] }));
    expect(check(bad).ok).toBe(false);
  });

  it("resolveValidator THROWS loud on an unknown name (a manifest typo is not a silent skip)", () => {
    expect(() => resolveValidator("noSuchChecker")).toThrow(/noSuchChecker|unknown|not registered/i);
  });
});

describe("ManifestStep: logical contract (≡ SpecAuthorBreakdownStep)", () => {
  it("declares logical inputs = the 3 PO artifacts (ids only)", () => {
    const step = breakdownStep(mockAgent({ writes: true }).agent);
    expect(step.inputs(BREAKDOWN).map((s) => s.id)).toEqual(["product-overview", "nfrs", "feature-request"]);
  });

  it("declares its logical outputs = feature-spec AND a conformant log message", () => {
    const step = breakdownStep(mockAgent({ writes: true }).agent);
    const byId = Object.fromEntries(step.outputs(BREAKDOWN).map((o) => [o.id, o]));
    expect(byId["feature-spec"].filename).toBe("feature-spec.json");
    expect(byId["agent-log"].filename).toBe("agent-log.jsonl");
  });
});

describe("ManifestStep: run() within the provided workspace", () => {
  it("FAILS naming a missing PROVIDED input (no agent invoked)", async () => {
    const { agent, seen } = mockAgent({ writes: true });
    const step = breakdownStep(agent);
    const { "feature-request": _omit, ...twoInputs } = PROVIDED_INPUTS;
    const r = await step.run({ action: BREAKDOWN, workspaceDir: ws, inputs: twoInputs, instructions: { prompt: "p" } });
    expect(r.produced).toBe(false);
    expect(r.missingInput).toBe("feature-request");
    expect(seen).toHaveLength(0);
  });

  it("invokes the injected agent contained to the workspace, then reports the produced path", async () => {
    const { agent, seen } = mockAgent({ writes: true });
    const step = breakdownStep(agent);
    const instructions = { prompt: "Break F1 into stories", guidelines: ["independence test"] };
    const r = await step.run({ action: BREAKDOWN, workspaceDir: ws, inputs: PROVIDED_INPUTS, instructions });
    expect(seen).toHaveLength(1);
    expect(seen[0].workspaceDir).toBe(ws);
    expect(seen[0].inputs).toEqual(PROVIDED_INPUTS);
    expect(seen[0].instructions).toEqual(instructions);
    expect(r.produced).toBe(true);
    expect(r.producedPaths).toEqual([join(ws, "feature-spec.json")]);
    expect(existsSync(join(ws, "feature-spec.json"))).toBe(true);
  });

  it("reports produced:false when the agent writes nothing", async () => {
    const { agent } = mockAgent({ writes: false });
    const step = breakdownStep(agent);
    const r = await step.run({ action: BREAKDOWN, workspaceDir: ws, inputs: PROVIDED_INPUTS, instructions: { prompt: "p" } });
    expect(r.produced).toBe(false);
    expect(r.producedPaths).toBeUndefined();
  });
});

describe("ManifestStep: in-code output conformance validators (resolved from the registry by name)", () => {
  function outputCheck(id: string) {
    const step = breakdownStep(mockAgent({ writes: true }).agent);
    return step.outputs(BREAKDOWN).find((o) => o.id === id)!.validate;
  }

  it("feature-spec validator ACCEPTS a conformant spec and REJECTS a storyless one", () => {
    const check = outputCheck("feature-spec");
    const good = join(ws, "good-spec.json");
    writeFileSync(good, JSON.stringify({ id: "F1-x", name: "Feature X", status: "draft", tdd_mode: "N=1", stories: ["S1-a"] }));
    expect(check(good)).toEqual({ ok: true, violations: [] });
    const storyless = join(ws, "bad-spec.json");
    writeFileSync(storyless, JSON.stringify({ id: "F1-x", name: "Feature X", status: "draft", tdd_mode: "N=1", stories: [] }));
    const r = check(storyless);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/stories/i);
  });

  it("agent-log validator ACCEPTS a conformant line and REJECTS an empty log", () => {
    const check = outputCheck("agent-log");
    const good = join(ws, "good-log.jsonl");
    writeFileSync(good, JSON.stringify({
      timestamp: "2026-08-03T12:00:00Z", level: "info", role: "spec-author",
      event: "artifact.written", message: "wrote feature-spec.json + 1 story stub",
    }) + "\n");
    expect(check(good)).toEqual({ ok: true, violations: [] });
    const empty = join(ws, "empty-log.jsonl");
    writeFileSync(empty, "");
    expect(check(empty).ok).toBe(false);
  });
});

describe("ManifestStep: conformanceValidators() (exposed to the agent)", () => {
  it("exposes one validator per output, each with a docstring + the same in-code fn", () => {
    const step = breakdownStep(mockAgent({ writes: true }).agent);
    const byId = Object.fromEntries(step.conformanceValidators(BREAKDOWN).map((p) => [p.outputId, p]));
    expect(byId["feature-spec"].docstring.length).toBeGreaterThan(0);
    expect(byId["agent-log"].docstring.length).toBeGreaterThan(0);
    const bad = join(ws, "storyless.json");
    writeFileSync(bad, JSON.stringify({ id: "F1-x", name: "Feature X", status: "draft", tdd_mode: "N=1", stories: [] }));
    expect(byId["feature-spec"].fn(bad).ok).toBe(false);
  });
});

describe("ManifestStep: route()", () => {
  it("emits a produced proposal from the manifest routing map", () => {
    const step = breakdownStep(mockAgent({ writes: true }).agent);
    const proposal = step.route(BREAKDOWN, { state: { phase: "feature" } as never, feature: "F1-stock-visibility" });
    expect(proposal.outcome).toBe("produced");
    expect(proposal.proposedNext).toEqual({ kind: "design-complete" });
  });
});
