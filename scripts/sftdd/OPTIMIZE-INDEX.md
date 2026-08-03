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
