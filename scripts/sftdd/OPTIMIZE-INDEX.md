# Optimize harness — index (where things are + what they do)

## ★ ROOT CAUSE (FIXED c1c4a7f1): design lane stalled at feature-complete with an EMPTY pipeline ★
Symptom (was): after breakdown (+ ux-designer), the drive reported `feature-complete` with 0 per-story handoffs (architect/dba/test-strategist never reached); pipeline.json had no stories. NOT a scenario/kit bug.
CAUSE: `makeLiveSpawnTurn` (optimize-live.ts) used to run ONLY the `claude` command and DROP the turn's appendix. spec-author BREAKDOWN's appendix includes `sync-breakdown` (orchestrator-effects.ts:1356), which is LOAD-BEARING: it projects pipeline.json from the stories/ stubs. Dropping it => empty pipeline => nextDesignAction's per-story loop empty => design-complete => feature-complete. (recordWinner restored the artifact but not the pipeline.) Proven: manual `sync-breakdown` after a swept breakdown -> `+3; 3 tracked` and the drive immediately advanced to the per-story spec-author turn.
FIX (DONE, c1c4a7f1, option b): `makeLiveSpawnTurn` now runs claude + the load-bearing substrate (cli/sync-backlog/set-phase), filtering out ONLY `verify-artifact` (the exit-3 ArtifactOutOfRootError thrower; the harness gates the artifact itself via evaluateDesignGate). The design snapshot restores the whole .sftdd between trials, so substrate mutations (pipeline.json) are undone per candidate. advanceOne also runs the full list (c8be6128). Test: optimize-live.test.ts "runs the claude turn AND its load-bearing substrate ... EXCLUDING only verify-artifact".

## Kit bin names (exact , do not guess)
- pipeline CLI = `lakebase-sftdd-pipeline` (PIPELINE_BIN, orchestrator-effects.ts:1095). Subcommands: `sync-breakdown`, `reset-breakdown`, `accept`, ... Invoke via the PROJECT's `./scripts/lk lakebase-sftdd-pipeline <sub> --feature <F> --tdd-dir .sftdd` (run from the project dir; NOT from the kit dir).
- there is NO `lakebase-sftdd-story-pipeline` bin (that name errors "unknown bin"). The source file is story-pipeline.ts but the bin is `lakebase-sftdd-pipeline`.
- design steps -> pipeline: breakdown writes stories/<S>/story.{json,md} + feature-spec.json; sync-breakdown reads storiesDir subdirs (storiesDirOf) and setStoryStatus "designing" for each -> pipeline.json.stories. The per-story design loop (architect/dba/test-strategist) only runs when pipeline.stories is non-empty.

## Archive report.md extraction (fixed)
archive-optimize-results.sh's report.md used `sed -n '/# Champion-walk.../,/^$/p'` which stopped at the blank line right after the header (saving only the title). Now uses awk: from the header through the LAST `^\|` table row. summary.json (per-candidate median/gate/winner, computed independently) was always complete; only report.md was truncated.


The per-handoff optimization re-record ("champion walk"): at each role handoff, run
candidate config/content levers from an identical snapshot, keep the fastest
gate-passing turn, record only winners, emit a before/after report. ~90% orchestration
over existing drive seams + a thin harness.

## Runtime flow (who calls whom)

