# Optimize harness — index (where things are + what they do)

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
  → buildCfg → commandsFor(handoff.action) → run ONLY the `claude` cmd (real `claude -p`)
    ← #2 PINNED-TURN fix (12a55dd2): the spawn runs the handoff's OWN action, filtered to
      kind==="claude" (drops the drive verify/sync/test appendix); it NEVER calls
      planNextAction (which re-plans to the NEXT role once the artifact lands = wrong-role
      turn → verify-artifact throw → phantom drive main() → exit 3). HandoffPlan carries `action`.
```
NOTE: the phantom drive main() came from tsup `splitting:false` inlining drive.cli.ts into
optimize.cli.js; fixed by extracting the seams to drive-runner.ts (no main()), commit
96b1ea98. See memory `reference_tsup_inlined_isclientry_double_main`.

## VERIFIED runtime truth (2026-08-02) — reconcile the design against what actually runs

> **STATUS: RESOLVED.** The root cause below (harness dragged in the drive loop + its
> exit-3 main) was fixed by the pinned-turn change (`12a55dd2`) + the drive-runner
> extraction (`96b1ea98`). The narrative is kept for provenance; "Fix direction (not yet
> done)" at the end is now DONE. Do not treat this as open work.

Three live diagnostic runs (all exit 3) forced reading the COMPILED bin, not the
source structure. The findings, written down so they are not re-derived:

1. **`spawnTurn` for one design turn is NOT one `claude -p` , it is a multi-command
   list run through `execRunner`.** `commandsForAction(invoke-role spec-author/breakdown)`
   returns `[reset-breakdown (cli), claude, verify-artifact, sync-breakdown (cli),
   test-list (cli)]` (orchestrator-effects.ts ~1230-1290). `execRunner.run` executes
   each: cli commands `spawnCmd("node", <kit-bin>)`, the claude command spawns the
   agent. **`verify-artifact` throws `ArtifactOutOfRootError` IN-PROCESS** when the
   agent wrote its artifact to the malformed hyphen-joined sibling root and the stray
   relocation found nothing (stray-artifact-recovery.ts).

2. **The optimize bin BUNDLES `runDriver` + the `[drive] NNN dispatch` onAction logger
   + `padStart(3)`** (7 `runDriver` refs, 13 `lakebase-sftdd-drive` refs, `[drive] ${`
   template, all in dist/scripts/sftdd/optimize.cli.js). The live run's numbered
   `[drive] 000 dispatch spec-author`, `001 dispatch ux-designer` lines are the
   runDriver `onAction` narration , i.e. a **runDriver-style action loop is executing
   inside the optimize process**, even though optimize-live's `makeLiveSpawnTurn` is
   supposed to run exactly ONE `planNextAction` result per spawn. The design says
   "one handoff per spawn"; the runtime says "a drive loop ran (000→001→…→deploy)".

3. **The observed crash sequence (single-handoff spec-author sweep, trials=2):**
   turn1 spec-author 97s (trial-0, recorded, gate ok) → turn2 spec-author 129s
   (trial-1, recorded, gate ok) → turn3 spec-author 103s (recordWinner, advances, NO
   restore) → **turn4 ux-designer 165s** (a turn NOBODY in the harness intended) →
   its `verify-artifact` throws ArtifactOutOfRootError → the drive `main()` catch
   (`[drive] ${err.message}` + `return 3`) fires → exit 3. Neither the per-trial catch
   (#1) nor the drift guard printed, because turn4 did not go through
   `runChampionWalk`'s trial loop OR `makeLiveSpawnTurn`'s guard , it ran on a code
   path the harness does not wrap.

### THE STRUCTURAL PROBLEM (the actual root cause)

The harness was built as "inject thin seams (`execRunner`, `planNextAction`) and run
ONE turn per spawn." But `execRunner`/`buildCfg` were extracted from the SAME drive
`cfg` that also carries the full runDriver loop (`onAction`, the numbered dispatch,
`commandsForAction` that appends verify + sync + test-list, the `main()` exit-3
handler). Through many refactors the "one turn" seam and the "whole drive loop"
machinery were never actually separated , they share `cfg` and the same command list.
So the harness cannot run one isolated turn: whatever it invokes drags the drive's
loop + its own top-level exit-3 error handling, which lands OUTSIDE every guard the
harness added. That is why each fix (crash-catch, drift-guard, record-gate) is correct
in isolation yet the sweep still exits 3: the crash happens on the drive's loop/main
path, not the harness's.

**Fix direction (not yet done) , frame it as INTERFACE vs IMPLEMENTATION:**

Each handoff obeys a well-defined interface (a contract): *role R, given its inputs
(the upstream artifacts on disk), produces artifact A that passes gate G.* That
contract is all the optimize harness needs , it should invoke the role against the
contract and check the produced artifact, timing the wall-clock. Everything else the
drive does around a turn , `reset-breakdown`, `sync-breakdown`, `test-list`,
`verify-artifact`, the numbered `onAction` narration, the runDriver loop, the `main()`
exit-3 handler , is ROLE-SPECIFIC IMPLEMENTATION DETAIL that lives INSIDE the drive.
The harness must not re-run the drive's loop + appendix per trial; it drags in exactly
the machinery (verify-artifact throw, main() return 3) that crashes outside the
harness's guards.

Concretely: give the harness a single-turn entry keyed on the handoff CONTRACT , run
role R's `claude` command from the current (snapshot-pinned) inputs, then evaluate the
contract (artifact A present + gate G) as the harness's OWN check , NOT by replaying
the drive's command list (which appends verify/sync/test-list and routes failures
through the drive's process-level exit-3). The candidate levers (model/effort/prompt/
tool-scope) are the implementation knobs swept WITHIN that one contract-satisfying
turn. This makes each trial "one role satisfying one interface," which is what the
champion walk was always meant to measure.

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

- `examples/sftdd-scenarios/optimize-scenario.sh` — the run wrapper (single-handoff or `--sweep-lane`).
- `examples/sftdd-scenarios/watch-artifacts.sh` — Monitor-friendly artifact watcher (ART/GROW/DIR/HALT/DONE); judges a run by what lands on disk, not log strings.
- Tests: `tests/bdd/optimize-*.test.ts` (16 files, 125 tests). Live: `tests/live/*`.

## Scenario corpus

`examples/sftdd-scenarios/stockflow-optimize/` — intake/ + recorded-artifacts/features/F1-stock-visibility/feature-request.md + scenario.json.pending (tiers 2, uiTrack, python, self-hosted). Corpus dirs (turns/, recorded-artifacts/design/) are PRODUCED by a run (winners only).

## CLI scope: `--sweep-lane` vs single-handoff, and `--from` (verified optimize.cli.ts:258-397)

Two mutually exclusive paths in `main()`:

- **Single-handoff (default, no `--sweep-lane`):** sweeps EXACTLY the one handoff the
  drive is currently positioned on (`planNextAction` → `actionToHandoffPlan`). Candidates
  = `--candidates` spec if given, else `defaultLaneCandidates(handoff)` fallback (so a
  design role's scalar model/effort/scan levers get swept without the lane loop). To
  sweep JUST architect-reviewer this way you must first advance the drive to sit on it.
  `--from` is IGNORED here (it's parsed but only consumed by the lane path).
- **`--sweep-lane design|build`:** `runLaneSweep` walks EVERY role handoff in the lane
  sequentially (`positionToNextHandoff` advances + performs substrate between handoffs),
  champion-walking each with `defaultLaneCandidates`, `alwaysAdvance:true` (records each
  winner locally so the next handoff plans from it — the design lane's inter-turn dep).
  `proposeOnly` here gates only KIT persistence, never the local advance.

**`--from <handoff|role>` (lane-sweep only, optimize.cli.ts:301-310 `advanceOne`):** every
handoff BEFORE the match is a settled upstream role — `advanceOne` runs its BASELINE once
(trials=1, alwaysAdvance) to move the drive forward WITHOUT sweeping its candidates; the
target handoff and everything AFTER it are champion-walked. Matches an exact id OR a bare
role (`optimize-lane-sweep.test.ts` startFrom cases). **Consequence:** `--sweep-lane design
--from architect-reviewer` sweeps architect-reviewer → dba → test-strategist → ux-designer
in ONE run (advancing spec-author at baseline), NOT just architect-reviewer. This is the
right tool for "sweep the remaining design roles" — one scaffold, one teardown, spec-author
advanced once. (There is no per-role `--from` that isolates a single downstream role; use
the single-handoff path positioned on that role for that.)

## Design-lane role order (what a `--from architect-reviewer` sweep covers)

Per `defaultLaneCandidates` + the design sub-machine, the story's design handoffs are:
spec-author → architect-reviewer → dba → test-strategist → ux-designer, then
navigator-reflect (baseline-only critic, not an authoring turn). **Open question carried
from memory:** for the stockflow-optimize scenario, architect-reviewer MAY be canon-
projected (design goes complete without an architect LLM turn) → the sweep finds no
architect handoff to walk and starts at the first role that does have a turn. If the run's
`[optimize] handoff <id>: N candidate(s)` lines skip architect-reviewer, that's expected.

## Resolved (was "open") — the exit-3 arc, now fixed

The exit-3 that recurred through the first ~5 live runs is FIXED (this session, newest
last): `12a55dd2` pinned-turn (run `handoff.action`'s own `claude` command, never
`planNextAction` → no wrong-role turn) + `96b1ea98` drive-runner extraction (tsup
`splitting:false` was inlining drive.cli's `if(isCliEntry)main()` into optimize.cli.js → a
PHANTOM drive `main()` fired every turn + returned 3 on the wrong-role verify-artifact
throw). A clean single-handoff spec-author sweep then completed (4 candidates ×2 trials, no
crash). See the fix chain in memory `project_optimize_harness` ★RESUME POINT★.

**Lever data so far:** spec-author winner = **effort-low, 34% faster** (99.4s→66.0s median,
same gate); opus stays the model (sonnet ~2× slower); scan-tighten slower. APPLIED to kit
(`88713ccc`: `defaultEffort` + `defaultSftddConfig` set spec-author effort:low).
