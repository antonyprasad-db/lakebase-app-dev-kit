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
deps.spawnTurn = makeLiveSpawnTurn:
  record?RECORD_DIR=recordDir:delete RECORD_DIR  ← #3 fix: only winners record
  → buildCfg → execRunner → planNextAction → run the handoff's commands (real `claude -p`)
```

## VERIFIED runtime truth (2026-08-02) — reconcile the design against what actually runs

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

## Open / unresolved (as of this session)

- **Exit-3 recurs live even with fix #1 compiled in.** The `try/catch` around
  `deps.runTrial` IS in the running bin (verified in `optimize.cli.js`), yet a live
  spec-author sweep still died exit 3 after `baseline/trial-0` with "produced no
  feature-spec.json". Since the catch covers `runTrial`→`spawnTurn`→`execRunner`, the
  throw must escape a DIFFERENT path (candidate: `snap.restore()` after the trial, or a
  path in `execRunner` that calls `process.exit`/spawns the drive bin which returns 3).
  Needs pinning with a stack, not more grep.
- **Deferred #4:** `--sweep-lane design` bled past `design-complete` into a build/deploy
  turn (needs cloud DB the local tiers-1 probe lacks). Single-handoff path avoids it.
- **Lever data so far:** spec-author opus ~79–94s vs sonnet ~186–188s (2.2× SLOWER) —
  cheaper-model lever LOSES for spec-author. effort-low/scan-tighten never got a clean
  measurement (runs crashed first).