```
optimize-scenario.sh (runbook)
  └─ pins local kit (cache symlink -> this repo), sets RECORD_DIR=$SCEN, NO LAKEBASE_KIT_DIR
  └─ lk lakebase-sftdd-optimize  →  dist/scripts/sftdd/optimize.cli.js
       ├─ SINGLE-handoff (default): planNextAction → position on ONE handoff →
       │    candidates = --candidates spec OR defaultLaneCandidates(handoff) fallback →
       │    runChampionWalk([handoff], candidates)
       └─ LANE sweep (--sweep-lane design|build): runLaneSweep →
            positionToNextHandoff (advance, performing substrate steps) →
            per handoff: runChampionWalk([h], defaultLaneCandidates(h), alwaysAdvance:true)

runChampionWalk (optimize-harness.ts)  ← the engine, PURE over injected deps
  for each handoff:
    snap = deps.snapshot(handoff)                       ← optimize-live makeChampionWalkDeps
    for each candidate, for each trial:
      try { deps.runTrial(...) } catch { gatePassed:false }   ← #1 fix: crash = DQ, not fatal
      snap.restore()                                    ← back to identical pre-turn state
    winner = selectWinner(outcomes)
    if (!proposeOnly || alwaysAdvance) deps.recordWinner(winner)  ← #2 fix: lane always advances

deps.runTrial (optimize-live.ts):
  applyCandidate (config/env/overlay) → ctx.spawnTurn({record:false}) → gate → writeTrialRecord
  (design trials snapshot .sftdd → TrialResult.artifactsRef; winner's fastest passing ref
   is what recordWinner RESTORES to advance — no re-spawn. commit d22f1cd1.)
deps.spawnTurn = makeLiveSpawnTurn:
  record?RECORD_DIR=recordDir:delete RECORD_DIR  ← #3 fix: only winners record
  → buildCfg → commandsFor(handoff.action) → run all cmds EXCEPT verify-artifact (real `claude -p`
    + load-bearing substrate like sync-breakdown; c1c4a7f1)
    ← PINNED-TURN (12a55dd2): the spawn runs the handoff's OWN action (never planNextAction,
      which would re-plan to the NEXT role = wrong-role turn). verify-artifact is excluded
      (it throws ArtifactOutOfRootError → phantom drive main() → exit 3); sync-breakdown etc.
      are KEPT (load-bearing , they advance the pipeline). HandoffPlan carries `action`.
```
NOTE: the phantom drive main() came from tsup `splitting:false` inlining drive.cli.ts into
optimize.cli.js; fixed by extracting the seams to drive-runner.ts (no main()), commit
96b1ea98. See memory `reference_tsup_inlined_isclientry_double_main`.

## Exit-3 arc (RESOLVED , provenance only)

The first ~5 live runs all died exit 3. Root cause was TWO things, both fixed:
(1) the spawn called `planNextAction` and re-planned to the NEXT role once the artifact
landed (wrong-role turn) → its `verify-artifact` threw ArtifactOutOfRootError; fixed by
PINNED-TURN (`12a55dd2`) , the spawn runs the handoff's OWN action, never re-plans.
(2) tsup `splitting:false` inlined drive.cli's `if(isCliEntry)main()` into optimize.cli.js
→ a PHANTOM drive `main()` fired every turn and returned 3 on that throw; fixed by
extracting the seams to drive-runner.ts (no main()), `96b1ea98`.
Then a SEPARATE issue: the pinned spawn ran claude-ONLY, dropping the load-bearing
sync-breakdown → empty pipeline → feature-complete stall (see the ROOT CAUSE section at
top; fixed c1c4a7f1 by running all cmds except verify-artifact). All resolved; not open work.

## THE LOOP I RUN (rinse-repeat, one role at a time, start to end) — FOLLOW THIS EXACTLY

Uniform for every role the orchestrator points at, from spec-author onward. No special-
casing, no shortcuts, no `--sweep-lane`, no `--from`, no `--propose-only`.

Per role:
1. **STUDY + ADVANCE in ONE run** (single-handoff, NON-propose-only):
   `optimize-scenario.sh --scenario stockflow-optimize --project-dir $P --feature F1-stock-visibility --trials 1`
   (drop --trials to sweep with more trials only if a result is ambiguous). This sweeps
   all defaultLaneCandidates (baseline + cheaper-model + effort-low + scan-tight), gates
   each, keeps the fastest passing, and `recordWinner` RESTORES the winning trial's actual
   artifacts to the project = the advance. `planNextAction` then points at the next role.
   - **NEVER `--propose-only` in this loop.** Propose-only ranks but does NOT advance and the
     between-trial restore WIPES the role's output -> no artifact for the next role. (That
     was the mistake: spec-author was left with no spec on disk.)
2. **READ the report** (`# Champion-walk optimization report` table + per-candidate
   `experiments/<role>/*/trial-*/result.json`). Winner = fastest gate-passing.
