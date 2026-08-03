import { a as SpawnableAgentRole, B as BuildTurn, E as EffortLevel, S as SftddConfigFile } from './sftdd-config-CICEjaSW.js';

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
/** One point in the sweep space. */
interface Candidate {
    /** Stable, unique, filesystem-safe id (also the experiments/ subdir name). */
    id: string;
    /** Config-file overrides deep-merged onto the base sftdd-config.json (Family 1). */
    configOverrides: DeepPartial<SftddConfigFile>;
    /** Extra env for the forked turn (e.g. CONTEXT_FREE_FRACTION), Family 1 knobs
     *  that ride on env rather than the config file. */
    env?: Record<string, string>;
    /** Family-2 content/scope variant, if any. */
    content?: CandidateContent;
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
type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type { Candidate as C, SweepSpec as S };
