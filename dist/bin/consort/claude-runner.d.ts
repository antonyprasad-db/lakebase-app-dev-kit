import { T as TurnKey } from '../../step-key-BxJC8fSh.js';

/** The design-lane roles, in the order a story flows through them. */
type DesignRole = "spec-author" | "architect-reviewer" | "dba" | "test-strategist";
/** What a story has produced so far in the design lane (derived from disk). */
interface StoryDesign {
    /** The Spec Author has drafted this story's acceptance criteria. */
    hasAcs: boolean;
    /** The Architect Reviewer has annotated layers / NFR coverage on the ACs. */
    architectAnnotated: boolean;
    /** This story's per-AC architectural_notes can be PROJECTED deterministically
     *  from the project canon (no architect turn): the feature architecture.json
     *  already exists, the canon is established, and the story is not novel. When
     *  false the architect is dispatched (to author architecture.json on the first
     *  story, or clean a novel story + amend the canon). Only consulted while
     *  architectAnnotated is false. */
    architectProjectable: boolean;
    /** The DBA has produced db-design.json realizing this story's persistence
     *  invariants (the physical schema). Runs after the architect, before the test
     *  strategist. A not-service_backed feature has nothing to realize, so this is
     *  satisfied without a DBA turn (see the probe). */
    dbaDesigned: boolean;
    /** The Test Strategist has produced this story's ordered test list. */
    testListReady: boolean;
    /** The pre-build reflection critic (Navigator, reflect mode) has PASSED this
     *  story's spec + test-list. A missing/failed verdict is not passed: the lane
     *  runs (or re-runs) the critic, and a failed verdict drives the spec-level
     *  smell -> revise-route -> HITL machinery. */
    reflectionPassed: boolean;
    /** The reflect turn produced a readable verdict (pass OR fail). The turn's
     *  deliverable is the verdict file; this is the expectation the driver enforces
     *  so a reflect turn that writes nothing escalates instead of looping. */
    reflectionVerdictWritten: boolean;
}
/** A story's design + gate status, as the driver sees it. */
interface DriveStoryView {
    /** The per-story spec gate has been approved (story is done designing). */
    gateApproved: boolean;
    /** The gate has been surfaced for review (awaiting approval) but not approved. */
    gateSurfaced: boolean;
    design: StoryDesign;
}
/** The single next design-lane action. A later phase maps each to an effect. */
type DriveAction = {
    kind: "invoke-role";
    role: "spec-author";
    mode: "breakdown";
} | {
    kind: "invoke-role";
    role: "ux-designer";
} | {
    kind: "invoke-role";
    role: DesignRole;
    story: string;
} | {
    kind: "invoke-role";
    role: "navigator";
    story: string;
    buildMode: "reflect";
} | {
    kind: "project-architect-notes";
    story: string;
} | {
    kind: "surface-gate";
    story: string;
} | {
    kind: "approve-gate";
    story: string;
} | {
    kind: "design-complete";
};
/** What a story has produced in the build lane (its experiment build). */
interface StoryBuild {
    /** The paired experiment branch was cut. */
    experimentCut: boolean;
    /** A PRIOR experiment for this story was discarded (revise / rebuild-story), so
     *  the upcoming cut is a RE-cut. The paired Lakebase branch of the same
     *  deterministic name may still carry the discarded build's schema, so the
     *  re-cut must re-fork it clean (--reset-stale-branch), mirroring the ci-pr
     *  --reset-stale-branch precedent (Finding 27). */
    experimentDiscarded?: boolean;
    /** The Navigator wrote the (failing) tests for the story. */
    testsWritten: boolean;
    /** The Driver made the tests pass. */
    codeWritten: boolean;
    /** Build-loop granularity for this story. "story" (default) drives one
     *  story-scoped REVIEW + REFACTOR turn (reviewStoryPending / refactorStoryPending);
     *  "ac" / "hybrid-a" drive the per-AC reviewAc / refactorAc cadence. */
    loop?: "ac" | "hybrid-a" | "story";
    /** An AC whose tests are all green but not yet REVIEWed by the Navigator
     *  (against architecture + design guide), or null. Drives the per-AC REVIEW. */
    reviewAc?: string | null;
    /** An AC the Navigator REVIEW asked to refactor, not yet refactored by the
     *  Driver, or null. Drives the per-AC REFACTOR. */
    refactorAc?: string | null;
    /** Story-level ("story" granularity): the whole story is green but not yet
     *  REVIEWed (drives one story-scoped Navigator REVIEW turn). */
    reviewStoryPending?: boolean;
    /** Story-level: the story was REVIEWed with a refactor pending, not yet
     *  refactored (drives one story-scoped Driver REFACTOR turn). */
    refactorStoryPending?: boolean;
    /** An AC whose GREEN verify FAILED and has not yet been assessed, or null.
     *  Drives the reactive Navigator ASSESS turn: flag prior tests the AC
     *  supersedes (-> Driver permissive green) or confirm a genuine regression
     *  (-> escalate). */
    assessGreenAc?: string | null;
    /** An AC whose green-failure the Navigator assessed as a DRIVER-FIXABLE genuine
     *  regression (it recorded a fix directive), with its one repair not yet
     *  consumed, or null. Drives a bounded Driver REPAIR turn (the diagnosis +
     *  directive injected) before the honest-GREEN backstop escalates. */
    repairRegressionAc?: string | null;
    /** An AC whose green-failure the Navigator assessed as a SUPERSESSION (it flagged
     *  prior tests this AC retires in superseded-tests.json), the permissive re-green
     *  not yet consumed, or null. Drives a Driver GREEN-SUPERSEDED turn: the same
     *  honest GREEN as a plain re-green, but LABELED so the recorder writes a distinct
     *  turn dir. That label is what lets replay-build.ts + the corpus-integrity guard
     *  DROP the turn , at replay per-turn verify is trusted, so the assess -> re-green
     *  detour never re-dispatches (symmetric to repair). An un-labeled re-green records
     *  bare and reads as a spurious extra `green` in the kept replay shape. */
    greenSupersededAc?: string | null;
    /** The built story was deployed for the PO's acceptance review. */
    awaitingAcceptance: boolean;
    /** The story's deploy verified (reachable + verify.passed on its experiment
     *  branch). The teeth on acceptance: a story cannot be accepted/merged unless
     *  its deploy proved working software. */
    deployVerified: boolean;
    /** Deploy-verify self-heal: the failure was classified as shared-state
     *  contamination (fails full-suite, passes in isolation) + not yet assessed.
     *  Drives one story-level Navigator ASSESS-DEPLOY turn before re-deploying. */
    refactorVerifyAssessEligible?: boolean;
    refactorVerifyRefactorPending?: boolean;
    deployVerifyAssessEligible?: boolean;
    /** Deploy-verify self-heal: the Navigator assessed + chose a scope set the
     *  Driver has not yet refactored. Drives one Driver SCOPE-DEPLOY turn. */
    deployVerifyRefactorPending?: boolean;
    /** The PO accepted: experiment merged into the feature branch, story done. */
    accepted: boolean;
}
/** A story's full design + gate + build status, as the driver sees it. */
interface StoryView extends DriveStoryView {
    build: StoryBuild;
}
/** The driver's coarse phase: sprint planning, the per-feature streaming, the
 *  per-feature deploy (local working-software check), the promote (PR review +
 *  merge of the feature up to its parent tier), or done. (The fine-grained TDD
 *  phases live in the pipeline state the lane sub-machines read.) */
