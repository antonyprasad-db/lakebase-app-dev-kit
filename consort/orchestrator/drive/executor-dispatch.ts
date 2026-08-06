// executor-dispatch: the DRIVE's executor-dispatch machinery (Stage 2, #578) , the seam that lets
// the LIVE runDriver loop route selected agent turns THROUGH the StepExecutor's Template Method
// instead of `effects.perform` -> commandsForAction -> runner. Extracted out of the 2000-line
// orchestrator-effects.ts into its own cohesive family module (the "every seam in a function-family
// module" migration metric), re-imported by buildDriveEffects.performViaExecutor.
//
// Dependency-injected (no runtime import of orchestrator-effects, so no import cycle): the caller
// supplies the command-derivation primitives it already owns in that module , buildCycleCommand
// (the ONE shared cycle-CLI derivation), readDriveStateFromDisk (fresh post-turn state), the bin
// tokens, and LOG_BIN. Everything else is this family's own (Step, LiveDriveStepAgent,
// execute) or the manifest registry.
//
// Two turn shapes flow through here today (each added to executorDispatched one at a time, each
// with its byte-identical golden):
//   - spec-author breakdown (DESIGN): single-shot, feature-scoped inputs, artifact-channel output,
//     pre-turn reset-breakdown + post-turn sync-breakdown.
//   - navigator RED (BUILD, LEAN , no cloud): story-scoped inputs, PRODUCT-channel output (the real
//     tests/ tree at the project root), post-turn `@build-cycle` (the RED cycle stamp).

import * as fs from "node:fs";
import { join } from "node:path";
import { storyResolved } from "../../config/consort-paths.js";
import { manifestForAction, type StepManifest } from "../steps/manifest.js";
import { execute, type StepExecutorDeps } from "../turns/step-executor.js";
import { Step } from "../steps/step.js";
import { LiveDriveStepAgent } from "../agents/live-drive-step-agent.js";
import type { WorkflowAction, DriveState } from "./orchestrator-drive.js";
import type { BoundedRoute, ValidateBoundDeps } from "../steps/step-contract.js";
// Types only (erased at compile) , so this module never imports orchestrator-effects at runtime.
import type { DriveCommand, DriveEffectsConfig } from "./orchestrator-effects.js";

/** The command-derivation primitives orchestrator-effects owns, injected so this family module
 *  reuses the SINGLE source of each (no second copy) without a runtime import cycle. */
export interface ExecutorDispatchDeps {
  /** The ONE shared cycle-CLI derivation (reflect-gate / begin / green / …), reused for the
   *  `@build-cycle` post-turn marker so the executor stamps the IDENTICAL cycle the legacy path did. */
  buildCycleCommand(action: Extract<WorkflowAction, { kind: "invoke-role" }>, cfg: DriveEffectsConfig): DriveCommand | undefined;
  /** Re-read the drive state FRESH from disk (post-turn), for the state-derived route authority. */
  readDriveStateFromDisk(consortDir: string, featureId: string, projectDir: string, opts: { uiTrack?: boolean }): DriveState;
  /** Symbolic bin token -> resolved CLI bin (PIPELINE_BIN, CYCLE_BIN, …), the same map
   *  commandsFromManifest uses. */
  binTokens: Record<string, string>;
  /** The agent-log reconcile bin (materializes the meta agent-log before validate). */
  logBin: string;
}

/** The invoke-role actions the live drive dispatches THROUGH the StepExecutor. Deliberately a SMALL
 *  allowlist , migrated one action at a time, each with its byte-identical golden:
 *   - spec-author breakdown (design, single-shot).
 *   - navigator RED (build, LEAN): the story's first authoring turn, no buildMode/mode, has a story.
 *  Everything else falls through to commandsForAction. */
export function executorDispatched(action: WorkflowAction): boolean {
  if (action.kind !== "invoke-role") return false;
  // spec-author breakdown (design lane).
  if ("mode" in action && action.role === "spec-author" && action.mode === "breakdown") return true;
  // navigator RED + driver GREEN (build lane): the plain story turn , no `mode` (not a design step)
  // and no `buildMode` (not review/reflect/assess/refactor/repair), carrying the story. These are
  // exactly the actions nextBuildAction emits for `!testsWritten` (navigator RED) and `!codeWritten`
  // (driver GREEN) in orchestrator-drive.ts. NOTE: navigator RED runs lean (no cloud , authors
  // tests); driver GREEN's post-turn @build-cycle honest-GREEN verify needs a live Lakebase branch,
  // so its LIVE proof is cloud-gated , but the dispatch path itself is identical.
  if (!("mode" in action) && !("buildMode" in action) && (action.role === "navigator" || action.role === "driver") && "story" in action && !!action.story) {
    return true;
  }
  return false;
}

