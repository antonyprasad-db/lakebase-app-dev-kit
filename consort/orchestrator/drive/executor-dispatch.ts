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
import { join, relative } from "node:path";
import {
  storyResolved,
  featureSpecJson,
  architectureJson,
  dbDesignJson,
  featureTestListJson,
  designGuideJson,
  acsDir,
  featureProposalsMd,
  planningEstimatesJson,
} from "../../config/consort-paths.js";
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

/** The invoke-role actions the live drive dispatches THROUGH the StepExecutor. Every action whose
 *  shipped manifest declares outputs (so the executor's validate + channel-placement phases have
 *  something to do) is dispatched here; the pure build turns with NO declared outputs
 *  (review/reflect/assess/refactor/repair/superseded/deploy , verified by @build-cycle records, not
 *  a static artifact) fall through to commandsForAction. The set:
 *   DESIGN LANE (artifact + meta channels, LEAN , no cloud):
 *     - spec-author breakdown | propose | per-story ACs
 *     - architect-reviewer (architecture) | architect estimate (planning/estimates)
 *     - dba (db-design) | test-strategist (test-list) | ux-designer (design-guide)
 *   BUILD LANE (product + meta channels):
 *     - navigator RED (LEAN , authors tests/) | driver GREEN (cloud-gated , honest-GREEN verify).
 *  All dispatch through the SAME role-agnostic performTurnViaExecutor; the only per-role knobs are
 *  this gate + outputPathsForAction's channel-relative path per output. */
