// SpecAuthorBreakdownStep: the FIRST concrete StepContract , dumb + CONTAINED.
//
// Containment boundary (the load-bearing rule): the ORCHESTRATOR owns .sftdd. It knows
// what this concrete step needs (via inputs()), READS those artifacts from .sftdd,
// PROVISIONS a workspace, and hands the step the input CONTENTS + the workspace dir. The
// step is dumb: it declares its logical inputs/outputs, forwards the provided instructions
// to its injected agent, and points the agent at the PROVIDED workspace. Neither the step
// NOR its agent resolves .sftdd, reads global paths, or reaches outside what it was given.
// The orchestrator VALIDATES + PERSISTS the produced output back to .sftdd , not the step.
//
//   inputs()  -> logical input specs (product-overview, nfrs, feature-request). WHAT it
//                needs, not WHERE , the orchestrator resolves + provides.
//   outputs() -> logical output specs (feature-spec, with the filename to produce in the
//                provided workspace).
//   run()     -> given the provided workspace + input contents + instructions, invoke the
//                agent within the workspace and return the produced artifact path(s) it
//                finds THERE. No .sftdd, no conformance check (the orchestrator does that).
//   route()   -> emits the routing proposal.

import { featureSpecNonEmptyStories, agentLogHasRoleEvent } from "../validators/conformance/validator-registry.js";
import type { WorkflowAction } from "../../../scripts/sftdd/orchestrator-drive.js";
import type { StepContract, StepInputSpec, StepOutputSpec, RouteProposal, StepRouteContext, ConformanceValidator } from "../contract/step-contract.js";
import type { StepInstructions } from "../agents/spec-author-breakdown-step-types.js";

// The two breakdown validators now live in the shared validator-registry (one source of truth,
// referenced by name from step manifests). Keep the original local names as thin aliases so
// this file's remaining references + any importer reading them here keep working.
const checkFeatureSpecOutput = featureSpecNonEmptyStories;
const checkAgentLogOutput = agentLogHasRoleEvent;

// Re-export the shared step-run types so existing importers keep working.
export type { StepInstructions, StepAgent, AgentInvocation } from "../agents/spec-author-breakdown-step-types.js";
import type { StepAgent } from "../agents/spec-author-breakdown-step-types.js";

/** The logical inputs the breakdown step needs , the 3 PO artifacts, by id. */
const BREAKDOWN_INPUTS: StepInputSpec[] = [
  { id: "product-overview", description: "The PO's product overview (product-overview.md)." },
  { id: "nfrs", description: "The PO's non-functional requirements brief (nfrs.md)." },
  { id: "feature-request", description: "The PO's feature request for this feature (feature-request.md)." },
];

/**
 * The logical outputs the breakdown step produces:
 *  - feature-spec: the breakdown index written into the provided workspace.
 *  - agent-log: the agent MUST log what it did + surface any issue (a smell/ambiguity as
 *    a `warn`, a refusal as an `error`) via the SHARED agent-log script every role uses
 *    (`lakebase-sftdd-log`), appended to the workspace's agent-log.jsonl. This is a
 *    REQUIRED, conformance-checked output , the orchestrator validates the log line
 *    against agent-log-event.schema.json, exactly as for any other artifact.
 */
const BREAKDOWN_OUTPUTS: StepOutputSpec[] = [
  {
    id: "feature-spec",
    description: "The feature breakdown index (feature-spec.json + a story stub per story).",
    filename: "feature-spec.json",
    validate: checkFeatureSpecOutput,
  },
  {
    id: "agent-log",
    description: "The agent's structured log of what it did + any issue surfaced (shared agent-log script; agent-log-event.schema.json).",
    filename: "agent-log.jsonl",
    validate: checkAgentLogOutput,
  },
];

/**
 * What the orchestrator PROVIDES to run this step , everything the step is allowed to
 * touch. The step reaches outside NONE of this.
 */
export interface ProvidedStepRun {
  action: WorkflowAction;
  /** The directory the step + its agent may read/write within. Provisioned by the
   *  orchestrator (a copy of the feature's design tree, or a sandbox); the agent writes
   *  its output artifact HERE, never into .sftdd directly. */
  workspaceDir: string;
  /** The resolved input CONTENTS, keyed by StepInputSpec.id. The orchestrator read these
   *  from .sftdd (interactive or filesystem) and hands them over; the step never fetches. */
  inputs: Record<string, string>;
  /** The instruction bundle (prompt + guidelines) the orchestrator sourced + passes
   *  through to the agent. */
  instructions: StepInstructions;
  /** WHERE (workspace-relative) each declared output lands, keyed by StepOutputSpec.id.
   *  The ORCHESTRATOR declares this because it knows the step's on-disk layout (the
   *  spec-author agent writes into `.sftdd/features/<F>/`, cwd-relative). Absent id ->
   *  the step falls back to the spec's bare `filename` at the workspace root. This is why
   *  the step stays dumb: it does not know the feature id or the .sftdd shape, the
   *  orchestrator tells it exactly where the produced artifact will be. */
  outputPaths?: Record<string, string>;
}

/** The contained result the step returns to the orchestrator (no validation verdict). */
export interface ProvidedStepResult {
  /** True iff every declared input was provided AND the agent produced its output file
   *  in the workspace. NOT a conformance verdict , the orchestrator validates that. */
  produced: boolean;
  /** Missing provided-input id (when !produced because an input was not supplied). */
  missingInput?: string;
  /** Absolute path(s) to the produced artifact WITHIN the provided workspace, for the
   *  orchestrator to validate + persist to .sftdd. */
  producedPaths?: string[];
}