type DrivePhase = "planning" | "feature" | "deploy" | "promote" | "done";
interface PlanningState {
    /** The Spec Author proposed the sprint's candidate feature breakdown. */
    proposed: boolean;
    /** The Architect t-shirt-sized the candidates (planning/estimates.json), so
     *  the Product Owner can commit against sprint capacity. */
    estimated: boolean;
    /** Policy: skip the Architect's estimation (t-shirt sizing) step entirely
     *  (`--no-sizing`). When set, the machine routes proposed -> author-requests
     *  with no estimate action, and the backlog is projected without sizes. A
     *  config decision threaded from the CLI, NOT derived from disk. */
    skipSizing?: boolean;
    /** The Product Owner committed the sprint backlog (authored a feature-request
     *  per committed feature; sync-backlog projected backlog.json). */
    requestsAuthored: boolean;
    /** Every COMMITTED backlog feature has a t-shirt estimate under its own id
     *  (estimates.json), so sync-backlog can stamp a per-sprint size. Distinct from
     *  `estimated` (the CANDIDATE FP sizing): candidate ids never reconcile to the
     *  committed feature ids drawn from intake, and a re-plan sprint reuses the
     *  standing proposals+candidate-estimates but still commits a NEW feature that
     *  needs sizing. When false (and sizing is not skipped) the machine routes the
     *  Architect's `estimate-committed` turn after author-requests. Absent = treated
     *  as satisfied (legacy states / single-sprint runs that never set it). */
    committedEstimated?: boolean;
    /** The sprint PLAN gate has been approved (human live, or Human Proxy
     *  headless). The HITL checkpoint between planning and execution; a re-plan
     *  the human "passes on" simply re-approves the standing backlog. */
    gateApproved?: boolean;
}
interface DeployState {
    /** The Release Engineer deployed the feature to the target. */
    deployed: boolean;
    /** The PO signed the deploy (working-software) gate. */
    gateApproved: boolean;
    /** Feature-ship deploy-verify self-heal: the feature-level deploy-verify failed
     *  on shared-state contamination (a feature-scope marker was written, not an
     *  escalation) + is not yet assessed. Routes ONE Navigator ASSESS-DEPLOY turn at
     *  feature scope before the deploy gate, mirroring the per-story self-heal. */
    verifyAssessEligible?: boolean;
    /** The Navigator assessed the feature-ship failure + chose a scope set the Driver
     *  has not yet refactored. Routes ONE Driver SCOPE-DEPLOY turn (feature scope). */
    verifyRefactorPending?: boolean;
}
/** The promote phase: take the accepted feature through its PR review (the
 *  lakebase-scm-workflows ladder) and MERGE it up into its parent tier (e.g.
 *  staging) in git + Lakebase, so the next sprint forks from a populated parent.
 *  A "release into a long-running branch" (the deterministic promote/merge). The
 *  SCM ladder (feature-claimed -> pr-ready -> ci-green -> merged) backs the first
 *  three; the `promote` HITL gate is the human's PR acceptance, BEFORE the merge. */