3. **KEEP + COMMIT the recorded winner artifacts (do NOT scrub):** the runbook exports
   RECORD_DIR=$SCEN (examples/sftdd-scenarios/stockflow-optimize), so recordWinner writes
   the winning turn's .sftdd output into recorded-artifacts/. This IS the REPLAY CORPUS ,
   `git add` + commit it. A future run sets LAKEBASE_SFTDD_REPLAY_DIR to that corpus to
   FAST-FORWARD past already-recorded roles (replayDesignTurn restores them, no re-spawn).
   Earlier I scrubbed it (git checkout+clean) , that was the mistake; it deleted the very
   corpus that avoids re-running. Only the PROJECT's experiments/ scratch is disposable.
4. **APPLY the winner INTO THE KIT** (the mandatory pause before the next role):
   - If a CONFIG lever won (model/effort, scalar or per-turn/step): `applyWinnerToOverlay`
     writes it into `optimized-defaults.json` (DATA, deep-merged by defaultSftddConfig ,
     NEVER a TS source rewrite; that is the single-source rule). See optimize-apply.ts.
   - If a CONTENT lever won (scan-tight/taskSuffix/tool-scope): `applyAgentMdLevers` edits
     the role's `skills/consort/agents/<role>.md` (directive / `tools:` frontmatter).
   - If the winner is BASELINE (no lever beat it): nothing to apply; note it and move on.
   - `npm run build` (inlines optimized-defaults.json into dist) + `git add -f dist` +
     `git add <the overlay / agent md>` + LOCAL commit (never push).
5. **MOVE FORWARD:** the drive already advanced in step 1; the next `optimize-scenario.sh`
   run positions on the next role automatically. Repeat 1-5 down the design lane
   (spec-author -> architect-reviewer[or projected, no turn] -> dba -> test-strategist ->
   ux-designer/reflect -> gate) then the build lane, to the end.

Run each sweep BACKGROUNDED (nohup) + Monitor the log for the report/winner/failure; a
design sweep is hermetic-ish (no branch forks) but spends tokens. Project + logs tracked in
/tmp/optimize-current-project.txt + /tmp/optimize-current-role-log.txt + /tmp/optimize-role-pid.txt.

APPLIED SO FAR (via optimized-defaults.json overlay, deep-merged by defaultSftddConfig):
spec-author BREAKDOWN = haiku+low (~24-44%); ux-designer = scan-tight (deny Grep/Glob,
-20%; prompt-bound role , scanning was the cost, beat even the opus upgrade). Winners are
DATA in optimized-defaults.json (never a TS rewrite); rebuild inlines them into dist.

## The orchestrator's normal progression (what the sweep FOLLOWS, never bypasses)

The sweep follows the orchestrator's own state machine role by role. It does NOT skip,
reorder, or batch roles. `planNextAction(cfg)` (orchestrator-effects.ts:1782) returns the
ONE next action from disk state; `commandsForAction` builds its command list; after a
role's artifact lands, the machine's next call returns the next role. Preserving a winner's
artifacts on disk (recordWinner) is exactly how the machine hands them to the next role.

**Design lane** — `nextDesignAction` (orchestrator-drive.ts:118), `DesignRole` order =
spec-author → architect-reviewer → dba → test-strategist (line 19):
1. `spec-author` mode=breakdown (feature-level, until `breakdownDone`)
2. `ux-designer` once (UI track, `uxDesignerPending`, before any story architected)
3. Per story, gated on the story's design flags:
   - `!hasAcs` → spec-author (story ACs)
   - `!architectAnnotated` → if `architectProjectable` (maps cleanly to canon) →
     `project-architect-notes` (**NO LLM turn — nothing to sweep for architect here**);
     else → architect-reviewer LLM turn. ← this is the "architect may be projected" case.
   - `!dbaDesigned` → dba (skipped w/o a turn for a non-service_backed feature)
   - `!testListReady` → test-strategist
   - `!reflectionPassed` → navigator buildMode=reflect (design-lane critic; baseline-only)
   - `!gateSurfaced` → surface-gate; then approve-gate
