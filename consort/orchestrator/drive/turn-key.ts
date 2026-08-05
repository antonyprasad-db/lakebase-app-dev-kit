// The per-invocation KEY a role's effort/model config is applied on ("apply to the step, not
// the role"): a BUILD turn (navigator/driver RED|REVIEW|ASSESS|REFACTOR|...) OR a DESIGN step
// (spec-author breakdown|acs, architect estimate|architect, dba, test-list, ux). This module
// is the SHARED, dependency-light home for those types + the action->key map, so BOTH the
// config resolver (sftdd-config.ts) and the drive effects (orchestrator-effects.ts) derive the
// key from ONE place , without an import cycle (sftdd-config -> orchestrator-effects was the
// cycle; both now depend on this leaf, which imports only the WorkflowAction type).

import type { WorkflowAction } from "./orchestrator-drive.js";

/** The BUILD turns whose effort/model can differ within the navigator/driver loop.
 *  Each is a DISTINCT kind of work, so each can pick its own model/effort ("apply to
 *  the turn, not the role"):
 *   navigator (judgment): red (author tests), review (critique code), assess (scope
 *     contamination-fragile tests before a refactor/deploy).
 *   driver (code): green (implement), refactor (restructure code), repair (fix a
 *     regression a prior story's build broke).
 *  The specialized drive buildModes collapse onto these base families , they are the
 *  same KIND of work, differing only in what triggered them:
 *   refactor-deploy / refactor-superseded -> refactor;  assess-deploy / assess-refactor
 *   -> assess;  green-superseded -> green.
 *  (reflect is the design-lane critic, keyed as its own DesignStep-adjacent case in
 *  turnKeyForAction, never a build turn here.) */
export type BuildTurn = "red" | "green" | "review" | "refactor" | "assess" | "repair";

/** The DESIGN/planning steps a role can be invoked for. A role runs different
 *  TASKS across these steps (spec-author BREAKDOWN vs per-story AC authoring;
 *  architect ESTIMATE vs per-story ARCHITECT notes), so a lever that wins on one
 *  step need not win on another , effort/model are keyed on the step, not the role. */
export type DesignStep =
  | "breakdown" // spec-author: enumerate the feature's stories
  | "propose" // spec-author: project feature-proposals (planning)
  | "acs" // spec-author: author a story's acceptance criteria
  | "estimate" // architect-reviewer: planning estimates
  | "architect" // architect-reviewer: per-story architecture notes
  | "dba" // dba: per-story physical schema
  | "test-list" // test-strategist: per-story test list
  | "ux"; // ux-designer: the project style guide (once)

/** The full per-invocation key effort/model can be applied on: a BUILD turn OR a
 *  DESIGN step. This is the "apply to the step, not the role" axis , the champion
 *  walk sweeps per invocation, so a winner is persisted keyed on the exact step it
 *  was measured on. A single-turn role with no key falls back to its scalar. */
export type TurnKey = BuildTurn | DesignStep;

/** `--effort` levels `claude -p` accepts, plus "default" (omit the flag). */
export type EffortLevel = "default" | "low" | "medium" | "high" | "xhigh" | "max";

/** Map an invoke-role action to its TurnKey , the per-invocation step the config's
 *  effort/model can be keyed on ("apply to the step, not the role"). BUILD turns:
 *  navigator review|red, driver refactor|green (reflect is a design-lane critic on
 *  the base model, so no key). DESIGN steps: spec-author breakdown|propose|acs,
 *  architect-reviewer estimate|architect, dba, test-strategist test-list, ux-designer
 *  ux. Returns undefined only for actions with no distinct step (fall back to scalar). */
export function turnKeyForAction(action: WorkflowAction): TurnKey | undefined {
  if (action.kind !== "invoke-role") return undefined;
  // Build turns first (buildMode-carrying navigator/driver turns). Each specialized
  // buildMode collapses onto its base BuildTurn family , the same KIND of work, so it
  // picks that family's model/effort. (reflect is the design-lane critic, no build key.)
  if ("buildMode" in action) {
    switch (action.buildMode) {
      case "reflect":
        return undefined; // design-lane critic, runs on the base model
      case "review":
        return "review";
      case "refactor":
      case "refactor-deploy":
      case "refactor-superseded": // BUGFIX: previously fell through to undefined
        return "refactor";
      case "assess":
      case "assess-deploy":
      case "assess-refactor":
        return "assess";
      case "repair":
        return "repair";
      case "green-superseded":
        return "green";
    }
  }
  // Planning-mode design steps.
  if ("mode" in action) {
    if (action.role === "spec-author" && action.mode === "breakdown") return "breakdown";
    if (action.role === "spec-author" && action.mode === "propose") return "propose";
    if (action.role === "architect-reviewer" && (action.mode === "estimate" || action.mode === "estimate-committed")) return "estimate";
    // author-requests is human input, no agent turn , no key.
    return undefined;
  }
  // Feature-scoped design role.
  if (action.role === "ux-designer") return "ux";
  // Story-scoped design steps (no mode/buildMode, has a story).
  if ("story" in action && action.story) {
    if (action.role === "spec-author") return "acs";
    if (action.role === "architect-reviewer") return "architect";
    if (action.role === "dba") return "dba";
    if (action.role === "test-strategist") return "test-list";
  }
  // Plain build turns (no buildMode): navigator RED, driver GREEN.
  if (action.role === "navigator") return "red";
  if (action.role === "driver") return "green";
  return undefined;
}
