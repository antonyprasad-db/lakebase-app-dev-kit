// ManifestStep: the GENERIC StepContract, driven entirely by a step manifest (DATA) + the
// validator registry (CODE) + an injected agent. This is the NORM , a step is one JSON
// manifest + (only if a new output type appears) one registered validator fn. A bespoke
// StepContract class is the escape hatch, for a step whose run() logic is genuinely custom.
//
// Containment is unchanged from SpecAuthorBreakdownStep: the ORCHESTRATOR owns .sftdd,
// resolves + PROVIDES the input contents + the workspace, and VALIDATES + persists the
// produced output. This step is dumb: it declares its logical inputs/outputs (from the
// manifest), forwards the provided instructions to its injected agent pointed at the
// provided workspace, and reports what appeared THERE. Neither it nor its agent resolves
// .sftdd or reaches outside what it was handed.
//
//   inputs()  -> manifest.inputs (logical ids; the orchestrator resolves + provides).
//   outputs() -> manifest.outputs, each with check = resolveValidator(name).
//   conformanceValidators() -> the same validators, with a docstring, exposed to the agent.
//   route()   -> manifest.routing[outcome] (a produced proposal by default).
//   run()     -> verify provided inputs (fail loud), invoke the agent contained to the
//                workspace, report the produced path(s) at the declared output locations.

import { join } from "node:path";
import { existsSync } from "node:fs";
import { resolveValidator } from "../validators/conformance/validator-registry.js";
import type { WorkflowAction } from "../../../scripts/sftdd/orchestrator-drive.js";
import type { StepManifest } from "./step-manifest.js";
import type {
  StepContract,
  StepInputSpec,
  StepOutputSpec,
  RouteProposal,
  StepRouteContext,
  StepOutcome,
  ConformanceValidator,
} from "../contract/step-contract.js";
import type { StepAgent } from "../agents/spec-author-breakdown-step-types.js";
import type { ProvidedStepRun, ProvidedStepResult, ExistsFn } from "../steps/spec-author-breakdown-step.js";

/** Which output id is the PRIMARY artifact (the one that must be present for produced:true).
 *  Convention: the first declared output. */
function primaryOutputId(manifest: StepManifest): string | undefined {
  return manifest.outputs[0]?.id;
}

export class ManifestStep implements StepContract {
  private readonly exists: ExistsFn;

  constructor(
    private readonly manifest: StepManifest,
    private readonly agent: StepAgent,
    exists?: ExistsFn,
  ) {
    this.exists = exists ?? existsSync;
  }

  /** WHAT this step needs (logical), from the manifest. The orchestrator resolves these. */
  inputs(_action: WorkflowAction): StepInputSpec[] {
    return this.manifest.inputs.map((i) => ({
      id: i.id,
      description: i.description ?? `${i.id} (from ${i.source})`,
    }));
  }

  /** WHAT this step produces (logical), from the manifest. Each output's in-code validator is
   *  resolved from the registry by NAME (an unknown name throws loud). */
  outputs(_action: WorkflowAction): StepOutputSpec[] {
    return this.manifest.outputs.map((o) => ({
      id: o.id,
      description: o.description ?? o.id,
      filename: o.filename,
      validate: resolveValidator(o.validator),
    }));
  }

  /** The conformance validators EXPOSED TO THE AGENT, so it self-checks its draft in-turn.
   *  Same deterministic fn the orchestrator runs; the docstring names the output + validator. */
  conformanceValidators(_action: WorkflowAction): ConformanceValidator[] {
    return this.manifest.outputs.map((o) => ({
      outputId: o.id,
      docstring:
        `check ${o.filename} (validator "${o.validator}"): ${o.description ?? o.id}. ` +
        `Returns {ok, violations[]}. Run it on your written ${o.filename} and fix every ` +
        `violation before returning , no orchestrator round-trip.`,
      fn: resolveValidator(o.validator),
    }));
  }

  /**
   * Run the step within the PROVIDED workspace , identical contract to SpecAuthorBreakdownStep:
   * verify every declared input was provided (fail loud, name the missing one, no agent call),
   * invoke the injected agent contained to the workspace, report the produced artifact path(s)
   * found at the orchestrator-declared output locations (fall back to the bare filename).
   */
  async run(provided: ProvidedStepRun): Promise<ProvidedStepResult> {
    const { action, workspaceDir, inputs, instructions } = provided;

    for (const spec of this.inputs(action)) {
      if (!(spec.id in inputs)) {
        return { produced: false, missingInput: spec.id };
      }
    }

    await this.agent.invoke({ action, workspaceDir, inputs, instructions });

    const primary = primaryOutputId(this.manifest);
    const producedPaths: string[] = [];
    let primaryPresent = false;
    for (const spec of this.outputs(action)) {
      const rel = provided.outputPaths?.[spec.id] ?? spec.filename;
      const p = join(workspaceDir, rel);
      if (this.exists(p)) {
        producedPaths.push(p);
        if (spec.id === primary) primaryPresent = true;
      }
    }
    if (!primaryPresent) {
      return { produced: false, producedPaths: producedPaths.length ? producedPaths : undefined };
    }
    return { produced: true, producedPaths };
  }

  /**
   * Routing: read the manifest routing map. Default outcome is `produced` with the mapped
   * `next`. The sentinel string "state-derived" for `next` leaves proposedNext as a
   * state-derived marker the orchestrator's validateAndBound resolves to the pure transition.
   * The orchestrator always reconciles the proposal , the step only reports its intent.
   */
  route(_completed: WorkflowAction, _ctx: StepRouteContext): RouteProposal {
    const outcome: StepOutcome = "produced";
    const target = this.manifest.routing.produced;
    const next = target?.next;
    if (next && next !== "state-derived") {
      return { outcome, proposedNext: next as WorkflowAction };
    }
    // Defer to the pure transition: a state-derived sentinel validateAndBound resolves to
    // the allowed action (its `produced` branch falls back to deps.allowed on mismatch).
    return { outcome, proposedNext: { kind: "state-derived" } as unknown as WorkflowAction };
  }
}
