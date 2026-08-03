// StepExecutor: the ONE standard step-execution process , the Template Method the
// orchestrator (a state machine) runs for EVERY substep. Everything the orchestrator does
// per step is unified into this fixed, no-exception 7-phase sequence:
//
//   1. resolve-inputs      read each input's CONTENTS from .sftdd (via deps.resolveInputs).
//                          FAIL LOUD naming the missing logical id BEFORE any spawn.
//   2. provision-workspace create/point the contained workspaceDir (+ output locations).
//   3. dispatch-agent      invoke the step's injected agent, contained to the workspace
//                          (wait; the monitor/timeout envelope wires in at the spawn seam).
//   4. capture-outputs     the step reports the produced artifact path(s) it found.
//   5. validate-outputs    run each output's in-code checker; a failure is a HARD reject
//                          with named violations, NOT an agent follow-up.
//   6. record/log          emit the turn record (deps.onRecord) + any post-turn effects.
//   7. route               ask the step where it proposes to go, then reconcile through
//                          validateAndBound (the orchestrator's authority over routing).
//
// The phase ORDER, the fail-loud input gate, containment, and validateAndBound's authority
// are the orchestrator-owned INVARIANT , the StepContract/manifest/registry only fill the
// hooks. Phases 3+4 are the step's run(); 5+7 use the step's outputs()/route(); the rest is
// orchestrator-owned. Nothing here reaches outside what the deps provide.

import { validateAndBound } from "./step-contract.js";
import type { WorkflowAction, DriveState } from "./orchestrator-drive.js";
import type { DriveEffectsConfig } from "./orchestrator-effects.js";
import type { StepContract, BoundedRoute, ValidateBoundDeps, RouteProposal } from "./step-contract.js";
import type { StepInstructions } from "./spec-author-breakdown-step-types.js";
import type { ProvidedStepRun, ProvidedStepResult } from "./spec-author-breakdown-step.js";

/** A step the executor can run: the routing/IO contract PLUS the contained run() body that
 *  the concrete step (ManifestStep, or a bespoke class) implements. */
export type RunnableStep = StepContract & {
  run(provided: ProvidedStepRun): Promise<ProvidedStepResult>;
};

/** The read-only context one step execution runs against. */
export interface StepCtx {
  action: WorkflowAction;
  cfg: DriveEffectsConfig;
  state: DriveState;
  /** The SAME bounds runDriver builds (allowed transition + revise/retry ledgers). The
   *  executor never invents routing authority , it reconciles through validateAndBound. */
  validateBoundDeps: ValidateBoundDeps;
}

/** What phase 2 hands back: the contained workspace + where each output lands in it. */
export interface ProvisionedWorkspace {
  workspaceDir: string;
  /** Output-id -> workspace-relative path the produced artifact will be found at (the step
   *  falls back to the bare output filename when an id is absent). */
  outputPaths?: Record<string, string>;
}

/** The record/log payload phase 6 emits (turn outcome, for the orchestrator's logging). */
export interface StepRecord {
  action: WorkflowAction;
  producedPaths: string[];
  violations: string[];
}

/**
 * The orchestrator-provided seams the executor drives. These are the "how to get the things
 * the step needs" the state machine owns , input resolution from .sftdd, workspace
 * provisioning, instruction sourcing, and turn logging. The executor NEVER resolves .sftdd
 * itself (containment): it calls these.
 */
export interface StepExecutorDeps {
  /** Phase 1: resolve the action's declared inputs to CONTENTS, or report the missing id. */
  resolveInputs(action: WorkflowAction, cfg: DriveEffectsConfig): Record<string, string> | { missing: string };
  /** Phase 2: provision (or point at) the contained workspace + output locations. */
  provisionWorkspace(action: WorkflowAction, cfg: DriveEffectsConfig): ProvisionedWorkspace;
  /** Phase 3 input: the instruction bundle the orchestrator sourced for this step. */
  instructionsFor(action: WorkflowAction, cfg: DriveEffectsConfig): StepInstructions;
  /** Phase 6: emit the turn record (usage/progress/violations). Optional (tests may omit). */
  onRecord?(record: StepRecord): void;
}

