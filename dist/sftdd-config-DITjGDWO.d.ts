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

/** The BUILD turns whose effort/model can differ within the navigator/driver
 *  RED/GREEN/REVIEW/REFACTOR loop. */
type BuildTurn = "red" | "green" | "review" | "refactor";
/** The DESIGN/planning steps a role can be invoked for. A role runs different
 *  TASKS across these steps (spec-author BREAKDOWN vs per-story AC authoring;
 *  architect ESTIMATE vs per-story ARCHITECT notes), so a lever that wins on one
 *  step need not win on another , effort/model are keyed on the step, not the role. */
type DesignStep = "breakdown" | "propose" | "acs" | "estimate" | "architect" | "dba" | "test-list" | "ux";
/** The full per-invocation key effort/model can be applied on: a BUILD turn OR a
 *  DESIGN step. This is the "apply to the step, not the role" axis , the champion
 *  walk sweeps per invocation, so a winner is persisted keyed on the exact step it
 *  was measured on. A single-turn role with no key falls back to its scalar. */
type TurnKey = BuildTurn | DesignStep;
/** `--effort` levels `claude -p` accepts, plus "default" (omit the flag). */
type EffortLevel = "default" | "low" | "medium" | "high" | "xhigh" | "max";
/** Per-role settings as written on disk. `model` and `effort` are each either one
 *  value for the whole role, or a per-turn map (only navigator/driver have multiple
 *  turns). A per-turn `model` map is how the Driver's mechanical GREEN/REFACTOR runs
 *  on a cheaper/faster model than its RED (test authoring), the model-tiering lever. */
interface RoleSettingsFile {
    model?: string | Partial<Record<TurnKey, string>>;
    fallbackModel?: string;
    maxBudgetUsd?: number;
    effort?: EffortLevel | Partial<Record<TurnKey, EffortLevel>>;
}
interface SftddConfigFile {
    version: 1;
    roles?: Partial<Record<SpawnableAgentRole, RoleSettingsFile>>;
    build?: {
        loopGranularity?: "story" | "ac" | "hybrid-a";
        batchCap?: number;
        sessionScope?: "story" | "cycle";
    };
    plan?: {
        sizing?: boolean;
    };
    project?: {
        uiTrack?: boolean;
        gates?: "interactive" | "proxy";
        deployTarget?: string;
        clientFramework?: "react" | "none";
    };
}

export type { BuildTurn as B, EffortLevel as E, SftddConfigFile as S, TurnKey as T, SpawnableAgentRole as a };
