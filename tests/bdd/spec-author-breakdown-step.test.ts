// SpecAuthorBreakdownStep: the FIRST concrete StepContract , dumb + CONTAINED.
// The orchestrator owns .sftdd: it reads the 3 PO artifacts, provisions a workspace, and
// hands the step (a) the input CONTENTS and (b) the workspace dir. The step declares its
// logical inputs/outputs, forwards the provided instructions to its injected agent pointed
// at the workspace, and reports what the agent produced THERE , it never resolves .sftdd,
// never validates conformance (the orchestrator does). The agent is injected so the step
// is unit-tested with no cloud/model: the mock agent writes the fixture output into the
// PROVIDED workspace.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SpecAuthorBreakdownStep } from "../../scripts/sftdd/spec-author-breakdown-step";
import type { StepAgent, AgentInvocation } from "../../scripts/sftdd/spec-author-breakdown-step-types";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive";

let ws: string;

/** The action the orchestrator pins for this step. */
const BREAKDOWN: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };

/** The 3 PO input CONTENTS the orchestrator resolved from .sftdd and PROVIDES. */
const PROVIDED_INPUTS: Record<string, string> = {
  "product-overview": "# Overview\nA stock app.\n",
  nfrs: "# NFRs\n## Required\n- R1: durability\n",
  "feature-request": "# Request\nRecord + view stock.\n",
};

/** A mock agent: records the invocation it was handed, and (when writes) produces the
 *  fixture feature-spec.json INSIDE the provided workspace , exactly where the real agent
 *  would write. `writes:false` simulates an agent that produced nothing. */
function mockAgent(opts: { writes: boolean }): { agent: StepAgent; seen: AgentInvocation[] } {
  const seen: AgentInvocation[] = [];
  const agent: StepAgent = {
    async invoke(invocation) {
      seen.push(invocation);
      if (opts.writes) {
        // The agent writes ONLY within the provided workspace.
        writeFileSync(
          join(invocation.workspaceDir, "feature-spec.json"),
          JSON.stringify({ id: "F1-stock-visibility", name: "Stock", status: "draft", tdd_mode: "N>=2", stories: ["S1-record-stock"] }) + "\n",
        );
      }
    },
  };
  return { agent, seen };
}

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "spec-author-ws-"));
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

describe("SpecAuthorBreakdownStep: logical contract (dumb + contained)", () => {
  it("declares logical inputs = the 3 PO artifacts (ids only, no paths)", () => {
    const step = new SpecAuthorBreakdownStep(mockAgent({ writes: true }).agent);
    expect(step.inputs(BREAKDOWN).map((s) => s.id)).toEqual(["product-overview", "nfrs", "feature-request"]);
  });

  it("declares its logical outputs = feature-spec AND a conformant log message", () => {
    const step = new SpecAuthorBreakdownStep(mockAgent({ writes: true }).agent);
    const out = step.outputs(BREAKDOWN);
    const byId = Object.fromEntries(out.map((o) => [o.id, o]));
    expect(byId["feature-spec"].filename).toBe("feature-spec.json");
    // The agent must ALSO log what it did / surface any issue , a required output, emitted
    // via the shared agent-log script into the workspace's agent-log.jsonl.
    expect(byId["agent-log"].filename).toBe("agent-log.jsonl");
  });
});

