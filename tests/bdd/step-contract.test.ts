// step-contract: the ONE step interface every role/step implements — carrying its
// INPUT contract (what must exist before it runs), its OUTPUT expectation (what it must
// produce), and its ROUTING (where it proposes to go next on completion), together. The
// orchestrator VALIDATES the routing proposal against the pure transition and BOUNDS
// re-routes/retries with the existing limits (validateAndBound). This slice is contract
// + mock + validateAndBound (no real roles implement it yet), so every case is hermetic.

import { describe, it, expect } from "vitest";
import {
  MockStepContract,
  validateAndBound,
  type RouteProposal,
  type StepContract,
  type ValidateBoundDeps,
} from "../../scripts/sftdd/step-contract";
import type { DriveState, WorkflowAction } from "../../scripts/sftdd/orchestrator-drive";

const STATE = { phase: "feature" } as unknown as DriveState;
const sig = (a: WorkflowAction): string => JSON.stringify(a);

const specAuthorS1: WorkflowAction = { kind: "invoke-role", role: "spec-author", story: "S1" };
const architectS1: WorkflowAction = { kind: "invoke-role", role: "architect-reviewer", story: "S1" };
const dbaS1: WorkflowAction = { kind: "invoke-role", role: "dba", story: "S1" };

function deps(over: Partial<ValidateBoundDeps> = {}): ValidateBoundDeps {
  return {
    allowed: () => dbaS1,
    reviseBudgetAvailable: () => true,
    recordRetry: () => ({ sanctioned: true }),
    ...over,
  };
}

describe("MockStepContract: the ONE contract's first implementation (inputs + outputs + route)", () => {
  it("declares a step's INPUT contract as LOGICAL specs (ids, not paths)", () => {
    const c: StepContract = new MockStepContract({
      inputs: { [sig(architectS1)]: [{ id: "acs", description: "the story's acceptance criteria" }] },
    });
    expect(c.inputs(architectS1)).toEqual([{ id: "acs", description: "the story's acceptance criteria" }]);
  });

  it("declares a step's OUTPUT as LOGICAL specs (id + workspace filename + in-code checker)", () => {
    const check = () => ({ ok: true, violations: [] });
    const c = new MockStepContract({
      outputs: { [sig(architectS1)]: [{ id: "architecture", description: "the feature architecture", filename: "architecture.json", validate: check }] },
    });
    const out = c.outputs(architectS1);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "architecture", filename: "architecture.json" });
    // Every output carries an in-code conformance checker (deterministic accept/reject).
    expect(out[0].validate("/any/path")).toEqual({ ok: true, violations: [] });
  });

  it("emits a ROUTING proposal on completion, keyed by the completed action", () => {
    const proposal: RouteProposal = { outcome: "produced", proposedNext: dbaS1 };
    const c = new MockStepContract({ route: { [sig(architectS1)]: proposal } });
    expect(c.route(architectS1, { state: STATE, feature: "F1" })).toEqual(proposal);
  });

  it("defaults to empty input + output specs + throws on an unscripted route", () => {
    const c = new MockStepContract({});
    expect(c.inputs(specAuthorS1)).toEqual([]);
    expect(c.outputs(specAuthorS1)).toEqual([]);
    expect(() => c.route(specAuthorS1, { state: STATE, feature: "F1" })).toThrow(/no scripted proposal/i);
  });
});

describe("validateAndBound: step proposes, orchestrator validates + bounds (routing half of the contract)", () => {
  const completed = architectS1;

  it("HONORS a proposal that matches the pure allowed transition", () => {
    const proposal: RouteProposal = { outcome: "produced", proposedNext: dbaS1 };
    const r = validateAndBound(proposal, completed, STATE, deps());
    expect(r.action).toEqual(dbaS1);
    expect(r.sanctionedRetry).toBe(false);
    expect(r.note).toBeUndefined();
  });

  it("FALLS BACK to the pure transition when the proposal is off the allowed graph", () => {
    const proposal: RouteProposal = { outcome: "produced", proposedNext: { kind: "merge" } };
    const r = validateAndBound(proposal, completed, STATE, deps());
    expect(r.action).toEqual(dbaS1);
    expect(r.note).toMatch(/mismatch|fell back|not allowed|not the allowed/i);
  });

  it("HONORS a revise re-route when the revise budget has room", () => {
    const proposal: RouteProposal = {
      outcome: "revise",
      proposedNext: { kind: "revise-route", story: "S1", role: "spec-author", gate: "spec", reason: "spec defect", source: "architect-reviewer" },
      reason: "spec defect",
    };
    const r = validateAndBound(proposal, completed, STATE, deps({ reviseBudgetAvailable: () => true }));
    expect(r.action.kind).toBe("revise-route");
  });

  it("CONVERTS a revise re-route to raise-to-hil when the budget is exhausted", () => {
    const proposal: RouteProposal = {
      outcome: "revise",
      proposedNext: { kind: "revise-route", story: "S1", role: "spec-author", gate: "spec", reason: "spec defect", source: "architect-reviewer" },
      reason: "spec defect",
    };
    const r = validateAndBound(proposal, completed, STATE, deps({ reviseBudgetAvailable: () => false }));
    expect(r.action.kind).toBe("raise-to-hil");
    if (r.action.kind === "raise-to-hil") expect(r.action.reason).toMatch(/spec defect|budget/i);
  });

  it("routes an escalate outcome straight to raise-to-hil", () => {
    const proposal: RouteProposal = { outcome: "escalate", proposedNext: dbaS1, reason: "cannot proceed" };
    const r = validateAndBound(proposal, completed, STATE, deps());
    expect(r.action.kind).toBe("raise-to-hil");
  });

  it("blocked (repeat the same step) is a SANCTIONED retry while the ledger allows it", () => {
    const proposal: RouteProposal = { outcome: "blocked", proposedNext: completed, reason: "artifact missing" };
    const r = validateAndBound(proposal, completed, STATE, deps({ recordRetry: () => ({ sanctioned: true }) }));
    expect(r.action).toEqual(completed);
    expect(r.sanctionedRetry).toBe(true);
  });

  it("blocked THROWS (ProtocolViolation) when the retry ledger is exhausted", () => {
    const proposal: RouteProposal = { outcome: "blocked", proposedNext: completed, reason: "artifact missing" };
    const thrower: ValidateBoundDeps["recordRetry"] = () => {
      throw new Error("ProtocolViolation: retry budget exhausted");
    };
    expect(() => validateAndBound(proposal, completed, STATE, deps({ recordRetry: thrower }))).toThrow(/retry budget exhausted/i);
  });
});