/**
 * Expand a manifest's postTurn entries for a `when` phase into DriveCommands. Resolves the bin token
 * + the `--tdd` / {feature}/{story}/{tddDir} placeholders (the SAME substitution commandsFromManifest
 * uses) AND the `@build-cycle` marker (delegated to the shared buildCycleCommand, so a navigator/
 * driver build turn stamps the IDENTICAL cycle CLI the legacy path did). Without resolving the
 * marker, a RED turn would run no cycle stamp -> testsWritten never flips -> the loop re-proposes
 * RED and stalls (the fresh-state bug class).
 */
export function manifestPostTurnCommands(
  manifest: StepManifest,
  when: "before" | "after",
  action: WorkflowAction,
  cfg: DriveEffectsConfig,
  deps: ExecutorDispatchDeps,
): DriveCommand[] {
  const tdd = ["--feature", cfg.featureId, "--tdd-dir", cfg.consortDir];
  const resolveBin = (t: string): string => deps.binTokens[t] ?? t;
  const story = "story" in action && typeof action.story === "string" ? action.story : undefined;
  const expand = (args: string[]): string[] =>
    args.flatMap((a) =>
      a === "--tdd" ? tdd : a === "{feature}" ? [cfg.featureId] : a === "{tddDir}" ? [cfg.consortDir] : a === "{story}" ? (story ? [story] : []) : [a],
    );
  const out: DriveCommand[] = [];
  for (const p of manifest.postTurn ?? []) {
    if ((p.when ?? "after") !== when) continue;
    if (p.bin === "@build-cycle") {
      // The build turn's cycle CLI (RED stamp / assess / refactor-verify), args are DYNAMIC so they
      // can't be a static manifest arg array , delegate to the shared derivation.
      if (action.kind === "invoke-role") {
        const cycle = deps.buildCycleCommand(action, cfg);
        if (cycle) out.push(cycle);
      }
      continue;
    }
    out.push({ kind: "cli", bin: resolveBin(p.bin), args: expand(p.args) });
  }
  return out;
}

/** The on-disk locations the executor validates a dispatched turn's outputs at , resolved in each
 *  output's channel root (product -> workspaceDir, meta/artifact -> a workspace-relative path). The
 *  same nested paths the legacy designArtifactExpectation + cycle/agent-log writers use. */
export function outputPathsForAction(action: WorkflowAction, featureId: string): Record<string, string> {
  if (action.kind !== "invoke-role") return {};
  // Each path below is CHANNEL-RELATIVE: the executor joins it under the output's channel root
  // (product -> workspaceDir/project root; artifact + meta -> the provisioned .consort). The
  // orchestrator places the file; the manifest/override never re-encodes the root.
  //
  // spec-author breakdown: the feature-spec index (artifact channel -> under .consort) + the
  // meta agent-log (meta channel -> under .consort, materialized by reconcile).
  if ("mode" in action && action.role === "spec-author" && action.mode === "breakdown") {
    return { "feature-spec": `features/${featureId}/feature-spec.json`, "agent-log": "agent-log.jsonl" };
  }
  // navigator RED: the PRODUCT tests/ tree at the project root (product channel -> workspaceDir) +
  // the meta agent-log (meta channel -> .consort, bare + placed by the orchestrator).
  if (!("mode" in action) && !("buildMode" in action) && action.role === "navigator" && "story" in action && !!action.story) {
    return { tests: "tests", "agent-log": "agent-log.jsonl" };
  }
  // driver GREEN: the PRODUCT code (app/ at the project root, product channel -> workspaceDir) is
  // the primary in-turn produced signal, + the meta agent-log (materialized post-run by reconcile).
  // The real correctness gate is the post-turn @build-cycle honest-GREEN verify.
  if (!("mode" in action) && !("buildMode" in action) && action.role === "driver" && "story" in action && !!action.story) {
    return { code: "app", "agent-log": "agent-log.jsonl" };
  }
  return {};
}

/**
 * Assemble the executor-dispatch of an invoke-role turn: run it THROUGH the StepExecutor's Template
 * Method with the uncontained LiveDriveStepAgent, and return the BoundedRoute execute()'s phase-7
 * produced. The pre/post-turn-effect + materialize phases are wired to the manifest's own CLIs, so
 * the executor runs the IDENTICAL side effects the legacy commandsForAction bundled. Uncontained:
 * the agent reads/writes the real project + `.sftdd`, so resolveInputs presence-checks the declared
 * inputs on the live tree (feature:/story: sources) and the workspace IS the project. Returns
 * undefined for an action not on the executor allowlist (caller falls to perform).
 */