export function executorDispatched(action: WorkflowAction): boolean {
  if (action.kind !== "invoke-role") return false;

  // ── DESIGN LANE ────────────────────────────────────────────────────────────────────────────
  if ("mode" in action) {
    // spec-author breakdown | propose; architect estimate (NOT estimate-committed , that re-syncs
    // the backlog via a separate legacy branch with no shipped manifest).
    if (action.role === "spec-author" && (action.mode === "breakdown" || action.mode === "propose")) return true;
    if (action.role === "architect-reviewer" && action.mode === "estimate") return true;
    return false; // author-requests + estimate-committed + any other mode: legacy path.
  }
  // The per-story / feature design turns carry NO mode and NO buildMode. Distinguish them from the
  // build turns (navigator/driver) by role.
  if (!("buildMode" in action)) {
    // spec-author per-story ACs + architect-reviewer per-story + test-strategist: story-scoped.
    if ((action.role === "spec-author" || action.role === "architect-reviewer" || action.role === "test-strategist") && "story" in action && !!action.story) {
      return true;
    }
    // dba is story-scoped in the per-story lane; ux-designer is feature-scoped (no story). Both have
    // a shipped manifest with an artifact output.
    if (action.role === "dba" && "story" in action && !!action.story) return true;
    if (action.role === "ux-designer") return true;
    // ── BUILD LANE ─────────────────────────────────────────────────────────────────────────────
    // navigator RED + driver GREEN: the plain story turn (no mode/buildMode, carries a story) ,
    // exactly what nextBuildAction emits for `!testsWritten` / `!codeWritten`. RED runs lean; GREEN's
    // post-turn @build-cycle honest-GREEN verify needs a live Lakebase branch (cloud-gated proof),
    // but the dispatch path is identical.
    if ((action.role === "navigator" || action.role === "driver") && "story" in action && !!action.story) {
      return true;
    }
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
 *  same nested paths the legacy designArtifactExpectation + cycle/agent-log writers use.
 *
 *  Every ARTIFACT-channel path is derived from the SAME consort-paths.ts helper the legacy
 *  designArtifactExpectation uses, made CHANNEL-RELATIVE via `relative(consortDir, helper(...))`, so
 *  it is byte-identical to legacy AND slug-dir-safe (features/<F> and stories/<S> may be `<id>` or
 *  `<id>-<slug>` , the helper resolves the real dir; a hardcoded `features/<F>/...` would miss a slug
 *  dir a design role READS). The META agent-log is always bare `agent-log.jsonl` (reconcile writes
 *  it at <consortDir>/agent-log.jsonl). PRODUCT paths (tests/, app/) are project-root-relative. */
export function outputPathsForAction(action: WorkflowAction, consortDir: string, featureId: string): Record<string, string> {
  if (action.kind !== "invoke-role") return {};
  const f = featureId;
  const story = "story" in action && typeof action.story === "string" ? action.story : undefined;
  // Channel-relative = the artifact's path within its channel's root (artifact/meta -> consortDir).
  const rel = (abs: string): string => relative(consortDir, abs);
  const META = { "agent-log": "agent-log.jsonl" }; // meta channel, always bare (reconcile places it).

  // ── DESIGN LANE (artifact channel -> under .consort) ─────────────────────────────────────────
  if ("mode" in action) {
    // spec-author breakdown: the feature-spec index.
    if (action.role === "spec-author" && action.mode === "breakdown") {
      return { "feature-spec": rel(featureSpecJson(consortDir, f)), ...META };
    }
    // spec-author propose: the sprint's planning proposals (no agent-log , planning mode skips reconcile).
    if (action.role === "spec-author" && action.mode === "propose") {
      return { "feature-proposals": rel(featureProposalsMd(consortDir)) };
    }
    // architect estimate: the planning estimates (planning mode , no reconcile/agent-log).
    if (action.role === "architect-reviewer" && action.mode === "estimate") {
      return { estimates: rel(planningEstimatesJson(consortDir)) };
    }
    return {};
  }
  if (!("buildMode" in action)) {
    // spec-author per-story ACs: the story's acs/ DIRECTORY (the legacy designArtifactExpectation's
    // anyOf is the DIR , the deliverable is "≥1 conformant AC", not a fixed filename).
    if (action.role === "spec-author" && story) {
      return { acs: rel(acsDir(consortDir, f, story)), ...META };
    }
    // architect-reviewer per-story: the feature architecture.
    if (action.role === "architect-reviewer" && story) {
      return { architecture: rel(architectureJson(consortDir, f)), ...META };
    }
    // dba per-story: the physical schema.
    if (action.role === "dba" && story) {
      return { "db-design": rel(dbDesignJson(consortDir, f)), ...META };
    }
    // test-strategist per-story: the feature master test-list.
    if (action.role === "test-strategist" && story) {
      return { "test-list": rel(featureTestListJson(consortDir, f)), ...META };
    }
    // ux-designer (feature-scoped, no story): the design system.
    if (action.role === "ux-designer") {
      return { "design-guide": rel(designGuideJson(consortDir)), ...META };
    }
    // ── BUILD LANE (product channel -> project root) ───────────────────────────────────────────
    // navigator RED: the PRODUCT tests/ tree at the project root + the meta agent-log.
    if (action.role === "navigator" && story) {
      return { tests: "tests", ...META };
    }
    // driver GREEN: the PRODUCT code (app/ at the project root). The real correctness gate is the
    // post-turn @build-cycle honest-GREEN verify; app/ is the in-turn produced signal.
    if (action.role === "driver" && story) {
      return { code: "app", ...META };
    }
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
  // acs/). A bare source (no prefix) is treated as feature-relative (back-compat). The `<rel>` may
  // carry a `{feature}` / `{story}` placeholder , expanded to the run's ids BEFORE the join, so a
  // feature-scoped input names its REAL relative path (features/{feature}/architecture.json) instead
  // of resolving flat to the consort root (where the artifact does not live). The story-dir resolver
  // (storyResolved) already handles the slug-named story dir; {feature} lets a feature-scoped file
  // resolve through featuresDir/<id> WITHOUT this module re-deriving the slug rule.
  const expandRel = (rel: string): string =>
    rel.replace(/\{feature\}/g, f).replace(/\{story\}/g, story ?? "");
  const inputPath = (source: string): string => {
    if (source.startsWith("story:")) {
      const rel = expandRel(source.slice("story:".length));
      if (!story) return join(cfg.consortDir, rel); // no story on the action , resolve under consortDir (will miss + fail loud)
      return join(storyResolved(cfg.consortDir, f, story), rel);
    }
    return join(cfg.consortDir, expandRel(source.replace(/^feature:/, "")));
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
    provisionWorkspace: () => ({ workspaceDir: cfg.projectDir, artifactDir: cfg.consortDir, metaDir: cfg.consortDir, outputPaths: outputPathsForAction(action, cfg.consortDir, f) }),
    // The prompt is the agent's own (buildClaudeCommand -> roleTask); unused by LiveDriveStepAgent,
    // but the executor requires the dep.
    instructionsFor: () => ({ prompt: "" }),
    // Phase 2.7: the manifest's `before` CLIs (e.g. breakdown's reset-breakdown), run through the runner.
    preTurnEffects: async () => {
      for (const cmd of manifestPostTurnCommands(manifest, "before", action, cfg, deps)) await cfg.runner.run(cmd);
    },
    // Phase 4.5: reconcile MATERIALIZES the agent-log (the legacy path's LOG_BIN --reconcile), so
    // validate-outputs sees the conformant agent-log.jsonl the agent never wrote itself. SKIPPED for
    // the sprint-scoped PLANNING modes (propose / estimate / estimate-committed) , they write no
    // feature agent-log to reconcile + declare no agent-log output, and the legacy path guards
    // reconcile with the SAME `!isPlanningMode` condition (commandsForAction / commandsFromManifest),
    // so skipping here keeps the executor byte-parallel to the legacy stream ([claude] only).
    materializeOutputs: async () => {
      const isPlanningMode = "mode" in action && (action.mode === "propose" || action.mode === "estimate" || action.mode === "estimate-committed");
      if (isPlanningMode) return;
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