4. all stories gateApproved → `design-complete`

**Where the candidate levers apply** — `commandsForAction` invoke-role (orchestrator-
effects.ts:1241): the `claude` command carries `model` (modelForTurn/modelForRole),
`effort` (effortForTurn), `allowedTools`/`disallowedTools`, and
`task = roleTask(action,...) + contextPackSuffix + AGENT_TERSE_SUFFIX + taskSuffix`.
`roleTask`/`roleTaskBody` (~523/569) assemble the role's INPUTS + injected guidance from
the upstream artifacts on disk. A candidate varies ONLY these knobs (model/effort/tool-
scope/prompt-suffix); the role's output artifact is the inter-role channel the machine
feeds to the next role. So "retry the role across levers, keep the cheapest same-quality
output, hand its artifacts to the next role" == sweep these knobs, gate the artifact, let
recordWinner persist the winner's artifacts, then let planNextAction advance.

## Winner is RESTORED not re-run — but passing artifacts go to /tmp, not experiments/ (FLAW)

CORRECTION to an earlier wrong note: the winner is NOT re-created. `runTrial`
(optimize-live.ts:174) already captures each PASSING design trial's `.sftdd` output via
`snapshotDesign` BEFORE the between-trial `restore()` wipes it, stashes it as the trial's
`artifactsRef`, and `recordWinner` (optimize-live.ts:201) `restore()`s that exact snapshot —
the winner's real, measured, gated output, NO re-run (task #510). So the artifacts ARE
produced and the winning one IS reused verbatim.

THE FLAW (user-identified): `snapshotDesign` (optimize-snapshot.ts:34) copies `.sftdd` into
`mkdtempSync(tmpdir(), "optimize-design-snap-")` — a SYSTEM TEMP dir held only by an
in-memory `DesignSnapshot` handle, `dispose()`d after the handoff resolves. Consequences:
1. Passing artifacts exist during the run but are UNREACHABLE for inspection (temp path is
   recorded nowhere; disposed after). You cannot audit WHY haiku+low passed but solo-haiku
   failed — the two artifacts are in disposed /tmp dirs.
2. `result.json`'s `artifactsRef` serializes to `{}` (the handle's methods don't survive
   JSON) — which looks like "no capture" but is really "capture is a live temp handle."
3. Every NON-winning candidate's passing output is discarded — no side-by-side comparison,
   no reusable corpus; a re-sweep re-derives everything.

ARTIFACT CONTINUITY is the deeper cost (not just auditing): the lane advances on EXACTLY ONE
live artifact. `recordWinner` restores the winner's `.sftdd` snapshot and `planNextAction`
positions the next role on it (e.g. after architect-reviewer, dba's task literally reads
`architecture.json`). Because every RUNNER-UP's passing artifact was disposed to /tmp, there
is NO fallback artifact on disk. So "reject the winner + fall back to the 2nd-best (or to
opus baseline)" is IMPOSSIBLE without re-running that fallback — the only surviving artifact
IS the winner's. This bit us live: architect-reviewer's winner (haiku+e-low, 50% faster,
semantic gate PASS) was structurally degraded (dropped every per-NFR fitness_function + 2
NFRs vs the reference), but rejecting it left the drive sitting on dba with no complete
architecture.json to hand forward. You cannot pick up the next step without an artifact, and
the only one that survived is the one you want to reject.

THE FIX (LANDED): `captureDesignArtifacts({sftddDir, destDir})` + `restoreDesignArtifacts(
{sftddDir, ref})` in optimize-snapshot.ts write each PASSING design trial's actual `.sftdd`
output to `experiments/<handoff>/<candidate>/trial-N/artifacts/` (durable, not /tmp) and
return a plain `{path}` `DesignArtifactRef` (JSON-serializable, survives result.json).
runTrial (optimize-live.ts) captures into the trial dir; recordWinner restores from the ref's
path (NO re-run, NO dispose — the capture stays for audit). Tests: optimize-snapshot.test.ts
(durable-capture group). This delivers:
- AUDIT: diff any candidate's architecture.json vs the reference with no re-run.
- CONTINUITY / FALLBACK: a rejected winner can be swapped for a structurally-complete
  runner-up by restoring ITS retained trial dir (restoreDesignArtifacts) — the next role
  proceeds, no re-run. (The reject-and-fallback SELECTION policy in the harness is a follow-up;
  the primitive it needs now exists.)
