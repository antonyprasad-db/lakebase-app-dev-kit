#!/usr/bin/env node
import { W as WorkflowAction } from '../../orchestrator-drive-BmzjQ8Tu.cjs';

type DriveCommand = {
    kind: "claude";
    role: string;
    model: string;
    task: string;
    resumeKey?: string;
    effort?: string;
    fallbackModel?: string;
    maxBudgetUsd?: number;
    allowedTools?: string[];
    disallowedTools?: string[];
    replay?: {
        mode?: string;
        buildMode?: string;
        story?: string;
    };
} | {
    kind: "cli";
    bin: string;
    args: string[];
} | {
    kind: "set-phase";
    phase: string;
} | {
    kind: "sync-backlog";
    sprint: string;
} | {
    kind: "verify-artifact";
    role: string;
    anyOf: string[];
    label: string;
};
interface CommandRunner {
    run(cmd: DriveCommand): Promise<void>;
}
interface DriveEffectsConfig {
    projectDir: string;
    sftddDir: string;
    featureId: string;
    runner: CommandRunner;
    /** Resolve a role's model (per-project override -> recommended -> inherit). */
    modelForRole(role: string): string;
    /** Unified config: resolve the model for a role+turn (model tiering). A per-turn
     *  `model` map entry (e.g. driver GREEN on haiku) wins for that turn; absent, the
     *  role's base model applies. When unset, the caller falls back to modelForRole. */
    modelForTurn?(role: string, turn?: "red" | "green" | "review" | "refactor"): string;
    /** Approver name for headless gate approvals (the Human Proxy). */
    approver?: string;
    /** Sprint name, threaded to the sprint plan gate in the planning phase. */
    sprintName?: string;
    /** Recorded feature-requests are available (capture/replay via
     *  $LAKEBASE_SFTDD_SPRINT_REQUESTS). When true, the planning PROPOSE step is
     *  DETERMINISTIC (project feature-proposals.md from those requests via the
     *  Human Proxy) instead of spawning the Spec Author LLM, which as an LLM could
     *  write nothing then claim the file exists (the propose protocol-violation
     *  abort). Interactive users (no recorded requests) still get the live propose. */
    recordedRequests?: boolean;
    /** Force the PROPOSE step LIVE even when recordedRequests is set. The capture
     *  uses this to exercise the full plan lane: the Spec Author proposes live
     *  (reading product-overview.md + nfrs.md, so the candidate set is guided by
     *  the product's own framing), while the proxy-as-PO STILL commits the recorded
     *  feature-request at author-requests. Safe now that an empty live propose is
     *  caught + retried (improved handoff guard), which is the failure the
     *  deterministic path originally avoided. Set via $LAKEBASE_SFTDD_LIVE_PROPOSE. */
    livePropose?: boolean;
    /** Deploy target for the deploy action (e.g. "local"). */
    deployTarget?: string;
    /** Lakebase instance id (the Lakebase project id), threaded to the experiment
     *  branch ops. The experiment CLI requires it; resolved from SCM state. */
    instance?: string;
    /** The feature's git + Lakebase branch (the PARENT a per-story experiment is
     *  cut off, and merged back into). Resolved from SCM state at drive start. */
    featureBranch?: string;
    /** The feature's PARENT TIER (the branch the feature PR merges up into, e.g.
     *  staging). Resolved from SCM state at drive start. The feature wrap-up
     *  switches the working tree back to it as the last step, so the next feature
     *  forks from a clean parent (and a human/the smoke is not left on the merged,
     *  soon-deleted feature branch). */
    parentBranch?: string;
    /** UI track on (project.uiTrack in sftdd-config.json, the single source): the
     *  Spec Author must treat user-facing capabilities as E2E (browser/screen)
     *  stories, not API-only, when proposing + breaking down. */
    uiTrack?: boolean;
    /** P5: build-session scope for the Navigator/Driver. "story" (default) resumes
     *  their `claude -p` session across a story's cycles (warm context + prompt
     *  cache) and starts FRESH at each new story, so context growth is bounded to
     *  one story. "cycle" cold-spawns every RED/GREEN/REVIEW/REFACTOR (the prior
     *  behavior), the safety valve if a long story overflows the window. */
    buildSessionScope?: "cycle" | "story";
    /** P6: `--effort` level for the Navigator's REVIEW turn (judgment, not code
     *  authoring), so it runs fast. Default "low"; set "" / undefined-via-env to
     *  use the model default. Superseded by effortForTurn when that is provided
     *  (kept as the fallback so older callers / tests still resolve review effort). */
    reviewEffort?: string;
    /** Unified config: resolve `--effort` for ANY role+turn ("" / "default" => omit
     *  the flag). When set it governs every turn; absent, the review-only
     *  reviewEffort fallback applies. (sftdd-config.json, file -> env -> default.) */
    effortForTurn?(role: string, turn?: "red" | "green" | "review" | "refactor"): string;
    /** Unified config: a role's `--fallback-model` (auto-failover), or undefined. */
    fallbackModelForRole?(role: string): string | undefined;
    /** Unified config: a role's `--max-budget-usd` per-invocation cap, or undefined. */
    maxBudgetUsdForRole?(role: string): number | undefined;
    /** Build loop granularity. "story" (the DEFAULT) gives the Navigator + Driver
     *  story-scoped turns: one RED turn writes the WHOLE story's tests, one GREEN
     *  greens them, one REVIEW + one REFACTOR per story. "ac" writes + greens one
     *  test at a time (strict per-AC TDD, per-AC REVIEW/REFACTOR). "hybrid-a"
     *  batches RED+GREEN by layer (capped) but keeps the per-AC REVIEW. ac /
     *  hybrid-a are opt-in for a more granular run. */
    loopGranularity?: "ac" | "hybrid-a" | "story";
    /** P8b: max test-list items per layer-batch (hybrid-a). Default 3. */
    batchCap?: number;
    /** Optimize harness (Family-2 content/scope levers), all DEFAULT-OFF: a normal
     *  drive sets none, so every turn's prompt + spawn args are byte-identical to
     *  before. The per-handoff optimize harness sets them for ONE forked candidate
     *  turn to A/B-test what the agent SEES and CAN DO, then discards or keeps the
     *  turn on wall-clock + gate outcome.
     *
     *  taskSuffix: extra directive APPENDED to a role's task (after the terse
     *  suffix), the per-turn task-injection lever. Return "" for no-op. */
    taskSuffix?(role: string, turn?: "red" | "green" | "review" | "refactor"): string;
    /** contextPackSuffix: extra pre-extracted CONTEXT appended to a build turn's
     *  task, BEFORE the terse suffix, so it reads as context, not a trailing order.
     *  The inject-more/scan-less lever (module map, code snippets, exact refs).
     *  Return "" for no-op. */
    contextPackSuffix?(role: string, turn?: "red" | "green" | "review" | "refactor"): string;
    /** allowedToolsForRole/disallowedToolsForRole: per-role tool-scope restriction
     *  (--allowed-tools / --disallowed-tools), the cap-what-the-agent-scans lever.
     *  Return undefined (or an empty list) to leave the tool scope unrestricted. */
    allowedToolsForRole?(role: string): string[] | undefined;
    disallowedToolsForRole?(role: string): string[] | undefined;
    onAction?(action: WorkflowAction, iteration: number): void;
}

