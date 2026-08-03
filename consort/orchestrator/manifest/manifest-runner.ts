// manifest-runner: the bridge from a step MANIFEST to the orchestrator (the StepExecutor /
// Template Method). It resolves the action to its manifest, builds the generic ManifestStep
// (manifest + injected agent + validator registry), assembles the orchestrator-owned seams the
// executor drives (resolve inputs from the shared workspace, provision it, source
// instructions, reconcile routing), and runs the fixed 7 phases , so a caller drives a
// manifest end to end without hand-wiring StepCtx/StepExecutorDeps every turn.
//
//   runManifestStep  , run ONE manifest through the executor, return its StepResult.
//   runManifestChain , follow each turn's routing to the next matching manifest until the
//                      chain leaves the manifest set (a terminal / off-graph action). This is
//                      the 2-turn stockflow demo: PO seed -> spec-author breakdown -> done.
//
// Routing authority: a standalone manifest set has no separate pure transition graph , the
// manifest routing IS the transition function. So the runner's validateAndBound `allowed`
// dep returns the step's own proposed next, i.e. the manifest's routing map is authoritative.
// (In the full orchestrator the pure nextTransition is the authority; here the manifests are.)

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { manifestForAction, type StepManifest } from "./step-manifest.js";
import { ManifestStep } from "./manifest-step.js";
import { execute, type StepExecutorDeps, type StepCtx, type StepResult } from "../execution/step-executor.js";
import type { StepAgent, StepInstructions } from "../agents/spec-author-breakdown-step-types.js";
import type { DriveEffectsConfig } from "../../../scripts/sftdd/orchestrator-effects.js";
import type { WorkflowAction, DriveState } from "../../../scripts/sftdd/orchestrator-drive.js";
import type { RouteProposal, ValidateBoundDeps } from "../contract/step-contract.js";

/** What the caller provides so the runner can drive a manifest through the executor. */
export interface ManifestRunnerDeps {
  /** Build the agent for a manifest (keyed by role/id) , the PO mock, a ClaudeStepAgent,
   *  a test double. INJECTED so the runner stays contract-agnostic. */
  agentFor(manifest: StepManifest): StepAgent;
  /** The single shared workspace every turn reads inputs from + writes outputs into (the
   *  design tree). One workspace across the chain is what lets turn N+1 consume turn N's
   *  outputs. */
  workspaceDir: string;
  /** The drive config (projectDir/sftddDir/featureId + model/effort resolution). */
  cfg: DriveEffectsConfig;
  /** Optional: source the instruction bundle for a turn (default: a generic prompt naming
   *  the role + its declared outputs). The full orchestrator sources these from disk/interactive. */
  instructionsFor?(manifest: StepManifest, action: WorkflowAction): StepInstructions;
  /** Optional: the drive state passed to route() (diagnostic scope only; default a stub). */
  state?: DriveState;
  /** Optional: turn-record sink (default no-op). */
  onRecord?: StepExecutorDeps["onRecord"];
}

/** One turn's outcome in a chain. */
export interface ManifestTurn {
  manifestId: string;
  action: WorkflowAction;
  result: StepResult;
}

/** Resolve a manifest input's `source` (e.g. "feature:product-overview.md") to a workspace
 *  file and read its CONTENTS. The demo sources are `feature:<file>` , the file the prior
 *  turn wrote into the shared workspace. Fail loud (as { missing }) so phase 1 gates it. */
function resolveInputsFromWorkspace(manifest: StepManifest, workspaceDir: string): Record<string, string> | { missing: string } {
  const out: Record<string, string> = {};
  for (const input of manifest.inputs) {
    const file = input.source.replace(/^feature:/, "");
    const p = join(workspaceDir, file);
    if (!existsSync(p)) return { missing: input.id };
    out[input.id] = readFileSync(p, "utf8");
  }
  return out;
}

/** A default instruction bundle when the caller supplies none , names the role + the files
 *  the manifest declares the step must produce. */
