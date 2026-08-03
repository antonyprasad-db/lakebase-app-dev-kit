// step-router: the ONE routing contract for the orchestrator.
//
// Today routing is 100% STATE-DERIVED: after a step runs, the orchestrator re-reads
// disk and `nextTransition(state)` derives the next action. This module adds the
// inverse, unified path the whole kit will move to: each STEP, on completion of its
// agent call, EMITS a `RouteProposal` (where it thinks the orchestrator should go).
// The orchestrator does NOT blindly follow it , `validateAndBound` VALIDATES the
// proposal against the pure allowed transition and BOUNDS re-routes/retries with the
// EXISTING limits (revise budget, ExpectationLedger retry, escalation) before honoring
// it, falling back to state-derivation when the proposal is off the allowed graph.
//
// This slice is the CONTRACT + a MOCK implementation + `validateAndBound` only. No real
// role emits a proposal yet; `runDriver` consumes this behind an optional seam so the
// default (no-router) path is byte-identical to today. Real roles implement `StepRouter`
// in a later slice; until then the pure transition is both the validator and the default.

import type { DriveState, WorkflowAction } from "./orchestrator-drive.js";

/** What a step reports about its own completion , the routing intent, not the action. */
export type StepOutcome =
  /** The step produced its artifact; proceed to the proposed next step. */
  | "produced"
  /** The step could not produce (missing input / unmet contract); wants to be retried. */
  | "blocked"
  /** The step found a spec-level defect that should route back to an owning author. */
  | "revise"
  /** The step hit something it cannot resolve; wants a human. */
  | "escalate";

/**
 * A step's emitted routing proposal. `proposedNext` is where the STEP thinks the
 * orchestrator should go , advisory. `reason` is required for anything but a clean
 * `produced` (it becomes the revise/escalate/handback message).
 */
export interface RouteProposal {
  outcome: StepOutcome;
  proposedNext: WorkflowAction;
  reason?: string;
}

/** Read-only view a router sees: the state the step produced + the feature scope. */
export interface StepRouteContext {
  state: DriveState;
  feature: string;
}

/**
 * The contract EVERY role/step implements. `route` is called AFTER the step's agent
 * call completes, with the completed action + the resulting state, and returns where
 * the step proposes to go next. The first implementation is `MockStepRouter` (below);
 * real roles implement this in a later slice.
 */
export interface StepRouter {
  route(completed: WorkflowAction, ctx: StepRouteContext): RouteProposal;
}

const signature = (a: WorkflowAction): string => JSON.stringify(a);

/**
 * The contract's first implementation: a scripted router keyed by the completed
 * action's signature. Tests (and the mock-only wiring slice) drive exact proposals
 * with no cloud/model/roles. A completed action with no scripted proposal throws , the
 * mock must be told every step, so a missing case is a loud test failure, not a silent
 * default.
 */
export class MockStepRouter implements StepRouter {
  constructor(private readonly script: Record<string, RouteProposal>) {}

  route(completed: WorkflowAction, _ctx: StepRouteContext): RouteProposal {
    const p = this.script[signature(completed)];
    if (!p) {
      throw new Error(`MockStepRouter: no scripted proposal for completed action ${signature(completed)}`);
    }
    return p;
  }
}

/**
 * The bounds `validateAndBound` reuses , injected so the policy is unit-tested without
 * touching disk. In the real wiring these are backed by the existing machinery:
 *  - `allowed`: the pure `nextTransition(state)` (the allowlist + fallback).
 *  - `reviseBudgetAvailable`: the existing revise-budget check (priorReviseCount /
 *    REFLECT_REVISE_CAP) for the proposed revise-route.
 *  - `recordRetry`: the ExpectationLedger's one-retry bound; returns {sanctioned:true}
 *    for the allowed retry and THROWS (ProtocolViolationError) once exhausted.
 */
