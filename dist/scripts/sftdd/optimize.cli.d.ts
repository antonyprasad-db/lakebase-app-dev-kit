#!/usr/bin/env node
import { W as WorkflowAction } from '../../orchestrator-drive-BmzjQ8Tu.js';

type AgentRole = "spec-author" | "ux-designer" | "architect-reviewer" | "dba" | "test-strategist" | "orchestrator" | "navigator" | "driver" | "product-owner" | "release-engineer";

/**
 * The SPAWNABLE role agents: the log roles that are real subagents with a
 * <role>.md def + a model. Two log roles are NOT spawnable and are excluded:
 * "orchestrator" (the deterministic driver emits orchestration events under it)
 * and "release-engineer" (the deploy + promote phases are deterministic - the
 * driver runs lakebase-sftdd-deploy + lakebase-scm-merge - and log under this
 * label; there is no release-engineer agent). Both are code, with no .md + no
 * model, so they are excluded here.
 */
type SpawnableAgentRole = Exclude<AgentRole, "orchestrator" | "release-engineer">;

/** The turns whose effort can differ within a multi-turn build role. Single-turn
 *  roles ignore the turn and use their scalar effort. */
type BuildTurn = "red" | "green" | "review" | "refactor";
/** `--effort` levels `claude -p` accepts, plus "default" (omit the flag). */
type EffortLevel = "default" | "low" | "medium" | "high" | "xhigh" | "max";

/** A Family-2 content/scope variant: what the agent SEES + CAN DO for one turn.
 *  All fields optional; the harness feeds each into the P2a seams (agent overlay
 *  copied into .claude/agents/, suffixes via DriveEffectsConfig hooks, tool scope
 *  via allowed/disallowedToolsForRole). */
interface CandidateContent {
    /** Overlay a variant role definition for the forked turn (the big lever: the
     *  role's instructions + its skills:/tools: frontmatter + scan-scope wording). */
    agentOverlay?: {
        role: string;
        markdown: string;
    };
    /** Appended to the role's task AFTER the terse suffix (a trailing directive). */
    taskSuffix?: string;
    /** Extra pre-extracted context appended BEFORE the terse suffix (inject-more/scan-less). */
    contextPackSuffix?: string;
    /** Restrict the turn's tool scope (--allowed-tools). */
    allowedTools?: string[];
    /** Deny specific tools for the turn (--disallowed-tools). */
    disallowedTools?: string[];
}
/** The sweep spec: each dimension is optional; the generator crosses whichever
 *  are present with the baseline. Model / effort maps are keyed by build turn so a
 *  sweep can target, e.g., just the driver's GREEN turn. */
interface SweepSpec {
    /** The role the model/effort maps target (defaults to "driver"). */
    role?: SpawnableAgentRole;
    /** Per-turn candidate models to try, e.g. { green: ["haiku", "sonnet"] }. */
    models?: Partial<Record<BuildTurn, string[]>>;
    /** Per-turn candidate efforts to try, e.g. { green: ["low", "medium"] }. */
    efforts?: Partial<Record<BuildTurn, EffortLevel[]>>;
    /** build.sessionScope values to try. */
    sessionScopes?: Array<"story" | "cycle">;
    /** CONTEXT_FREE_FRACTION values to try (ride on env). */
    contextFreeFractions?: number[];
    /** build.loopGranularity values to try. */
    loopGranularities?: Array<"story" | "ac" | "hybrid-a">;
    /** Family-2 content variants to try (each becomes its own candidate). */
    contentVariants?: CandidateContent[];
}

/** One handoff to optimize (a single role turn at a point in the walk). */
interface HandoffPlan {
    /** Stable id, e.g. "S1-green" / "S1-review" (also the experiments/ subdir). */
    id: string;
    role: string;
    story?: string;
    /** The build turn mode (green/review/refactor/...); absent for design turns. */
    buildMode?: string;
}

interface OptimizeArgs {
    scenario?: string;
    feature?: string;
    /** A single handoff id to optimize (else the whole feature's handoffs). */
    handoff?: string;
    /** Restrict to one lane. */
    only?: "design" | "build";
    /** The sweep spec string (see parseSweepSpec). */
    candidates?: string;
    /** Trials per candidate (median of passing). Default 3. */
    trials: number;
    /** Print the plan (handoffs + generated candidates) and exit; no spawns. */
    dryRun?: boolean;
    projectDir?: string;
}
/** Parse the CLI flags. Pure. */
declare function parseOptimizeArgs(argv: string[]): OptimizeArgs;
/** Parse a sweep spec string into a SweepSpec. The grammar is `;`-separated
 *  dimensions, each `key=v1,v2,...`:
 *    <role>.<turn>.model=<m>,...      per-turn model tiering
 *    <role>.<turn>.effort=<e>,...     per-turn effort
 *    build.sessionScope=story,cycle   session warmth (scope)
 *    build.loopGranularity=story,ac   loop granularity
 *    env.CONTEXT_FREE_FRACTION=0.3,.. session warmth (fraction, on env)
 *  All model/effort dimensions share ONE role (the last one named wins); the
 *  sweep targets a single role's turns, matching the plan's navigator/driver focus.
 *  Content variants (Family 2) are supplied programmatically, not via this string. */
declare function parseSweepSpec(spec: string): SweepSpec;
/** Map a drive action to a HandoffPlan (the champion walk's unit), or null when
 *  the action is not an optimizable role turn (a gate / project-notes / dispatch
 *  step the walk skips). The id is deterministic + filesystem-safe so it names the
 *  experiments/ subdir + the report row. */
declare function actionToHandoffPlan(action: WorkflowAction): HandoffPlan | null;
/** Whether a handoff plan is a BUILD turn (navigator/driver with a buildMode). */
declare function isBuildHandoff(plan: HandoffPlan): boolean;

export { type OptimizeArgs, actionToHandoffPlan, isBuildHandoff, parseOptimizeArgs, parseSweepSpec };