interface PromoteState {
    /** prepare-pr done: the feature branch is pushed + a PR is open (scm pr-ready). */
    prReady: boolean;
    /** wait-ci done: the PR's regression gate is green (scm ci-green). */
    ciGreen: boolean;
    /** The HITL `promote` gate is approved: the human/PO accepted the PR. The
     *  approval comes AFTER ci-green and BEFORE the merge. */
    prApproved: boolean;
    /** merge done: the feature was merged (released) into the parent tier in git +
     *  Lakebase and the downstream migrate ran (scm merged). */
    merged: boolean;
}
/** A blocking problem an agent/step surfaced, derived from disk (escalation
 *  files + blocking smells). Structural copy of escalation.ts's Escalation so the
 *  pure state machine stays fs-free. While one is unresolved the driver routes to
 *  raise-to-hil before any other transition. */
interface DriveEscalation {
    id: string;
    source: string;
    reason: string;
    story_id?: string;
    /** revise-routing: set by the probe when this is a SPEC-level smell
     *  whose one-revise-per-(smell,story) budget is not yet spent. When present,
     *  nextTransition routes to `revise-route` (send the owning author the verdict,
     *  re-gate, resume) instead of the terminal `raise-to-hil`. Absent => hard halt
     *  (build-level smell, an explicit escalation file, or the revise budget spent). */
    routable?: {
        story: string;
        owning_role: "spec-author" | "test-strategist" | "architect-reviewer";
        gate: "spec" | "test_list" | "architecture";
    };
}
interface DriveState {
    phase: DrivePhase;
    planning?: PlanningState;
    breakdownDone: boolean;
    storyOrder: string[];
    stories: Record<string, StoryView>;
    /** The story the single build lane is on, or null when idle. */
    buildActive: string | null;
    deploy?: DeployState;
    /** The promote phase's progress (PR review + merge to parent). */
    promote?: PromoteState;
    /** UI track on (set from cfg.uiTrack at readState): gates the UX Designer step. */
    uiTrack?: boolean;
    /** The project design guide exists (design-guide.json on disk). */
    designGuideReady?: boolean;
    /** An unresolved blocking escalation (failed-green run, blocking smell, verify
     *  fail). When set, nextTransition pre-empts everything with raise-to-hil. */
    escalation?: DriveEscalation | null;
}
type WorkflowAction = DriveAction | {
    kind: "invoke-role";
    role: "spec-author";
    mode: "propose";
} | {
    kind: "invoke-role";
    role: "architect-reviewer";
    mode: "estimate";
} | {
    kind: "invoke-role";
    role: "architect-reviewer";
    mode: "estimate-committed";
} | {
    kind: "invoke-role";
    role: "product-owner";
    mode: "author-requests";
} | {
    kind: "approve-plan-gate";
} | {
    kind: "planning-complete";
} | {
    kind: "dispatch";
    story: string;
} | {
    kind: "cut-experiment";
    story: string;
    resetStaleBranch?: boolean;
} | {
    kind: "invoke-role";
    role: "navigator" | "driver";
    story: string;
    buildMode?: "review" | "refactor" | "assess" | "repair" | "assess-deploy" | "refactor-deploy" | "assess-refactor" | "refactor-superseded" | "green-superseded";
    ac?: string;
} | {
    kind: "deploy-verify-heal";
    role: "navigator" | "driver";
    mode: "assess-deploy" | "refactor-deploy";
} | {
    kind: "await-acceptance";
    story: string;
} | {
    kind: "accept";
    story: string;
} | {
    kind: "complete";
    story: string;
} | {
    kind: "feature-complete";
} | {
    kind: "deploy";
} | {
    kind: "approve-deploy-gate";
} | {
    kind: "deploy-complete";
} | {
    kind: "prepare-pr";
} | {
    kind: "wait-ci";
} | {
    kind: "approve-promote-gate";
} | {
    kind: "merge";
} | {
    kind: "raise-to-hil";
    reason: string;
    source: string;
    story?: string;
} | {
    kind: "revise-route";
    story: string;
    role: "spec-author" | "test-strategist" | "architect-reviewer";
    gate: "spec" | "test_list" | "architecture";
    reason: string;
    source: string;
} | {
    kind: "done";
};

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
    consortDir: string;
    featureId: string;
    runner: CommandRunner;
    /** Resolve a role's model (per-project override -> recommended -> inherit). */
    modelForRole(role: string): string;
    /** Unified config: resolve the model for a role+turn (model tiering). A per-turn
     *  `model` map entry (e.g. driver GREEN on haiku) wins for that turn; absent, the
     *  role's base model applies. When unset, the caller falls back to modelForRole. */
    modelForTurn?(role: string, turn?: TurnKey): string;
    /** Approver name for headless gate approvals (the Human Proxy). */
    approver?: string;
    /** Sprint name, threaded to the sprint plan gate in the planning phase. */
    sprintName?: string;
    /** OPTIONAL fresh-state reader for the executor's post-turn `state-derived` re-derive. A turn
     *  whose manifest routes `state-derived` has the executor re-derive the next action from disk
     *  (executor-dispatch phase 7). By default that uses readDriveStateFromDisk (the FEATURE probe),
     *  which is correct for a feature drive. But a PLANNING drive (drivePlanning) reads state through
     *  deriveSprintPlanningState , its DriveState carries phase:"planning", which nextTransition needs
     *  to route propose->estimate->author-requests. When this is set, the executor re-derives through
     *  it INSTEAD of the feature probe, so the executor's routing authority matches the drive's own
     *  readState (single source). Absent => the feature reader, byte-identical to before. */
    readFreshDriveState?(): DriveState;
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
    effortForTurn?(role: string, turn?: TurnKey): string;
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
    taskSuffix?(role: string, turn?: TurnKey): string;
    /** contextPackSuffix: extra pre-extracted CONTEXT appended to a build turn's
     *  task, BEFORE the terse suffix, so it reads as context, not a trailing order.
     *  The inject-more/scan-less lever (module map, code snippets, exact refs).
     *  Return "" for no-op. */
    contextPackSuffix?(role: string, turn?: TurnKey): string;
    /** allowedToolsForRole/disallowedToolsForRole: per-role tool-scope restriction
     *  (--allowed-tools / --disallowed-tools), the cap-what-the-agent-scans lever.
     *  Return undefined (or an empty list) to leave the tool scope unrestricted. */
    allowedToolsForRole?(role: string): string[] | undefined;
    disallowedToolsForRole?(role: string): string[] | undefined;
    /** OPT-IN (default off): route an action's command assembly through its step
     *  manifest (commandsFromManifest) when one matches, instead of the legacy
     *  per-role branch of commandsForAction. The two are golden-equivalent per
     *  migrated action (byte-identical DriveCommand[]), so this changes nothing
     *  observable , it is the migration switch that lets a legacy branch be retired
     *  once its manifest + golden test are proven. Unset => the legacy path runs. */
    useManifestSteps?: boolean;
    onAction?(action: WorkflowAction, iteration: number): void;
    /** OPTIONAL routing-decision observability hook, threaded to the loop's DriveEffects. Fires per
     *  iteration with the action + the DriveState that chose it (the routing "why"). Observational. */
    onRoutingDecision?(action: WorkflowAction, state: DriveState, iteration: number, source: "nextTransition" | "bounded" | "contract"): void;
    /** OPTIONAL (RECORD lane): read + clear the just-completed live turn's transcript (prompt + final
     *  reasoning + tools) so the executor's ReplayRecorderWrapper persists it alongside the recorded
     *  delta. Supplied by the CLI (takeLastAgentTranscript) only when a RECORD_DIR capture is active;
     *  absent on a normal drive (the recorder then records the delta with no transcript). Typed loosely
     *  (returns the recorder's RecordedTranscript) to avoid a runtime edge onto the runner from here. */
    takeTranscript?(): {
        prompt: string;
        role?: string;
        model?: string;
        finalText: string;
        tools: string[];
    } | undefined;
}

