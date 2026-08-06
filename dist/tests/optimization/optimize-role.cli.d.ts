#!/usr/bin/env node
/** One role chain's definition (the DATA that drives both the live test + the sweep). */
interface RoleChain {
    /** Human name for the test title / report. */
    name: string;
    /** The chain dir under tests/integration/manifests/; its manifest ids are <dir>-seed/-live. */
    dir: string;
    /** The artifact the live role writes (workspace-relative = the manifest output filename). */
    outputFile: string;
    /** The live-turn prompt handed to the real agent. */
    prompt: string;
    /** OPTIONAL quality-gate reference override (intake-relative). When the recorded `outputFile`
     *  is a WIDER scope than what the isolated turn is given the inputs to produce (e.g. the
     *  test-strategist writes the feature MASTER test-list, but a per-story chain is seeded ONE
     *  story's ACs), the discriminator must score against the matching SLICE, not the full artifact
     *  , else every candidate scores "thin" for a scope reason, not a quality reason. Absent =>
     *  score against `outputFile` (the default; the produced artifact IS the whole recorded one). */
    referenceFile?: string;
}

/** The levers in effect for a role's turn (what a sweep varies). Mirrors the manifest
 *  agentOptions + the DriveEffectsConfig scope levers, so a record states exactly what produced
 *  its numbers. All optional , a default-lever run simply omits the ones it did not set. */
interface RoleLevers {
    model?: string;
    effort?: string;
    session?: "fresh" | "resume";
    resumeKeyFrom?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    /** Free-form note for any non-standard lever a sweep applied (taskSuffix/contextPack/etc.). */
    note?: string;
}
/** The agent-reported usage for the turn (from the stream-json result event via TurnUsage).
 *  Absent when the agent reported none (a mock/replay turn, or a stream with no result event). */
interface RoleAgentUsage {
    /** Agent-side turn count (`num_turns`) , the retry/loop signal. */
    numTurns?: number;
    /** The CLI-reported wall-clock (`duration_ms`), distinct from the outer step timer. */
    durationMs?: number;
    costUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
}
/** The agent's captured trace for the turn (prompt it was dispatched with, its final assistant
 *  text, and the ordered tool actions) , the same triple the legacy turn-recorder persisted. */
interface RoleTranscript {
    prompt: string;
    finalText: string;
    tools: string[];
}
/** One isolated role turn's full instrumentation record , the thing that SURVIVES the run. */
interface RoleTelemetry {
    /** The design/plan role whose turn this measures. */
    role: string;
    /** The chain dir the turn ran in (its manifest ids are <chain>-seed / <chain>-live). */
    chain: string;
    /** The model the turn ran on (also in levers.model; hoisted for the summary line). */
    model?: string;
    /** The levers in effect (what a sweep varies to try to beat this baseline). */
    levers: RoleLevers;
    /** The ORCHESTRATOR's outer wall-clock for the whole step (spawn + validate), ms. This is
     *  the number the vitest per-test timer reports; it always exists. */
    outerDurationMs: number;
    /** The agent's self-reported usage (tokens/cost/num_turns/duration), when available. */
    agent?: RoleAgentUsage;
    /** The turn's route outcome (produced / blocked / revise / escalate). */
    outcome: string;
    /** The artifact the role produced (workspace-relative), when it produced one. */
    producedFile?: string;
    /** The agent's trace, when captured. */
    transcript?: RoleTranscript;
    /** The QUALITY score (0..1) of the produced artifact vs the recorded baseline, from the
     *  semantic/functional judge , present only when a sweep ran the quality gate. A fast candidate
     *  with a LOW score produced a conformant-but-thinner artifact than the baseline (the coverage
     *  the conformance gate can't see). Undefined = quality not judged (conformance-only run). */
    semanticScore?: number;
    /** BUILD DISCRIMINATOR classification (build sweeps only): the assess-style verdict on the
     *  produced code , "equivalent" (clean, converged with NO self-heal , the BEST outcome),
     *  "superseded-shift", "regression", or "insufficient" (the only failing verdict). Undefined
     *  on a design sweep (flat semanticScore instead). */
    classification?: string;
    /** The NEXT STEP the discriminator classification warrants (accept / permissive-refactor-
     *  superseded / driver-repair-with-directive / escalate). */
    nextStep?: string;
}