export async function performTurnViaExecutor(
  action: WorkflowAction,
  state: DriveState,
  routerDeps: ValidateBoundDeps,
  cfg: DriveEffectsConfig,
  deps: ExecutorDispatchDeps,
): Promise<BoundedRoute | undefined> {
  if (!cfg.useManifestSteps || !executorDispatched(action)) return undefined;
  const manifest = manifestForAction(action);
  if (!manifest) return undefined;

  const agent = new LiveDriveStepAgent(cfg);
  const step = new Step(manifest, agent);
  const f = cfg.featureId;
  const story = "story" in action && typeof action.story === "string" ? action.story : undefined;

  // Resolve a manifest input `source` to its on-disk path on the LIVE tree. `feature:<rel>` is
  // rooted at <consortDir>; `story:<rel>` at the story's resolved dir (test-list-per-story.json,
  // acs/). A bare source (no prefix) is treated as feature-relative (back-compat).
  const inputPath = (source: string): string => {
    if (source.startsWith("story:")) {
      const rel = source.slice("story:".length);
      if (!story) return join(cfg.consortDir, rel); // no story on the action , resolve under consortDir (will miss + fail loud)
      return join(storyResolved(cfg.consortDir, f, story), rel);
    }
    return join(cfg.consortDir, source.replace(/^feature:/, ""));
  };

  const executorDeps: StepExecutorDeps = {
    // Uncontained: the agent reads the tree itself, but Step still gates on the presence of
    // each declared input, so presence-check them on the live tree. A FILE input's content is read
    // (some checkers want it); a DIRECTORY input (e.g. acs/) is presence-only (empty sentinel) ,
    // its content isn't injected, the agent reads the dir. Fail loud (return {missing}) if absent.
    resolveInputs: () => {
      const out: Record<string, string> = {};
      for (const input of manifest.inputs) {
        const p = inputPath(input.source);
        if (!fs.existsSync(p)) return { missing: input.id };
        out[input.id] = fs.statSync(p).isDirectory() ? "" : fs.readFileSync(p, "utf8");
      }
      return out;
    },
    // The workspace IS the real project (LiveDriveStepAgent's runner spawns in cfg.projectDir).
    // product-channel outputs (tests/, app/) land at the project root; artifact + meta channels
    // resolve under the real .consort (artifactDir = metaDir = cfg.consortDir), so the orchestrator
    // places the design docs + the reconciled agent-log there , the manifest filename stays bare.
    provisionWorkspace: () => ({ workspaceDir: cfg.projectDir, artifactDir: cfg.consortDir, metaDir: cfg.consortDir, outputPaths: outputPathsForAction(action, f) }),
    // The prompt is the agent's own (buildClaudeCommand -> roleTask); unused by LiveDriveStepAgent,
    // but the executor requires the dep.
    instructionsFor: () => ({ prompt: "" }),
    // Phase 2.7: the manifest's `before` CLIs (e.g. breakdown's reset-breakdown), run through the runner.
    preTurnEffects: async () => {
      for (const cmd of manifestPostTurnCommands(manifest, "before", action, cfg, deps)) await cfg.runner.run(cmd);
    },
    // Phase 4.5: reconcile MATERIALIZES the agent-log (the legacy path's LOG_BIN --reconcile), so
    // validate-outputs sees the conformant agent-log.jsonl the agent never wrote itself.
    materializeOutputs: async () => {
      await cfg.runner.run({ kind: "cli", bin: deps.logBin, args: ["--reconcile", "--feature", f, "--tdd-dir", cfg.consortDir] });
    },
    // Phase 6.5: the manifest's `after` CLIs , gated on clean validation by the executor. For
    // breakdown that is sync-breakdown; for navigator RED it is the `@build-cycle` RED stamp (the
    // cycle `begin`), which flips testsWritten so the loop advances to the Driver.
    postTurnEffects: async () => {
      for (const cmd of manifestPostTurnCommands(manifest, "after", action, cfg, deps)) await cfg.runner.run(cmd);
    },
  };

  // A `state-derived` route (both breakdown's + RED's produced route) MUST see the state the turn
  // PRODUCED, not the pre-turn snapshot: execute()'s phase-7 validateAndBound runs AFTER the
  // post-turn CLI (sync-breakdown / the RED cycle stamp), so `allowed` re-reads fresh from disk
  // (the synced pipeline now shows breakdownDone / testsWritten). Using the stale pre-turn state
  // re-derives the just-performed turn and the loop stalls. The rest of routerDeps (revise budget,
  // retry ledger) is preserved.
  const freshRouterDeps: ValidateBoundDeps = {
    ...routerDeps,
    allowed: () => routerDeps.allowed(deps.readDriveStateFromDisk(cfg.consortDir, cfg.featureId, cfg.projectDir, { uiTrack: cfg.uiTrack })),
  };
  const ctx = { action, cfg, state, validateBoundDeps: freshRouterDeps };
  const result = await execute(step, ctx, executorDeps);
  return result.bounded;
}
