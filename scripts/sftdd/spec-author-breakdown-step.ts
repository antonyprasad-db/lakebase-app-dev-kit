// SpecAuthorBreakdownStep: the FIRST concrete StepContract implementation.
//
// The spec-author breakdown step, as a self-contained, isolated, unit-testable unit:
//   INPUT contract  (inputs)  : the 3 PO artifacts , product-overview.md, nfrs.md,
//                               features/<F>/feature-request.md (the PO's inputs).
//   OUTPUT expectation (outputs): features/<F>/feature-spec.json (the breakdown index).
//   the AGENT (injected)      : inside the step, an agent is invoked with a passed-through
//                               instruction bundle (prompt + guidelines). The step does
//                               NOT source those instructions , the ORCHESTRATOR resolves
//                               them (interactive, or from the filesystem) and hands them
//                               to the step, which passes them straight to the agent.
//   ROUTING (route)           : on completion, emits where it proposes to go next.
//
// run(): verify inputs exist (fail loud, no agent call) -> invoke the agent with the
// orchestrator-supplied instructions -> validate the output with the SAME self-check the
// drive uses (formatRoleResponse). Because the agent is injected, the whole step is
// unit-tested with no cloud/model: a fake agent writes the fixture output and the real
// output validation runs against it.

import { formatRoleResponse } from "./response-formatter.js";
import { productOverviewMd, nfrsMd, featureRequestMd, featureSpecJson } from "./sftdd-paths.js";
import type { WorkflowAction } from "./orchestrator-drive.js";
import type { StepContract, StepInputs, StepOutputs, RouteProposal, StepRouteContext } from "./step-contract.js";

/**
 * The instruction bundle the orchestrator passes THROUGH to the step's agent: the
 * prompt (the task text) plus any guidelines / instructions. The orchestrator sources
 * these , from an interactive process or the filesystem , and the step forwards them
 * verbatim. The step never invents them.
 */
export interface StepInstructions {
  prompt: string;
  guidelines?: string[];
}

/** One invocation of a step's agent: the pinned action + the passed-through instructions. */
export interface AgentInvocation {
  action: WorkflowAction;
  sftddDir: string;
  featureId: string;
  instructions: StepInstructions;
}

/**
 * The agent seam a step invokes. INJECTED into the step so the step is unit-tested with
 * no cloud/model. The real implementation spawns `claude -p --agent spec-author ...`
 * (drive-runner's execRunner); a test double writes fixture artifacts. The agent's job
 * is to produce the step's output artifacts on disk from the instructions it is handed.
 */
export interface StepAgent {
  invoke(invocation: AgentInvocation): Promise<void>;
}

/** The scope a step is constructed for: the project's .sftdd dir + the feature it runs
 *  against. Fixing scope at construction lets inputs()/outputs() return CONCRETE paths
 *  (the StepContract signature takes only the action), so a step is a fully self-
 *  describing unit: given its scope it knows its exact input + output artifact paths. */
export interface StepScope {
  sftddDir: string;
  featureId: string;
}

/** The arguments to run one step in isolation. `instructions` are orchestrator-supplied. */
export interface StepRunArgs {
  action: WorkflowAction;
  instructions: StepInstructions;
}

/** The structured result of running a step in isolation. */
export interface StepRunResult {
  ok: boolean;
  /** Which stage failed (when !ok): the input contract, or the output validation. */
  stage?: "input" | "output";
  /** The missing input path (stage === "input"). */
  missing?: string;
  /** The output-validation reason (stage === "output"). */
  reason?: string;
  /** The produced output descriptor (when ok). */
  output?: StepOutputs;
}

/** Existence check seam , overridable in tests; defaults to fs.existsSync. */
export type ExistsFn = (path: string) => boolean;

/**
 * The spec-author breakdown step. Constructed with the agent it invokes (injected) and
 * an optional existence check (defaults to fs). Implements the ONE StepContract so it is
 * addressable + runnable + unit-testable in isolation, and consumable by the orchestrator
 * through the same interface every other step will use.
 */
export class SpecAuthorBreakdownStep implements StepContract {
  private readonly exists: ExistsFn;

  constructor(
    private readonly agent: StepAgent,
    private readonly scope: StepScope,
    exists?: ExistsFn,
  ) {
    // Lazy require so the module stays pure/importable without node fs in a browser-y
    // context; tests inject their own or rely on this default.
    this.exists = exists ?? ((p: string) => require("fs").existsSync(p));
  }

  /** INPUT contract: the 3 PO artifacts the breakdown reads (concrete, over its scope). */
  inputs(_action: WorkflowAction): StepInputs {
    const { sftddDir, featureId } = this.scope;
    return { requires: [productOverviewMd(sftddDir), nfrsMd(sftddDir), featureRequestMd(sftddDir, featureId)] };
  }

  /** OUTPUT expectation: feature-spec.json (concrete, over its scope). */
  outputs(_action: WorkflowAction): StepOutputs {
    const { sftddDir, featureId } = this.scope;
    return { produces: [featureSpecJson(sftddDir, featureId)], label: "feature-spec.json" };
  }

  /**
   * Run the step in isolation: input contract -> agent (with the orchestrator's passed-
   * through instructions) -> output validation. Fails loud at the input stage (naming the
   * missing artifact) BEFORE invoking the agent, so a step never runs on absent inputs.
   */
  async run(args: StepRunArgs): Promise<StepRunResult> {
    const { action, instructions } = args;
    const { sftddDir, featureId } = this.scope;

    // (a) INPUT contract , every required PO artifact must exist. Fail loud, no agent call.
    for (const path of this.inputs(action).requires) {
      if (!this.exists(path)) {
        return { ok: false, stage: "input", missing: path };
      }
    }

    // (b) invoke the injected agent with the ORCHESTRATOR-SUPPLIED instruction bundle.
    //     The step forwards `instructions` verbatim; it never sources them itself.
    await this.agent.invoke({ action, sftddDir, featureId, instructions });

    // (c) OUTPUT validation , the SAME self-check the drive enforces (breakdown mode:
    //     no --story). Failure names the specific violation.
    const check = formatRoleResponse({ role: "spec-author", sftddDir, featureId });
    if (!check.ok) {
      return { ok: false, stage: "output", reason: check.violations.map((v) => `${v.artifact}: ${v.problem}`).join("; ") };
    }
    return { ok: true, output: this.outputs(action) };
  }

  /**
   * Routing: on completion, propose where to go next. This step proposes `produced` (the
   * breakdown is done, the design lane proceeds to the first story). The orchestrator
   * VALIDATES this against the pure transition + BOUNDS it (validateAndBound); the step
   * does not decide the concrete next action, it reports its outcome. `proposedNext` is
   * a best-effort hint the orchestrator reconciles with the allowed transition.
   */
  route(_completed: WorkflowAction, _ctx: StepRouteContext): RouteProposal {
    return {
      outcome: "produced",
      // The step's hint: the breakdown is complete; proceed into the design lane. The
      // orchestrator's validateAndBound resolves this to the actual allowed next action
      // (the first story's spec-author, or ux-designer on a UI track), so this need only
      // be a truthful "produced" signal , the allowlist decides the concrete move.
      proposedNext: { kind: "design-complete" },
    };
  }
}