function defaultInstructions(manifest: StepManifest): StepInstructions {
  const outs = manifest.outputs.map((o) => o.filename).join(", ") || "(no static artifact)";
  return {
    prompt: `Run the ${manifest.role} step "${manifest.id}". Produce: ${outs}. Read only the provided inputs.`,
    guidelines: manifest.outputs.map((o) => `${o.filename}: ${o.description ?? o.id}`),
  };
}

/** Build the StepCtx + StepExecutorDeps for one manifest turn against the shared workspace. */
function executorWiring(
  manifest: StepManifest,
  action: WorkflowAction,
  deps: ManifestRunnerDeps,
): { step: ManifestStep; ctx: StepCtx; execDeps: StepExecutorDeps } {
  const step = new ManifestStep(manifest, deps.agentFor(manifest));

  // The manifest routing is the transition authority for a standalone runner: `allowed`
  // returns the step's OWN proposed next, so validateAndBound honors the manifest's route.
  const validateBoundDeps: ValidateBoundDeps = {
    allowed: (s: DriveState) => {
      const proposal: RouteProposal = step.route(action, { state: s, feature: deps.cfg.featureId });
      return proposal.proposedNext;
    },
    reviseBudgetAvailable: () => true,
    recordRetry: () => ({ sanctioned: true }),
  };

  const ctx: StepCtx = {
    action,
    cfg: deps.cfg,
    state: deps.state ?? ({ phase: "feature" } as unknown as DriveState),
    validateBoundDeps,
  };

  const execDeps: StepExecutorDeps = {
    resolveInputs: () => resolveInputsFromWorkspace(manifest, deps.workspaceDir),
    provisionWorkspace: () => ({ workspaceDir: deps.workspaceDir }),
    instructionsFor: () => (deps.instructionsFor ? deps.instructionsFor(manifest, action) : defaultInstructions(manifest)),
    onRecord: deps.onRecord,
  };

  return { step, ctx, execDeps };
}

/**
 * Run ONE manifest through the orchestrator (StepExecutor). Resolves the action to its
 * manifest (THROWS loud if none matches , the runner never silently no-ops), builds the
 * ManifestStep + the executor wiring, and runs the fixed 7 phases. Returns the StepResult
 * (bounded route + produced paths + violations).
 */
export async function runManifestStep(
  action: WorkflowAction,
  manifests: StepManifest[],
  deps: ManifestRunnerDeps,
): Promise<StepResult> {
  const manifest = manifestForAction(action, manifests);
  if (!manifest) {
    throw new Error(`manifest-runner: no step manifest matches action ${JSON.stringify(action)} , cannot run it.`);
  }
  const { step, ctx, execDeps } = executorWiring(manifest, action, deps);
  return execute(step, ctx, execDeps);
}

/** Options for a chain run. */
export interface RunChainOptions {
  /** Hard cap on turns so a mis-authored routing loop cannot spin forever (default 20). */
  maxTurns?: number;
}

/**
 * Follow a chain of manifests: run the action, take its bounded next action, and if a
 * manifest matches THAT action run it too , until the next action has no matching manifest
 * (a terminal / off-graph move like design-complete/done) or the maxTurns guard trips.
 * Returns every turn in order. All turns share the one workspace, so turn N+1 consumes
 * turn N's outputs , the whole point of the chain.
 */
export async function runManifestChain(
  start: WorkflowAction,
  manifests: StepManifest[],
  deps: ManifestRunnerDeps,
  options: RunChainOptions = {},
): Promise<ManifestTurn[]> {
  const maxTurns = options.maxTurns ?? 20;
  const turns: ManifestTurn[] = [];
  let action: WorkflowAction | undefined = start;

  while (action && turns.length < maxTurns) {
    const manifest = manifestForAction(action, manifests);
    if (!manifest) break; // the next action left the manifest set , terminal, stop cleanly.
    const { step, ctx, execDeps } = executorWiring(manifest, action, deps);
    const result = await execute(step, ctx, execDeps);
    turns.push({ manifestId: manifest.id, action, result });
    action = result.bounded.action;
  }
  return turns;
}