interface ParsedArgs {
    feature?: string;
    sprint?: string;
    projectDir?: string;
    sftddDir?: string;
    instance?: string;
    deployTarget?: string;
    approver?: string;
    dryRun?: boolean;
    maxSteps?: number;
    planOnly?: boolean;
    only?: string;
    pauseBefore?: string;
    gates?: string;
    noSizing?: boolean;
    help?: boolean;
}
/** The prompt + final reasoning + tool list captured from ONE agent turn, for
 *  the recorder to persist (demo transcript). Not the raw stream (that includes
 *  every interstitial "let me check" delta); just the outcome-level trace. */
interface TurnTranscript {
    /** The task prompt the agent was dispatched with (`claude -p <task>`). */
    prompt: string;
    role?: string;
    model?: string;
    /** The turn's FINAL assistant text (the outcome/rationale). */
    finalText: string;
    /** Each tool action in order (name + a clipped target), as they streamed. */
    tools: string[];
}
/** The live runner: claude -p for roles, the kit CLIs for state, a direct
 *  workflow-state write for the coarse phase. */
/**
 * The spawn flags for a claude command's optional tool-scope levers (the
 * optimize harness's Family-2 "restrict what the agent can scan/do" knob). A
 * pure function of the command so it is hermetically testable and has ONE
 * source of truth. Empty (both fields absent or empty) => `[]`, so a normal
 * drive command (which sets neither) spawns byte-identically to before.
 */
declare function claudeToolArgs(cmd: Extract<DriveCommand, {
    kind: "claude";
}>): string[];
/**
 * The base `claude -p` spawn args for a role turn. Pure + exported so the flag set
 * is guardable. Headless essentials: -p (print), --agent/--model, --strict-mcp-config,
 * stream-json + --verbose (to capture turn.usage while teeing text).
 *
 * --permission-mode acceptEdits is LOAD-BEARING: a scaffolded project ships no
 * .claude/settings.json, so without an explicit mode a headless role agent DEFAULTS
 * TO PROMPTING , and there is no one to answer. A role agent must both WRITE its
 * artifact (feature-spec.json, story stubs, code) AND RUN kit CLIs (its self-check
 * `lakebase-sftdd-response-formatter`, the cycle stamps); acceptEdits auto-accepts
 * both headlessly (verified: Write-tool AND Bash writes land with permission_denials
 * empty and is_error false).
 *
 * Why acceptEdits and NOT bypassPermissions: an enterprise managed-settings policy
 * (/Library/Application Support/ClaudeCode/managed-settings.json) sets
 * `permissions.disableBypassPermissionsMode: "disable"`. When that policy is present,
 * a spawned `claude -p --permission-mode bypassPermissions` is SILENTLY DOWNGRADED to
 * `default` (the child session's init event reports permissionMode "default"), which
 * then auto-DENIES every headless prompt , the exact opposite of what we want. So
 * bypassPermissions is not a stronger acceptEdits in this environment; it is broken.
 * acceptEdits is the strongest mode the policy honors, and it is sufficient. SCOPED to
 * the throwaway, isolated, scaffolded project the drive runs in , this spawns each
 * role agent autonomous within that project, not the operator's session.
 */
declare function claudeBaseArgs(cmd: Extract<DriveCommand, {
    kind: "claude";
}>): string[];
declare function execRunner(cfg: DriveEffectsConfig): CommandRunner;
/** Build a DriveEffectsConfig for a feature (or planning, featureId ""). */
declare function buildCfg(args: ParsedArgs, featureId: string): DriveEffectsConfig;

export { type TurnTranscript, buildCfg, claudeBaseArgs, claudeToolArgs, execRunner };