/** What one step execution returns to runDriver's loop. */
export interface StepResult {
  /** The reconciled next move , feeds the loop exactly like today's pendingProposal. */
  bounded: BoundedRoute;
  /** Absolute path(s) to the produced artifact(s) in the workspace. */
  producedPaths: string[];
  /** Non-empty => at least one output failed its in-code checker (a hard reject). */
  violations: string[];
}

/** A fail-loud error for a missing input , raised in phase 1 before any agent spawn. */
export class MissingInputError extends Error {
  constructor(readonly inputId: string, action: WorkflowAction) {
    super(`missing input "${inputId}" for step ${JSON.stringify(action)} , the orchestrator did not provide it (fail loud before spawning the agent)`);
    this.name = "MissingInputError";
  }
}

/**
 * Run one step through the fixed 7-phase Template Method. See the file header for the
 * ownership split. The default no-contract drive never calls this; it is opt-in per step
 * (wired into runDriver behind a flag in a later slice), so the byte-identical default
 * stands until a manifest + the executor are turned on for an action.
 */
export async function execute(step: RunnableStep, ctx: StepCtx, deps: StepExecutorDeps): Promise<StepResult> {
  const { action, cfg, state, validateBoundDeps } = ctx;

  // Phase 1: resolve-inputs , fail loud, BEFORE provisioning or spawning.
  const resolved = deps.resolveInputs(action, cfg);
  if ("missing" in resolved) {
    throw new MissingInputError(resolved.missing, action);
  }

  // Phase 2: provision-workspace , the contained dir + output locations.
  const { workspaceDir, outputPaths } = deps.provisionWorkspace(action, cfg);

  // Phase 3+4: dispatch-agent (contained) + capture-outputs , both inside the step's run().
  const instructions = deps.instructionsFor(action, cfg);
  const runResult = await step.run({ action, workspaceDir, inputs: resolved, instructions, outputPaths });
  const producedPaths = runResult.producedPaths ?? [];

  // Phase 5: validate-outputs , run each output's in-code checker on its produced path.
  // A missing primary artifact (run reported produced:false) or any checker failure is a
  // HARD reject with named violations , never an agent follow-up.
  const violations: string[] = [];
  if (!runResult.produced) {
    if (runResult.missingInput) {
      // Defensive: run() also gates inputs; surface it as a violation rather than crash.
      violations.push(`missing input "${runResult.missingInput}"`);
    } else {
      violations.push("the step's primary output was not produced in the workspace");
    }
  }
  const produced = new Set(producedPaths);
  for (const spec of step.outputs(action)) {
    const rel = outputPaths?.[spec.id] ?? spec.filename;
    const abs = producedPaths.find((p) => p.endsWith(rel));
    if (!abs || !produced.has(abs)) {
      // A declared output that never appeared , only a violation when the primary is
      // otherwise present (a wholly-empty run is already flagged above, don't double-count).
      if (runResult.produced) violations.push(`declared output "${spec.id}" (${spec.filename}) was not produced`);
      continue;
    }
    const check = spec.check(abs);
    if (!check.ok) violations.push(...check.violations.map((v) => `${spec.id}: ${v}`));
  }

  // Phase 6: record/log , always runs (records the outcome incl. any violations).
  deps.onRecord?.({ action, producedPaths, violations });

  // Phase 7: route , the step proposes; validateAndBound reconciles vs the pure transition +
  // the existing revise/retry bounds. A validation failure overrides the step's proposal to
  // a BOUNDED retry (blocked), so a nonconformant output re-issues the step rather than
  // advancing on a bad artifact.
  const proposal: RouteProposal =
    violations.length === 0
      ? step.route(action, { state, feature: cfg.featureId })
      : { outcome: "blocked", proposedNext: action, reason: violations.join("; ") };
  const bounded = validateAndBound(proposal, action, state, validateBoundDeps);

  return { bounded, producedPaths, violations };
}