interface TurnUsage {
    /** The turn's context size: input tokens the model processed this turn. */
    inputTokens: number;
    /** Tokens the model generated this turn. */
    outputTokens: number;
    /** Prompt-cache tokens read (warm-resume reuse), if reported. */
    cacheReadTokens?: number;
    /** Prompt-cache tokens written this turn, if reported. */
    cacheCreationTokens?: number;
    /** Dollar cost of the turn, if reported. */
    costUsd?: number;
    /** Agent-side turn count the CLI reports on the result event (`num_turns`), if present. A
     *  one-shot design turn is ~a handful; a retry-heavy / thrashing turn is many , the signal
     *  that distinguishes "slow because big" from "slow because it looped". */
    numTurns?: number;
    /** The CLI-reported wall-clock for the whole turn (`duration_ms`), if present. The agent's
     *  own measure, distinct from the orchestrator's outer step timer. */
    durationMs?: number;
}

interface ParsedArgs {
    feature?: string;
    sprint?: string;
    projectDir?: string;
    consortDir?: string;
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
declare function spawnCmd(bin: string, args: string[], cwd: string): Promise<void>;
/**
 * Spawn a `claude -p --output-format stream-json --verbose` turn, TEE the
 * human-readable assistant text to stderr (so the live console still shows the
 * agent working, not raw JSON), and return the turn's usage from the terminal
 * `result` event , the per-turn CONTEXT SIZE (input_tokens) + output + cache +
 * cost. stderr is inherited so claude's own errors surface. Usage parsing is
 * best-effort: a missing result event yields undefined (never breaks the turn).
 */
/** A claude turn that exited non-zero. `promptTooLong` flags the recoverable
 *  context-overflow case: the turn itself ballooned past the model window
 *  WITHIN the turn (many tool calls in one shot), the "Prompt is too long"
 *  failure the resume-time context guard cannot pre-empt. The runner retries
 *  this case on a FRESH session; any other non-zero exit is a hard failure. */
declare class ClaudeTurnError extends Error {
    readonly promptTooLong: boolean;
    /** The turn's output matched a transient API/network failure (connection
     *  dropped, overloaded, rate-limited, 5xx), so re-running it may succeed. */
    readonly transient: boolean;
    constructor(message: string, promptTooLong: boolean, 
    /** The turn's output matched a transient API/network failure (connection
     *  dropped, overloaded, rate-limited, 5xx), so re-running it may succeed. */
    transient?: boolean);
}
/** A replay lane (LAKEBASE_SFTDD_REPLAY_DIR / _REPLAY_BUILD_DIR) was told to
 *  reproduce a turn the corpus has no artifact for. A replay is a RECORDING: it
 *  must never fall through to a live agent (that would let an agent "take over"
 *  a run meant to be deterministic, and silently mask a broken/incomplete
 *  corpus). So a miss is a hard, loud failure that names the missing artifact.
 *  Almost always the corpus is missing a file (e.g. a `.gitignore` glob dropped
 *  it) , put the artifact in the right place, do not run the model. */
declare class ReplayCorpusMissError extends Error {
    constructor(message: string);
}
/** FEIP-8006: a role turn completed but its expected artifact never landed under
 *  the project's `.sftdd/`. The subagent almost always resolved the project root
 *  wrong and wrote outside it (e.g. `$HOME/<somewhere>`), so a downstream
 *  consuming effect would otherwise crash reading the absent file, with a cryptic,
 *  MISATTRIBUTED error that blames the wrong step. We fail loud + attributed at the
 *  producing role instead, naming the role, the artifact, and where we looked. */
declare class ArtifactOutOfRootError extends Error {
    readonly role: string;
    readonly label: string;
    readonly anyOf: string[];
    readonly consortDir: string;
    /** FEIP-8038: the known malformed-sibling root we also checked (+ tried to
     *  relocate from). Named so the human knows exactly where to look. */
    readonly checkedSibling?: string | undefined;
    constructor(role: string, label: string, anyOf: string[], consortDir: string, 
    /** FEIP-8038: the known malformed-sibling root we also checked (+ tried to
     *  relocate from). Named so the human knows exactly where to look. */
    checkedSibling?: string | undefined);
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
declare function takeLastAgentTranscript(): TurnTranscript | undefined;
/** PEEK the last turn's transcript WITHOUT clearing it , for an intermediate consumer (the
 *  ClaudeStepAgent reads finalText for its lastResult) that must NOT rob the recorder wrapper's
 *  take() of the transcript. The take()-clears contract is a single-consumer design; when TWO
 *  consumers run per turn (the agent's lastResult + the record wrapper), the earlier one MUST peek,
 *  or the wrapper gets undefined and transcript.md is silently never written (the bug this fixes:
 *  every executor-dispatched agent turn lost its transcript to the double-consume race). The record
 *  wrapper remains the sole take()-clearer, at end of turn. */
declare function peekLastAgentTranscript(): TurnTranscript | undefined;
declare function spawnClaudeStreaming(args: string[], cwd: string): Promise<TurnUsage | undefined>;
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
 * --setting-sources project is LOAD-BEARING: headless `claude -p` does NOT load a
 * directory's project settings (incl. its `.claude/agents/*.md` role definitions) by
 * default, so `--agent <role>` fails with "agent not found" unless project settings are
 * explicitly sourced. The kit's role agents live at `<projectDir>/.claude/agents/`
 * (laid down by the scaffolder's deployClaudeAgents, or into a throwaway workspace for a
 * lean live run); `--setting-sources project` is what makes `--agent spec-author` /
 * `--agent ux-designer` / ... resolve. (Verified: the child init event's `agents` list
 * includes the role only when this flag + the .claude/agents file are both present.)
 *
 * --permission-mode acceptEdits is LOAD-BEARING: a scaffolded project ships no
 * .claude/settings.json, so without an explicit mode a headless role agent DEFAULTS
 * TO PROMPTING , and there is no one to answer. A role agent must both WRITE its
 * artifact (feature-spec.json, story stubs, code) AND RUN kit CLIs (its self-check
 * `consort-response-formatter`, the cycle stamps); acceptEdits auto-accepts
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

export { ArtifactOutOfRootError, ClaudeTurnError, type ParsedArgs, ReplayCorpusMissError, type TurnTranscript, buildCfg, claudeBaseArgs, claudeToolArgs, execRunner, peekLastAgentTranscript, spawnClaudeStreaming, spawnCmd, takeLastAgentTranscript };