/** Existence check seam (over the provided workspace only); defaults to fs.existsSync. */
export type ExistsFn = (path: string) => boolean;

/**
 * The spec-author breakdown step. Constructed with ONLY the injected agent (+ an optional
 * existence check). It holds no .sftdd knowledge, no feature id, no paths , everything it
 * operates on is PROVIDED per run. This is what "the StepContract is dumb + contained"
 * means concretely: given a workspace + input contents + instructions, it runs its agent
 * and reports what appeared in the workspace.
 */
export class SpecAuthorBreakdownStep implements StepContract {
  private readonly exists: ExistsFn;

  constructor(
    private readonly agent: StepAgent,
    exists?: ExistsFn,
  ) {
    this.exists = exists ?? ((p: string) => require("fs").existsSync(p));
  }

  /** WHAT this step needs (logical). The orchestrator resolves these from .sftdd. */
  inputs(_action: WorkflowAction): StepInputSpec[] {
    return BREAKDOWN_INPUTS;
  }

  /** WHAT this step produces (logical): the breakdown index + the required agent log.
   *  The orchestrator maps + validates + persists them. */
  outputs(_action: WorkflowAction): StepOutputSpec[] {
    return BREAKDOWN_OUTPUTS;
  }

  /**
   * The conformance validators EXPOSED TO THE AGENT , part of the step's definition. Each
   * carries a docstring telling the agent what it checks + how to call it, so the agent can
   * self-check its draft IN-TURN (catching a fixable defect before returning, no
   * orchestrator round-trip). Same deterministic `fn` the orchestrator runs on the
   * produced artifact. The prompt adds any further instruction on when to call them.
   */
  conformanceValidators(_action: WorkflowAction): ConformanceValidator[] {
    return [
      {
        outputId: "feature-spec",
        docstring:
          "checkFeatureSpec(path): the feature-spec.json at `path` must parse, conform to " +
          "feature.schema.json, and carry a NON-EMPTY stories[]. Returns {ok, violations[]}. " +
          "Run it on your written feature-spec.json and fix every violation before returning.",
        fn: checkFeatureSpecOutput,
      },
      {
        outputId: "agent-log",
        docstring:
          "checkAgentLog(path): the agent-log.jsonl at `path` must have >=1 line, each a JSON " +
          "object conforming to agent-log-event.schema.json, including >=1 spec-author event " +
          "recording what you did. Returns {ok, violations[]}. Log via the shared agent-log " +
          "script, then this passes.",
        fn: checkAgentLogOutput,
      },
    ];
  }

  /**
   * Run the step within the PROVIDED workspace. Verify every declared input was supplied
   * (fail loud, naming the missing one, WITHOUT invoking the agent), invoke the injected
   * agent pointed at the workspace with the provided instructions + input contents, then
   * report the produced artifact path(s) found in the workspace. The step does NOT
   * validate conformance and does NOT touch .sftdd , that is the orchestrator's job.
   */
  async run(provided: ProvidedStepRun): Promise<ProvidedStepResult> {
    const { action, workspaceDir, inputs, instructions } = provided;
    const join = require("node:path").join as (...p: string[]) => string;

    // (a) INPUT contract , every declared logical input must have been PROVIDED. The step
    //     checks what it was HANDED (the inputs map), not .sftdd.
    for (const spec of this.inputs(action)) {
      if (!(spec.id in inputs)) {
        return { produced: false, missingInput: spec.id };
      }
    }

    // (b) invoke the injected agent, CONTAINED to the provided workspace + inputs +
    //     instructions. The agent writes its output artifact into workspaceDir.
    await this.agent.invoke({ action, workspaceDir, inputs, instructions });

    // (c) report what the agent produced IN THE WORKSPACE (path only, no conformance
    //     judgment). The orchestrator reads + validates + persists it to .sftdd. The
    //     PRIMARY output (feature-spec) must be present; the agent-log is validated by
    //     the orchestrator via its conformance validator too.
    const producedPaths: string[] = [];
    let primaryPresent = false;
    for (const spec of this.outputs(action)) {
      // The orchestrator declares WHERE each output lands (workspace-relative); fall back
      // to the bare filename at the workspace root when it does not. The step never
      // computes a .sftdd path itself , it uses what it was told.
      const rel = provided.outputPaths?.[spec.id] ?? spec.filename;
      const p = join(workspaceDir, rel);
      if (this.exists(p)) {
        producedPaths.push(p);
        if (spec.id === "feature-spec") primaryPresent = true;
      }
    }
    if (!primaryPresent) {
      return { produced: false, producedPaths: producedPaths.length ? producedPaths : undefined };
    }
    return { produced: true, producedPaths };
  }

  /**
   * Routing: on completion, propose where to go next. Proposes `produced` (the breakdown
   * is done). The orchestrator's validateAndBound reconciles this with the pure allowed
   * transition , the step reports its outcome, it does not decide the concrete next move.
   */
  route(_completed: WorkflowAction, _ctx: StepRouteContext): RouteProposal {
    return { outcome: "produced", proposedNext: { kind: "design-complete" } };
  }
}