- REUSABLE CORPUS: every candidate's output persists under experiments/ until
  disposeExperiments tears down the scratch tree at end of run.

## RESOLVED (commit follows): architecture.json nfr shape drift + fitness_function enforcement

Reconciled to ONE source of truth = the shape the architect prompt teaches, the
reference uses, and the runtime rubric reads (the RICH shape). architecture.schema.json nfr
item now: defines `id`/`brief`/`fitness_function`, `category` is a free string (was a 6-value
enum that excluded the reference's durability/correctness/testability/usability/
configurability), requires one of `brief`/`requirement` via `anyOf` (legacy `requirement`
kept for back-compat). The canonical stockflow reference now CONFORMS (regression-locked by
a test). ENFORCEMENT: checkArchitect (response-formatter.ts) now hard-flags any declared NFR
missing a non-empty `fitness_function` — closing the hole that let the cheap-model architect
winner drop every fitness_function + still pass the ≥0.85 semantic gate. Tests: sftdd-
artifact-conformance (rich/lean/neither/reference-conforms) + sftdd-response-formatter
(fitness_function flag/pass). The historical detail below is kept for context.

### Historical: how the drift presented (auditing the architect winner)
TWO nfr shapes existed:
- RICH (what the canonical stockflow reference architecture.json uses, and what the semantic
  gate + downstream roles were written around): `{id, category, applies_to, brief, brief_ref,
  fitness_function, hil_status}`, category values like "durability".
- LEAN (what architecture.schema.json actually validates): nfr item `required:[category,
  requirement]`, `additionalProperties:false`, category enum = performance|scalability|
  security|observability|operability|resilience, props = category/requirement/notes/applies_to/
  hil_status/brief_ref. NO `id`, `brief`, or `fitness_function`.
`checkArtifactConformance("architecture.json", <reference>)` = FALSE (reference nfrs use
`brief` not `requirement`, `fitness_function`/`id` as additional props, category "durability"
not in enum). Consumers read a MIX with `??` fallbacks: nfr-coverage keys on `brief_ref`
(artifact-conformance.ts:348/389); serviceBacked reads `brief??requirement??notes`
(gate-conformance-guard.ts:349); the context rubric reads `id`+`brief` (orchestrator-
effects.ts:271). So the lean schema and the rich reference disagree, and nothing enforces
`fitness_function` — which is why the cheap-model architect winner (lean shape, no
fitness_function, 2 fewer NFRs) conformed + passed the ≥0.85 semantic gate while dropping
machine-checkable content the reference carries.
DO NOT bolt `fitness_function` onto the lean schema in isolation — that builds on sand.
This needs a dedicated one-source-of-truth reconciliation: pick the canonical nfr shape
(the rich one the reference + roles already use is the likely target), align architecture.
schema.json to it, make `fitness_function` a defined (and for service_backed, required)
property, add the architect self-check + design-gate enforcement, and re-validate the
reference conforms. THEN the architect turn also needs a structural-completeness check
(invariant parity + fitness_function presence) beside the semantic score, since ≥0.85 prose
similarity alone accepted the degraded winner. Until then: do NOT apply a cheap-model architect
winner on the semantic gate alone; audit its recorded architecture.json for invariant +
fitness_function parity first (now possible via the durable capture above).

## Session isolation per trial (what makes candidate timings comparable)