/** The candidate's lever patch on the live role's AgentLevers. All optional; absent = the role's
 *  default (baseline). tool-scope patches restrict what the turn may call. */
interface RoleLeverPatch {
    model?: string;
    effort?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    /** Session lever: "resume" warms the turn from a prior same-key session (the real drive's
     *  per-story build warmth). Only meaningful on a MULTI-TURN substrate that ran a prior turn to
     *  resume , the single-turn chain cannot measure it (see `roleCandidates` multiTurn gate). */
    session?: "fresh" | "resume";
}

/** One candidate's measured outcome. `gatePassed` is the conformance bar (no violations + the
 *  artifact produced + the chain terminated at design-complete); `qualityPassed` is the
 *  quality-vs-baseline bar (undefined when no quality gate ran); `telemetry` is the trial record;
 *  `disqualified` (+ reason) marks a crash or a chain that never reached the live turn. */
interface SweepTrial {
    candidateId: string;
    levers: RoleLeverPatch;
    gatePassed: boolean;
    qualityPassed?: boolean;
    telemetry?: RoleTelemetry;
    /** The PRESERVED produced-artifact tree for this candidate ({relpath -> contents}), so the
     *  caller persists the actual outputs to a durable per-candidate dir , not just telemetry.
     *  Empty on a disqualified/crashed candidate that produced nothing. */
    producedArtifacts?: Record<string, string>;
    disqualified?: boolean;
    reason?: string;
}

/** One ranked row in the report (a gate-passing candidate + its deltas vs baseline). */
interface SweepRow {
    candidateId: string;
    levers: SweepTrial["levers"];
    outerDurationMs: number;
    costUsd?: number;
    /** % faster than baseline by wall-clock (positive = faster). */
    speedupPct: number;
    /** Dollar delta vs baseline (negative = cheaper). */
    costDeltaUsd?: number;
    /** BUILD discriminator classification (build sweeps only), surfaced as a positive note. */
    classification?: string;
}
/** The full sweep report. */
interface SweepReport {
    role: string;
    baselineMs: number;
    baselineCostUsd?: number;
    /** Gate-passers ranked fastest-first (includes the baseline). */
    ranked: SweepRow[];
    /** The fastest gate-passer that BEAT the baseline, or undefined when none did. */
    winner?: SweepRow;
    /** Candidates that failed the gate or crashed (id + why), for the report tail. */
    rejected: Array<{
        candidateId: string;
        reason: string;
    }>;
}
/**
 * Build the before/after report from the sweep trials. The baseline trial (candidateId
 * "baseline") sets the reference wall-clock + cost. Gate-passers are ranked fastest-first; the
 * winner is the fastest gate-passer strictly faster than the baseline (never the baseline itself,
 * never a gate-failer). Everything else lands in `rejected` with a reason.
 */
declare function reportRoleSweep(trials: SweepTrial[]): SweepReport;

/** Parsed CLI args. */
interface OptimizeRoleArgs {
    role: string;
    baseModel?: string;
    telemetryDir?: string;
}
/** Parse argv (pure + exported for a unit test). Throws loud on an unknown/absent role. */
declare function parseArgs(argv: string[], chains?: Record<string, RoleChain>): OptimizeRoleArgs;
/** Run the sweep for one role end to end + print the report. Returns the report (for the caller
 *  / a future auto-apply). LIVE , each candidate spawns a real claude turn. */
declare function runOptimizeRole(args: OptimizeRoleArgs): Promise<ReturnType<typeof reportRoleSweep>>;

export { type OptimizeRoleArgs, parseArgs, runOptimizeRole };
