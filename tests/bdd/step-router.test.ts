// step-router: the ONE routing contract. Each step EMITS a RouteProposal (where it
// thinks the orchestrator should go next); the orchestrator VALIDATES the proposal
// against the pure allowed transition and BOUNDS re-routes/retries with the existing
// limits before honoring it or falling back to state-derivation. This slice is
// contract + mock + validateAndBound only (no real roles emit yet), so every case
// here is hermetic: no cloud, no model, no disk.

import { describe, it, expect } from "vitest";
import {
  MockStepRouter,
  validateAndBound,
  type RouteProposal,
  type StepRouter,
  type ValidateBoundDeps,
} from "../../scripts/sftdd/step-router";
import type { DriveState, WorkflowAction } from "../../scripts/sftdd/orchestrator-drive";

// A minimal DriveState is enough: validateAndBound never reads it directly; it hands
// it to the injected `allowed` (the pure transition) + bound checkers. We stub those.
const STATE = { phase: "feature" } as unknown as DriveState;

const sig = (a: WorkflowAction): string => JSON.stringify(a);

// Default deps: `allowed` returns a fixed next action (the pure allowlist stand-in);
// revise budget available; retry ledger accepts one retry then throws.
function deps(over: Partial<ValidateBoundDeps> = {}): ValidateBoundDeps {
  return {
    allowed: () => ({ kind: "invoke-role", role: "dba", story: "S1" }),
    reviseBudgetAvailable: () => true,
    recordRetry: () => ({ sanctioned: true }),
    ...over,
  };
}

describe("MockStepRouter: the contract's first implementation", () => {
  it("returns the scripted proposal for a completed action, keyed by its signature", () => {
    const completed: WorkflowAction = { kind: "invoke-role", role: "architect-reviewer", story: "S1" };
    const proposal: RouteProposal = { outcome: "produced", proposedNext: { kind: "invoke-role", role: "dba", story: "S1" } };
    const router: StepRouter = new MockStepRouter({ [sig(completed)]: proposal });
    expect(router.route(completed, { state: STATE, feature: "F1" })).toEqual(proposal);
  });

  it("throws for an unscripted completed action (the mock must be told every step)", () => {
    const router = new MockStepRouter({});
    expect(() => router.route({ kind: "invoke-role", role: "dba", story: "S1" }, { state: STATE, feature: "F1" })).toThrow(/no scripted proposal/i);
  });
});

describe("validateAndBound: step proposes, orchestrator validates + bounds", () => {
  const completed: WorkflowAction = { kind: "invoke-role", role: "architect-reviewer", story: "S1" };

  it("HONORS a proposal that matches the pure allowed transition", () => {
    const proposal: RouteProposal = { outcome: "produced", proposedNext: { kind: "invoke-role", role: "dba", story: "S1" } };
    const r = validateAndBound(proposal, completed, STATE, deps());
    expect(r.action).toEqual({ kind: "invoke-role", role: "dba", story: "S1" });
    expect(r.sanctionedRetry).toBe(false);
    expect(r.note).toBeUndefined();
  });

  it("FALLS BACK to the pure transition when the proposal is off the allowed graph", () => {
    // Step proposes jumping straight to merge; the allowlist says dba is next.
    const proposal: RouteProposal = { outcome: "produced", proposedNext: { kind: "merge" } };
    const r = validateAndBound(proposal, completed, STATE, deps());
    expect(r.action).toEqual({ kind: "invoke-role", role: "dba", story: "S1" }); // the allowed action, not merge
    expect(r.note).toMatch(/mismatch|fell back|not allowed/i);
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
    const proposal: RouteProposal = {
      outcome: "escalate",
      proposedNext: { kind: "invoke-role", role: "dba", story: "S1" }, // ignored for escalate
      reason: "cannot proceed",
    };
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