Each DESIGN trial is a FRESH `claude -p` subprocess. There is NO session resumption in the
design spawn path — grep the whole chain (optimize-live.ts → orchestrator-effects.ts →
drive.cli.ts) for `--resume`/`--continue`/`sessionId`/`-r`: nothing. `makeLiveSpawnTurn`
calls `seams.buildCfg(featureId)` anew per candidate/trial (optimize-live.ts:321), and the
command is `claude -p "<task>" --agent <role> --model <m> --strict-mcp-config` — fresh
context every time. Between trials the harness restores the `.sftdd` design snapshot
(`snap.restore()`, optimize-harness.ts:184), so every candidate starts from the IDENTICAL
on-disk inputs; only the model/effort/tool lever differs. That equal-work-from-equal-state
is what makes the wall-clock numbers comparable.
- CAVEAT: `resumeKey` / `buildSessionScope` DO exist (DriveCommand.resumeKey, orchestrator-
  effects.ts:54,1255) — but that is the BUILD lane deliberately WARMING one `claude -p`
  session across a single story's RED→GREEN→REVIEW cycles (`buildSessionScope`, "resume
  their claude -p session PER STORY"). Design turns are single, isolated, fresh `-p`
  invocations. When the sweep reaches the build lane, per-story session warmth is a
  legitimate shared inheritance for each build candidate (snapshot-restored identically).

## Gotcha: role self-check ≠ the harness gate; the agent flies blind on structure in headless