describe("SpecAuthorBreakdownStep: run() within the provided workspace", () => {
  it("FAILS naming a missing PROVIDED input (no agent invoked)", async () => {
    const { agent, seen } = mockAgent({ writes: true });
    const step = new SpecAuthorBreakdownStep(agent);
    // Orchestrator provided only two of the three inputs.
    const { "feature-request": _omit, ...twoInputs } = PROVIDED_INPUTS;
    const r = await step.run({ action: BREAKDOWN, workspaceDir: ws, inputs: twoInputs, instructions: { prompt: "p" } });
    expect(r.produced).toBe(false);
    expect(r.missingInput).toBe("feature-request");
    expect(seen).toHaveLength(0); // fail loud BEFORE invoking the agent
  });

  it("invokes the injected agent CONTAINED to the provided workspace + inputs + instructions, then reports the produced path", async () => {
    const { agent, seen } = mockAgent({ writes: true });
    const step = new SpecAuthorBreakdownStep(agent);
    const instructions = { prompt: "Break F1 into stories", guidelines: ["independence test", "feature-spec.json is required"] };
    const r = await step.run({ action: BREAKDOWN, workspaceDir: ws, inputs: PROVIDED_INPUTS, instructions });

    // The step handed the agent EXACTLY what it was provided , nothing sourced itself.
    expect(seen).toHaveLength(1);
    expect(seen[0].workspaceDir).toBe(ws);
    expect(seen[0].inputs).toEqual(PROVIDED_INPUTS);
    expect(seen[0].instructions).toEqual(instructions);
    // Produced artifact lives IN THE WORKSPACE; the step reports its path (no validation).
    expect(r.produced).toBe(true);
    expect(r.producedPaths).toEqual([join(ws, "feature-spec.json")]);
    expect(existsSync(join(ws, "feature-spec.json"))).toBe(true);
  });

  it("reports produced:false when the agent writes nothing to the workspace (orchestrator then handles it)", async () => {
    const { agent } = mockAgent({ writes: false });
    const step = new SpecAuthorBreakdownStep(agent);
    const r = await step.run({ action: BREAKDOWN, workspaceDir: ws, inputs: PROVIDED_INPUTS, instructions: { prompt: "p" } });
    expect(r.produced).toBe(false);
    expect(r.producedPaths).toBeUndefined();
  });
});

describe("SpecAuthorBreakdownStep: in-code output conformance validators (no agent round-trip)", () => {
  function outputCheck(id: string) {
    const step = new SpecAuthorBreakdownStep(mockAgent({ writes: true }).agent);
    return step.outputs(BREAKDOWN).find((o) => o.id === id)!.validate;
  }

  it("feature-spec validator ACCEPTS a conformant feature-spec.json and REJECTS a storyless one", () => {
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

  it("agent-log validator ACCEPTS a conformant spec-author log line and REJECTS an empty log", () => {
    const check = outputCheck("agent-log");
    const good = join(ws, "good-log.jsonl");
    writeFileSync(good, JSON.stringify({
      timestamp: "2026-08-03T12:00:00Z", level: "info", role: "spec-author",
      event: "artifact.written", message: "wrote feature-spec.json + 1 story stub",
    }) + "\n");
    expect(check(good)).toEqual({ ok: true, violations: [] });

    const empty = join(ws, "empty-log.jsonl");
    writeFileSync(empty, "");
    const r = check(empty);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/empty|log/i);
  });
});

describe("SpecAuthorBreakdownStep: conformanceValidators() (validators exposed to the agent, part of the step definition)", () => {
  it("exposes one validator per output, each with a docstring + the same in-code fn", () => {
    const step = new SpecAuthorBreakdownStep(mockAgent({ writes: true }).agent);
    const provided = step.conformanceValidators(BREAKDOWN);
    const byId = Object.fromEntries(provided.map((p) => [p.outputId, p]));
    // Every output the agent must produce has an agent-callable validator with guidance.
    expect(byId["feature-spec"].docstring).toMatch(/feature-spec\.json|stories\[\]/);
    expect(byId["agent-log"].docstring).toMatch(/agent-log\.jsonl|spec-author event/);
    // The exposed fn is the SAME deterministic check the orchestrator runs (reject a bad one).
    const bad = join(ws, "storyless.json");
    writeFileSync(bad, JSON.stringify({ id: "F1-x", name: "Feature X", status: "draft", tdd_mode: "N=1", stories: [] }));
    expect(byId["feature-spec"].fn(bad).ok).toBe(false);
  });
});

describe("SpecAuthorBreakdownStep: route()", () => {
  it("emits a produced proposal (orchestrator reconciles it with the allowed transition)", () => {
    const step = new SpecAuthorBreakdownStep(mockAgent({ writes: true }).agent);
    const proposal = step.route(BREAKDOWN, { state: { phase: "feature" } as never, feature: "F1-stock-visibility" });
    expect(proposal.outcome).toBe("produced");
  });
});