export interface ValidateBoundDeps {
  allowed(state: DriveState): WorkflowAction;
  reviseBudgetAvailable(proposal: RouteProposal, state: DriveState): boolean;
  recordRetry(completed: WorkflowAction, state: DriveState): { sanctioned: boolean };
}

/** The single decision `validateAndBound` returns for the loop to act on. */
export interface BoundedRoute {
  /** The action the orchestrator will actually take this iteration. */
  action: WorkflowAction;
  /** True when this is a sanctioned re-issue of the same step (so it is NOT a stall). */
  sanctionedRetry: boolean;
  /** Set when the proposal was NOT honored as-is (mismatch fallback, budget conversion). */
  note?: string;
}

const raiseToHil = (reason: string, source: string, story?: string): WorkflowAction => ({
  kind: "raise-to-hil",
  reason,
  source,
  ...(story ? { story } : {}),
});

/**
 * The orchestrator's authority over a step's proposal: step PROPOSES, orchestrator
 * VALIDATES + BOUNDS. Never lets a step drive the machine off the allowed graph.
 *   - produced: honor `proposedNext` iff it equals the pure allowed transition; else
 *     FALL BACK to the allowed action (recorded mismatch , the step cannot invent a move).
 *   - revise: honor the revise-route iff the revise budget has room; else convert to
 *     raise-to-hil (budget exhausted , a human decides).
 *   - blocked: a sanctioned retry of the same step while the retry ledger allows it;
 *     `recordRetry` throws (ProtocolViolationError) once exhausted.
 *   - escalate: straight to raise-to-hil.
 */
export function validateAndBound(
  proposal: RouteProposal,
  completed: WorkflowAction,
  state: DriveState,
  deps: ValidateBoundDeps,
): BoundedRoute {
  switch (proposal.outcome) {
    case "escalate":
      return {
        action: raiseToHil(proposal.reason ?? "step requested escalation", stepSource(completed), storyOf(completed)),
        sanctionedRetry: false,
      };

    case "revise": {
      if (proposal.proposedNext.kind !== "revise-route") {
        // A revise outcome must carry a revise-route; anything else is a malformed
        // proposal , fall back to the allowed transition rather than trust it.
        const allowed = deps.allowed(state);
        return { action: allowed, sanctionedRetry: false, note: "revise proposal was not a revise-route; fell back to allowed transition" };
      }
      if (deps.reviseBudgetAvailable(proposal, state)) {
        return { action: proposal.proposedNext, sanctionedRetry: false };
      }
      return {
        action: raiseToHil(
          proposal.reason ?? "revise budget exhausted",
          stepSource(completed),
          storyOf(proposal.proposedNext),
        ),
        sanctionedRetry: false,
        note: "revise budget exhausted; converted to raise-to-hil",
      };
    }

    case "blocked": {
      // The step wants to be retried. Defer to the retry ledger for the bound; it
      // throws once the retry budget is exhausted (ProtocolViolationError). A
      // sanctioned retry re-issues the SAME action and is flagged so the loop's stall
      // check skips it.
      const { sanctioned } = deps.recordRetry(completed, state);
      return { action: completed, sanctionedRetry: sanctioned };
    }

    case "produced":
    default: {
      const allowed = deps.allowed(state);
      if (signature(proposal.proposedNext) === signature(allowed)) {
        return { action: proposal.proposedNext, sanctionedRetry: false };
      }
      return {
        action: allowed,
        sanctionedRetry: false,
        note: `proposal ${signature(proposal.proposedNext)} not the allowed transition; fell back to ${signature(allowed)}`,
      };
    }
  }
}

/** Best-effort source label for an escalation, from the completed action. */
function stepSource(completed: WorkflowAction): string {
  if (completed.kind === "invoke-role") return `step:${completed.role}`;
  return `step:${completed.kind}`;
}

/** Pull a story id off an action when it carries one (for escalation scoping). */
function storyOf(a: WorkflowAction): string | undefined {
  return "story" in a && typeof a.story === "string" ? a.story : undefined;
}