In headless `--permission-mode acceptEdits`, file Edit/Write is auto-approved but **Bash is
NOT**. A design role's OWN structural self-check runs `./scripts/lk lakebase-sftdd-response-
formatter ...` (a Bash cmd), so it is DENIED — the agent logs "self-check command needs
approval which I can't grant" and returns without validating its own artifact structure.
This is expected and NOT a run failure: the harness re-checks the artifact itself via
`evaluateDesignGate` (optimize-gate.ts) right after the timed turn, which runs the SAME
response-formatter CHECKERS + the design gate deterministically. So the harness gate — not
the agent's in-turn self-check — is the real quality backstop under headless. Consequence:
a schema/prompt contradiction the self-check would normally catch surfaces only at the
harness gate (as a uniform `gatePassed:false`), which is exactly how the layer drift below
presented.

## Resolved landmine: ac.schema `layer` prose-vs-schema drift (fixed 785353d2)

`ac.schema.json` listed `layer` in `required`, but `layer` is the ARCHITECT-REVIEWER's
field (schema desc: "Assigned by Architect Reviewer in phase 7.1"); spec-author.md forbids
the spec-author writing it. The spec-author's conformance self-check validates each AC
against the full ac.schema, so it demanded a field the author is told not to write. On the
interactive drive the architect ran next and filled it (masked). But a spec-author-ONLY run
(the optimize champion-walk sweeping just that role, architect not yet run) DQ'd EVERY
candidate identically on `must have required property 'layer'` → harness fell back to
baseline → `0.0s / 1 candidate: baseline` report (a bogus non-ranking). Fix: drop `layer`
from `required` (keep as optional API|E2E|Infra enum) in BOTH tracked copies (source +
committed dist). Architect self-check (checkArchitect, response-formatter.ts:159) + the
design gate (architectAnnotated keys on architectural_notes + architecture.json, NOT bare
layer; serviceBackedReason reads layer optionally) still require it at phase 7.1, so no
hole. GENERAL LESSON: a single-role sweep exercises each role IN ISOLATION (upstream roles
that normally fill later-required fields have NOT run), so any "later role fills this
required field" schema coupling shows up as a uniform-DQ baseline-fallback. When a sweep
reports 0.0s baseline-only with candidate dirs present, read a trial `result.json`
`gateReason` FIRST — do not treat baseline as a real winner.

## Source modules (scripts/sftdd/)

| File | Lines | What it is |
|---|---|---|
| `optimize.cli.ts` | 382 | The `lakebase-sftdd-optimize` bin. Arg/sweep parsing (`parseOptimizeArgs`, `parseSweepSpec`), `actionToHandoffPlan`, `isBuildHandoff`, `buildCtxForHandoff`, single-handoff + `--sweep-lane` orchestration. Reads `RECORD_DIR` once + clears it (threads to winner only). |
| `optimize-harness.ts` | 239 | PURE engine. `runChampionWalk(args, deps)` + `selectWinner`/`summarize`. Types: `HandoffPlan`, `TrialResult`, `ChampionWalkDeps` (snapshot/runTrial/recordWinner), `ChampionWalkArgs` (trials, `proposeOnly`, `alwaysAdvance`), `HandoffResult`, `ChampionWalkResult`. No I/O. |
| `optimize-live.ts` | 431 | Assembles the REAL deps over the drive. `makeChampionWalkDeps(ctx)`, `makeLiveSpawnTurn(seams)` (record-gated), `applyContentSeams`, `makeBuildSnapshotDeps`/`realBuildGitOps`, `makeBuildGate`, `readLastTurnTokens`, `runLaneSweep` (in this file, not harness), `positionToNextHandoff`/`positionToBuildHandoff`. `OptimizeLiveCtx`, `LiveDriveSeams`, `LaneSweepDeps`. |
| `optimize-candidates.ts` | 271 | PURE candidate model. `Candidate`/`CandidateContent`/`SweepSpec`, `generateCandidates(sweep)` (Family 1+2 cross), `defaultLaneCandidates(handoff)` (per-role: baseline + cheaper-model + effort-low + scan-tighten; navigator-reflect = baseline only), `applyCandidateConfig`, `scanTightenContent`, `BASELINE_CANDIDATE_ID`. |
| `optimize-snapshot.ts` | 105 | `snapshotDesign` (.sftdd copy/restore), `snapshotBuild` (git SHA-reset + `cutExperiment` re-fork), `turnMutatesDb`. |
| `optimize-gate.ts` | 103 | `evaluateDesignGate` — the design-handoff quality bar (role self-check via response-formatter CHECKERS + the design gate). |
| `optimize-report.ts` | 172 | PURE. `buildChampionWalkReport`, `formatChampionWalkReport` (markdown table + prompt-in + prompt-bound trim targets), `describeCandidateLevers`. `PROMPT_BOUND_MIN_*`. |
| `optimize-agent-overlay.ts` | 43 | Swap a variant `.claude/agents/<role>.md` in for one forked turn, restore after. |
| `optimize-apply.ts` | 215 | `lakebase-sftdd-optimize-apply` core: persist an APPROVED winner's levers to the KIT (agent-.md direct edits + typed-source SourceEditProposals). This is the propose→persist gate. |
| `optimize-apply.cli.ts` | 121 | The apply bin. |

## The three fixes from the first live runs (commit e74d020a on branch fix/headless-permission-mode-acceptedits)

1. **Crash ≠ fatal.** `runChampionWalk` wraps `deps.runTrial` in try/catch → a thrown
   turn (e.g. `ArtifactOutOfRootError`) becomes a disqualifying `gatePassed:false`; the
   walk continues. Test: `optimize-harness.test.ts` (THROWS sentinel ×2).
2. **Lane advance vs kit-persist.** `alwaysAdvance` arg: a lane sweep records the winner
   locally (so the next handoff can plan) even under `proposeOnly`; `proposeOnly` gates
   ONLY kit persistence (the separate `optimize-apply` step). Test: `optimize-harness.test.ts`.
3. **Only winners record.** `makeLiveSpawnTurn` sets `LAKEBASE_SFTDD_RECORD_DIR` only for
   a `record:true` (winner) spawn, clears it for trials, restores prior env after.
   `optimize.cli` reads RECORD_DIR once + clears the ambient env. Test: `optimize-live.test.ts`.

## Headless permission (commit fd60140b)

`drive.cli.ts claudeBaseArgs` uses `--permission-mode acceptEdits`. NOT
`bypassPermissions`: the enterprise managed-settings policy
(`/Library/Application Support/ClaudeCode/managed-settings.json`,
`disableBypassPermissionsMode:"disable"`) silently downgrades bypass → `default` →
auto-deny. acceptEdits is honored + grants Write AND Bash headless. See memory
`reference_managed_settings_bypass_downgrade`.

## Kit resolution (split-brain guard)

- Local dev ref = `sftdd-capture-local`. `pin_local_kit_cache` (examples/sftdd-scenarios/lib/pin-local-kit.sh)
  plants `~/.cache/consort/sftdd-capture-local/node_modules/@databricks-solutions/consort`
  → symlink to THIS repo. (NOTE: the symlink is under `node_modules/`, NOT `<cache>/dist`.)
- Agents are env-less; they resolve the ref from the project's `.lakebase/kit-ref.local`
  (planted by `record_local_kit_hint`) → the cache symlink → this repo's `dist/`.
- NEVER set `LAKEBASE_KIT_DIR` (redirects only the orchestrator, leaves agents on the
  cache → split-brain). The runbooks refuse it.
- Kit ships COMMITTED dist (gitignored, force-added at release). After a source edit:
  `npm run build` + `git add -f dist/...`. `optimize-harness` bundles INTO
  `optimize.cli.js` (no standalone dist file); comment strings are stripped by the
  bundler, so grep the compiled bin for BEHAVIOR (e.g. `alwaysAdvance`, the try/catch),
  not comment markers.

## Runbooks + tests

- `examples/sftdd-scenarios/optimize-scenario.sh` — the run wrapper. USE single-handoff (no `--sweep-lane`).
- `examples/sftdd-scenarios/archive-optimize-results.sh` — copies a role's results into the committed optimize-results/<handoff>/ (summary.json + report.md + champion-walk.json + per-candidate trials) so metrics survive project teardown.
- `examples/sftdd-scenarios/watch-artifacts.sh` — Monitor-friendly artifact watcher.
- Tests: `tests/bdd/optimize-*.test.ts`. Live: `tests/live/*`.

## Scenario corpus + where results/metrics live
- `examples/sftdd-scenarios/stockflow-optimize/` — intake/ + scenario.json.pending (tiers 2, uiTrack, python, self-hosted). `recorded-artifacts/` + `turns/` are the KEPT, COMMITTED REPLAY CORPUS (winners' .sftdd output); set LAKEBASE_SFTDD_REPLAY_DIR to it to fast-forward. Do NOT scrub it.
- `examples/sftdd-scenarios/optimize-results/<handoff>/` — COMMITTED run metrics: summary.json (per-candidate median/gate/cost + winner), report.md (champion-walk table), champion-walk.json, per-candidate trial result.json. The source of truth for metrics; survives teardown.
- `<project>/experiments/` — raw per-candidate trial scratch (disposable, dies with the project). Run logs: /tmp/optimize-*.log.

## CLI scope: `--sweep-lane` vs single-handoff, and `--from`

> **USE SINGLE-HANDOFF. `--sweep-lane` (and `--from`) is BROKEN in practice , do NOT use
> it.** Every lane-sweep attempt stalled at feature-complete with 0 handoffs swept
> (positionToNextHandoff + advanceOne don't reliably run breakdown's sync-breakdown, so
> pipeline.json stays empty). The PROVEN method is one single-handoff invocation per role
> (see "THE LOOP I RUN" above): `optimize-scenario.sh ... --trials N` with NO --sweep-lane,
> which sweeps the ONE role the drive sits on, records the winner (advances the drive), and
> exits; re-run for the next role. The reference below is kept only to explain WHY the lane
> path is off , not as a thing to run.

`main()` has two paths: **single-handoff (default)** , sweeps the ONE handoff the drive
sits on (`planNextAction` → `actionToHandoffPlan`; candidates = `--candidates` spec or
`defaultLaneCandidates(handoff)`), records the winner (advances the drive), exits. This is
the one to use. **`--sweep-lane design|build` + `--from`** , walks the whole lane via
`runLaneSweep`/`positionToNextHandoff`/`advanceOne`; BROKEN in practice (stalls at
feature-complete, empty pipeline), so do not use it. The code still exists (and its unit
tests pass) but the live path is unreliable; the single-handoff loop is the proven method.

Design-lane role order (`nextDesignAction`, orchestrator-drive.ts): spec-author breakdown →
ux-designer (once, UI track) → per story [spec-author ACs → architect-reviewer (or
`project-architect-notes`, NO LLM turn, when canon-projectable) → dba (skipped w/o a turn
for non-service_backed) → test-strategist → navigator reflect (baseline-only) → surface/
approve gate] → design-complete. So a per-story sweep may find architect/dba SKIPPED (no
turn); that's expected , the drive just advances.
