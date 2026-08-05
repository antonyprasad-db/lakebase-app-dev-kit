// step-contract: the ONE step interface every role/step implements.
//
// A step is producers→consumers, inputs→outputs. This module defines the single
// contract that carries all three faces of a step together, so each step can be
// invoked and unit-tested in isolation:
//   - inputs(action)  : the INPUT contract  , what must exist on disk before it runs.
//   - outputs(action) : the OUTPUT expectation , what artifact it must produce.
//   - route(completed): the ROUTING proposal , where it proposes to go next on
//                       completion of its agent call.
//
// The orchestrator does NOT blindly follow the routing proposal: `validateAndBound`
// VALIDATES it against the pure allowed transition and BOUNDS re-routes/retries with the
// EXISTING limits (revise budget, ExpectationLedger retry, escalation) before honoring
// it, falling back to state-derivation when the proposal is off the allowed graph.
//
// This slice is the CONTRACT + a MOCK implementation + `validateAndBound`. No real role
// implements StepContract yet; `runDriver` consumes the routing face behind an optional
// seam so the default (no-contract) path is byte-identical to today. Real roles implement
// StepContract in a later slice; the input/output faces (inputs/outputs) are declared here
// so the per-step isolated runner + `--step` CLI can consume them next.

import type { DriveState, WorkflowAction } from "../workflow/workflow-vocabulary.js";

/**
 * A step's INPUT contract, declared as LOGICAL descriptors , NOT filesystem paths. The
 * step is dumb + contained: it knows it needs "the PO's product overview", not WHERE that
 * lives. The ORCHESTRATOR (which owns .sftdd) reads the descriptor, resolves it to the
 * real artifact, and PROVIDES its contents to the step. `id` is the key the provided
 * contents are handed back under.
 */
export interface StepInputSpec {
  /** Stable logical id (e.g. "product-overview", "nfrs", "feature-request"). */
  id: string;
  /** Human description of what the step needs (for the orchestrator + diagnostics). */
  description: string;
}

/**
 * A step's PRE-CONDITION contract, declared as LOGICAL descriptors , the deterministic
 * CONTEXT a turn must be PRE-CONDITIONED with before dispatch (the pre-extracted design
 * rubric + module layout; the green-failure advisory). Distinct from `inputs`: an input's
 * CONTENTS are resolved + handed back under its id; a precondition names a PREPARER the
 * orchestrator runs to PROJECT a text block from on-disk `.sftdd` (never authored, cannot
 * drift), which the build-instructions phase appends to the prompt. The step is dumb + con-
 * tained: it declares "I need the context-pack", never HOW it is prepared (that is the
 * orchestrator's `PREPARE-PRECONDITIONS` phase + preparer registry). See
 * `consort/orchestrator/build/PRE-CONDITIONING-AS-CONTRACT.md`.
 */
export interface StepPrecondition {
  /** Stable id the prepared block is keyed under (e.g. "context-pack", "green-failure-advisory"). */
  id: string;
  /** Which preparer to run , the orchestrator maps this kind to a registered pure projection. */
  kind: "context-pack" | "green-failure-advisory" | string;
  /** Human description (diagnostics + the empty-preparer warning). */
  description: string;
  /** Preparer-specific knobs the registered preparer reads (e.g. context-pack's skipTestLoop). */
  options?: Record<string, unknown>;
}

/**
 * A conformance validator EXPOSED TO THE AGENT as a callable it can invoke on its own draft
 * output before returning , so a fixable defect is caught IN-TURN instead of round-tripping
 * back to the agent with follow-up instructions. The `docstring` tells the agent what the
 * function checks + how to call it; the prompt adds any further instruction. `fn` is the
 * same deterministic in-code check the orchestrator also runs on the produced artifact.
 */
export interface ConformanceValidator {
  /** The output id this validator validates (matches a StepOutputSpec.id). */
  outputId: string;
  /** What the validator verifies + how to call it , handed to the agent verbatim. */
  docstring: string;
  /** The deterministic check (given the artifact's path in the workspace). */
  fn: OutputValidator;
}

/** The result of an in-code output conformance check , deterministic, no agent round-trip. */
export interface OutputValidationResult {
  ok: boolean;
  /** Specific, actionable violations when !ok (empty when ok). */
  violations: string[];
}

/**
 * An IN-CODE conformance validator for one produced output. Given the produced artifact's
 * absolute path (in the provided workspace), it deterministically validates the artifact
 * against the output's contract and returns pass/fail + specific violations. This is what
 * lets the orchestrator ACCEPT or REJECT an output without going back to the agent for a
 * follow-up , every expected output ships its validator.
 */
export type OutputValidator = (producedPath: string) => OutputValidationResult;

/**
 * A step's OUTPUT declaration, also LOGICAL. The step produces "the feature breakdown
 * index" into its provided workspace; the ORCHESTRATOR maps that id to a .sftdd path,
 * runs the output's `check` (in-code conformance), and PERSISTS it on pass. The step
 * never resolves .sftdd or validates , the validator is code the orchestrator runs.
 */
export interface StepOutputSpec {
  /** Stable logical id (e.g. "feature-spec"). */
  id: string;
  /** Human description of the produced artifact. */
  description: string;
  /** The artifact's filename WITHIN the provided workspace (what the agent writes). */
  filename: string;
  /** WHICH channel this output lands in (absent = the primary workspace root, byte-identical):
   *  `product` = the application deliverable (app/tests/migrations) resolved under the code tree
   *  (MUST be uncontained , it accumulates + ships); `artifact` = the .sftdd design documents,
   *  resolved under artifactDir when provisioned (else the workspace , MAY be contained); `meta`
   *  = orchestration bookkeeping resolved under the contained metaDir when provisioned. */
  channel?: "product" | "artifact" | "meta";
  /** In-code conformance validator for this output. The orchestrator runs it on the
   *  produced artifact; a failure is a hard reject with named violations, NOT an
   *  agent follow-up. Every expected output declares one. */
  validate: OutputValidator;
}

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

/** Read-only view a step's routing sees: the state it produced + the feature scope. */
export interface StepRouteContext {
  state: DriveState;
  feature: string;
}

/**
 * The ONE contract EVERY role/step implements. Carries the step's three faces so it can
 * be invoked and unit-tested in isolation:
 *   - inputs(action):  the input contract (what must exist before it runs).
 *   - outputs(action): the output expectation (what it must produce; null when the step
 *                      produces no static artifact , e.g. a build turn verified by cycle
 *                      records, or a critic gate).
 *   - route(completed, ctx): the routing proposal emitted on completion.
 * The first implementation is `MockStepContract` (below); real roles implement this next.
 */
export interface StepContract {
  /** The logical inputs this step needs. The orchestrator resolves + provides them. */
  inputs(action: WorkflowAction): StepInputSpec[];
  /** The logical PRE-CONDITIONS this step needs prepared before dispatch. The orchestrator
   *  PREPARES each (via the preparer registry) in the PREPARE-PRECONDITIONS phase and appends
   *  the projected blocks to the step's instructions. Absent/empty = an affirmative "nothing". */
  preconditions(action: WorkflowAction): StepPrecondition[];
  /** The logical output(s) this step produces. The orchestrator maps + validates them. */
  outputs(action: WorkflowAction): StepOutputSpec[];
  route(completed: WorkflowAction, ctx: StepRouteContext): RouteProposal;
}

const signature = (a: WorkflowAction): string => JSON.stringify(a);

/**
 * The contract's first implementation: a scripted contract keyed by action signature.
 * Tests (and the mock-only wiring slice) drive exact inputs/outputs/proposals with no
 * cloud/model/roles. Missing input contract defaults to `{requires:[]}`; missing output
 * defaults to `null`; a missing routing proposal THROWS , the mock must be told every
 * step it is asked to route, so a missing case is a loud test failure, not a silent
 * default.
 */
export class MockStepContract implements StepContract {
  constructor(
    private readonly script: {
      inputs?: Record<string, StepInputSpec[]>;
      preconditions?: Record<string, StepPrecondition[]>;
      outputs?: Record<string, StepOutputSpec[]>;
      route?: Record<string, RouteProposal>;
    },
  ) {}

  inputs(action: WorkflowAction): StepInputSpec[] {
    return this.script.inputs?.[signature(action)] ?? [];
  }

  preconditions(action: WorkflowAction): StepPrecondition[] {
    return this.script.preconditions?.[signature(action)] ?? [];
  }

  outputs(action: WorkflowAction): StepOutputSpec[] {
    return this.script.outputs?.[signature(action)] ?? [];
  }

  route(completed: WorkflowAction, _ctx: StepRouteContext): RouteProposal {
    const p = this.script.route?.[signature(completed)];
    if (!p) {
      throw new Error(`MockStepContract: no scripted proposal for completed action ${signature(completed)}`);
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
 * The orchestrator's authority over a step's routing proposal: step PROPOSES,
 * orchestrator VALIDATES + BOUNDS. Never lets a step drive the machine off the allowed
 * graph.
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
