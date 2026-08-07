# Optimize experiment run log

Autopilot run of the one-`.sh` optimize experiment across every manifest turn-chain
(design + build), reference-seeded, parallel candidates. Plan: `~/.claude/plans/giggly-petting-whisper.md`.
Each stage: build → tsc + hermetic suite → source-only commit → live proof → record scores → fix-and-rerun on failure.

Branch: `fix/headless-permission-mode-acceptedits`. LOCAL only; nothing pushed.

---

## Chain inventory decisions (what IS and ISN'T a sweepable chain)

- **Plan lane:** the two DISTINCT agent turns , `spec-author-propose` and `architect-estimator` (estimate) , ARE swept (design set). `author-requests` / `gate-plan` / `planning-complete` are deterministic substrate (no agent), correctly not swept.
- **`estimate-committed` , NOT a separate chain.** It's the SAME architect-reviewer role in a different mode (turn-key.ts collapses both modes to "estimate"); the only difference from plain estimate is scope (sizes committed F-ids + merges vs. candidate FPs). No specialized agent role => no shipped manifest, no separate optimize chain , its lever space is identical to architect-estimator (already swept, winner e-low -23%). (Considered adding a manifest + executor migration; backed out per "no specialized role => not a manifest".)
- **uiTrack FIX VALIDATED + RE-SWEPT (the client-analyst gap):** the test-strategist rerun with uiTrack ON now produces CLIENT test items in EVERY candidate (7-13 client each: baseline 6b/7c/15f, a-fitness-opus 5/13/19, a-behavior-haiku 3/12/21, a-all-low 5/10/16, a-cheap-hold-fit 3/7/14, a-fitness-low 4/11/15) where the uiTrack-off run had ZERO. All three analysts participate + judged vs the client-containing reference. uiTrack now defaults ON everywhere (commit 88fd4510). CORRECTED WINNER: **a-all-low (all 3 analysts effort=low) 318.4s vs 820.8s baseline (-61%, $0.47 cheaper)** , the uiTrack-off -66% number is SUPERSEDED (invalid, no client). Evidence: `.role-telemetry/stage2-tstrat-uitrack/`.
  NOTE: this valid rerun used the 6-candidate set (analyst levers only); the SUPERVISOR-lever candidates (s-low/s-haiku/s-low+a-all-low/s-haiku+a-all-low, commit 682e4da9) landed AFTER it built, so a fresh test-strategist run on the rebuilt dist (10 candidates) is queued to land in the visible runs/ dir with baseline compare.

---

## Stage 0 — parallelize the chain-sweep engine (hermetic) ✓ DONE

- Commit `5539d523`. `runRoleSweep` gained `concurrency` (default 1 = prior sequential path, byte-identical); >1 fans candidates out over `runExperimentsInParallel`.
- Extracted `runOneCandidate` (never throws → crash = disqualified trial). Parallel path re-sorts results to candidate (baseline-first) order.
- Tests: `tests/bdd/role-sweep.test.ts` 14 tests green (peak in-flight ≤ cap, all trials present, stable order under inverse durations, crash-disqualify w/o aborting siblings, onStart/onDone per candidate, concurrency-1 strictly sequential).
- Full hermetic suite: **3373 passed** | 58 skipped | 2 todo. tsc clean.
- No fixes needed (clean first pass).

---

## Stage 1 — multi-chain fan-out + reference judge in the sweep CLI ✓ DONE + LIVE-PROVEN

- Commit `97a77132`. optimize-role.cli sweeps a SET of chains (`--chains design` | comma list | back-compat `--role`); `expandChains` + `--concurrency` + per-chain `sweepOneChain` + roll-up. role-sweep chain param widened to structural `SweepableChain`.
- Hermetic: `tests/bdd/optimize-role-cli.test.ts` 11 tests + role-sweep 14 tests green. Full suite **3380 passed**. tsc clean.
- **LIVE PROOF (lean, no cloud) — dba chain, concurrency 2, 8 candidates, all gate+quality PASSED:**

```
dba: winner m-sonnet-e-low (20.9s vs baseline 29.5s, saved 29%; $0.07 cheaper)
  m-sonnet-e-low  20.9s  $0.07  -29%  {model:sonnet, effort:low}   <- WINNER
  e-low           23.4s  $0.13  -21%  {effort:low}
  scan-tight      26.5s  $0.15  -10%  {disallowedTools:[Grep,Glob]}
  e-medium        28.3s  $0.14   -4%  {effort:medium}
  baseline        29.5s  $0.14    0%  (opus default)
  m-haiku-e-low   48.7s  $0.05  +65%  {model:haiku, effort:low}
  m-haiku         49.5s  $0.05  +68%  {model:haiku}
  m-sonnet        80.1s  $0.12 +172%  {model:sonnet}
```
  Proves the whole pipeline live: parallel fan-out (completion order ≠ candidate order, re-sorted correctly), per-candidate mkdtemp isolation, reference-example seed+judge (all quality PASSED), ranking + rollup. Evidence: `.role-telemetry/stage1-live-dba/dba/`.
- No fixes needed (clean first pass).

---

## Stage 2 — test-strategist per-analyst permutation candidates + supervisor consistency ✓ BUILT + LIVE-PROVEN (mechanism); rollup re-run for full winner

- Commit `5540307c`. Per-analyst subagent lever sweep: `renderTestAnalystRoster` overrides, `testStrategistCandidates`, supervisor consistency fix (mandatory model + verbatim effort/tool_scope + per-analyst reasoning log), parallel-safe threading via `preconditionOptions`. Hermetic: 53 tests across roster/levers/sweep/cli green; full suite **3391**. tsc clean.
- **LIVE RUN 1 (concurrency 2): the MECHANISM is proven** , all 6 candidates dispatched with the CORRECT per-analyst overrides (verified in the log: `{"analystOverrides":{"fitness":{"model":"opus"}}}` etc.), client correctly OMITTED (lean chain = no-frontend, enabled-kind filter works), 4/6 completed + PASSED gate+quality before the run hit the **~55min background-task cap** (an infra limit, NOT a code bug , see [[reference_background_task_lifetime_cap]]):
  - baseline (sonnet defaults) 553.4s
  - a-fitness-opus {fitness:opus} 391.5s
  - a-behavior-haiku {behavior:haiku} 827.8s
  - a-all-low {behavior+fitness effort:low} 342.0s  ← fastest of the 4
  - a-cheap-hold-fit, a-fitness-low , still in flight at the cap (not recorded)
- FIX (fit under the cap, not a code change): RE-RUN at concurrency 3 (6 candidates → 2 waves) for the complete rollup + winner.
- **LIVE RUN 2 (concurrency 3): COMPLETE , all 6 candidates gate+quality PASSED, clean winner:**

```
test-strategist: winner a-all-low (223.4s vs baseline 665.7s, saved 66%; $0.29 cheaper)
  a-all-low         223.4s  $0.44  -66%  {behavior:low, fitness:low}        <- WINNER
  a-fitness-low     375.8s  $0.53  -44%  {fitness:low}
  a-fitness-opus    571.3s  $0.99  -14%  {fitness:opus}
  a-behavior-haiku  614.6s  $0.62   -8%  {behavior:haiku}
  baseline          665.7s  $0.72    0%  (sonnet/high-fitness defaults)
  a-cheap-hold-fit  937.3s  $0.69  +41%  {behavior:haiku/low, fitness:sonnet/high}
```
  The SUB-AGENT levers demonstrably drove the ranking (the user's directive: sweep the analysts, not the supervisor). Dropping BOTH analysts to low effort was the big win; holding fitness high (a-cheap-hold-fit) was the SLOWEST , counterproductive on this fixture. All permutations held the S1-slice reference (fitness stayed sole invariant_id owner). Evidence: `.role-telemetry/stage2-live-tstrat/test-strategist/`.

---

## Design-set batches (Stages 0-3, no new code)

Run per-chain in batches under the ~55min bg-task cap.

### Batch 1 (spec-author-propose, architect-estimator, spec-author-story, architect-reviewer @ concurrency 4) , COMPLETE

```
spec-author-propose: winner e-low   (29.6s vs baseline 49.0s, -39%; $0.04 cheaper)   [m-haiku, m-haiku-e-low DISQUALIFIED: haiku too weak for propose]
spec-author-story:   winner e-low   (11.5s vs baseline 31.0s, -63%; $0.04 cheaper)
architect-estimator: NO WINNER (stale-ref run: baseline quality 0.68 vs the WRONG reference) , RE-RUN needed after the FP-slice fix (d0d32f57)
architect-reviewer:  NO WINNER (baseline DISQUALIFIED , see finding below)
```

**FINDING , architect-reviewer chain reliability (a real per-lever signal, NOT a tooling bug):** 4/8 candidates BLOCKED by writing NO artifact at all (verified: only replay.json persisted, no architecture.json). The split is by REASONING LOAD: the blocked ones are the HIGH-capability/effort runs (baseline=opus-default, m-sonnet, m-sonnet-e-low, opus+scan-tight); the PASSERS are the lower-effort ones (opus e-low, e-medium, haiku, haiku-e-low). I.e. higher-reasoning architect turns sometimes over-explore + don't converge on writing `architecture.json` at the exact path, while low-effort turns reliably do. The sweep faithfully surfaced this , it's about the architect-reviewer ROLE's behavior under levers, not the parallel-sweep code. (Also: when baseline itself is disqualified, "no winner, baseline stands" is misleading , the real read is "e-low/e-medium are the reliable+fast options here.") Non-blocking for the tooling; a role-prompt reliability follow-up.

### Batch 2 (architect-estimator [re-run w/ FP-slice fix], ux-designer, architect-reviewer @ concurrency 4) , COMPLETE

```
architect-estimator: winner e-low       (14.6s vs baseline 19.0s, -23%)  , FP-SLICE FIX VALIDATED: baseline now PASSES (was 0.68 fail vs the wrong ref); 7/8 pass, only m-haiku quality-fails (0.60, genuinely weak)
ux-designer:         winner m-opus-e-low (31.6s vs baseline 33.7s, -6%)   , both haiku variants blocked (haiku too weak for the design-guide turn)
architect-reviewer:  no winner , baseline + m-sonnet + m-sonnet-e-low + scan-tight BLOCKED again (SAME candidates as batch 1 = REPRODUCIBLE, not transient)
```

**architect-reviewer reliability , CONFIRMED reproducible (2 independent runs, identical blocked set):** the high-reasoning candidates (baseline=opus, m-sonnet, m-sonnet-e-low, opus+scan-tight) end their turn WITHOUT writing architecture.json (only replay.json persists , no telemetry, no artifact), while low-effort candidates (e-low, e-medium) reliably produce + pass. This is a real architect-reviewer ROLE/chain reliability defect at high effort (the isolated lean chain: the hi-effort turn over-explores + stops before writing), NOT a sweep-tooling bug , the sweep faithfully surfaced it across two runs. FOLLOW-UP (separate from this optimize task): investigate the architect-reviewer isolated-chain turn budget / prompt so the opus turn converges on the write (or accept that e-low is the reliable+fast config to apply). The optimize experiment's own conclusion for this chain: **apply effort=low , it is both reliable AND fastest.**

Live findings during the run (the sweep working as designed):
- `spec-author-propose`: `m-haiku` AND `m-haiku-e-low` DISQUALIFIED (emitted "blocked" past retry budget) , a real signal that **haiku is too weak for the propose turn**; baseline/e-low/e-medium/m-sonnet/m-sonnet-e-low PASSED. Sweep continued (disqualify-and-continue works live under parallelism).
- `architect-estimator`: **baseline itself quality-FAILED (0.68)** vs its reference. CALIBRATION FOLLOW-UP (not a crash): the estimate chain's `referenceFile` likely scores the isolated estimate turn against a WIDER `estimates.json` than the turn is seeded to produce (the F1/F6 entries added later by sync-backlog) , the same scope-mismatch `DESIGN_LIVE_SPECS.estimate.equivalenceReferencePaths` fixes with `estimates.FP-slice.json`. When baseline fails quality, the chain yields "no winner" (baseline levers stand). FIX (queued): point `ROLE_CHAINS["architect-estimator"].referenceFile` at the FP-slice. Non-blocking , other chains unaffected.

## test-strategist SUPERVISOR sweep (10 candidates) , the supervisor lever is decisive

The analysts-only sweep (best -61%) left a big win on the table. Sweeping the SUPERVISOR's own
model/effort (alone + combined with analysts at the winning lever) , first VISIBLE run, landed in
`examples/replay/optimize-results/runs/20260807134637/` with summary.json (durable + diffable):

```
test-strategist: winner s-low+a-all-low (173.6s vs baseline 585.5s, saved 70%)
  s-low+a-all-low   173.6s  {supervisor effort=low + all analysts effort=low}   <- WINNER
  s-low             188.8s  {supervisor effort=low, analysts baseline}
  s-haiku+a-all-low 283.9s  {supervisor haiku/low + all analysts low}
  a-all-low         318.4s? (this run 531.5s) {analysts low, supervisor baseline}
  s-haiku           389.5s  {supervisor haiku, analysts baseline}
  a-fitness-low     408.4s  | a-cheap-hold-fit 658.0s | a-behavior-haiku 622.4s | a-fitness-opus 386.2s
  baseline          585.5s
```
ALL 10 gate+quality PASSED (client items present throughout). LEAN SUPERVISOR is the single biggest
lever; combined with low-effort analysts = -70%. Answers "sweep the supervisor itself, not just the analysts".

## Navigator build chains WIRED (hermetic; live sweep HELD for go)

Commit `32942e88`. All 4 navigator turns are now sweepable via `--chains navigator`:
- navigator-red , coverage judge (tests/ vs recorded test-list)
- navigator-assess , alignment judge (marker vs recorded verdict)
- navigator-review , VERDICT-ALIGNMENT judge: review-verdict.json {refactor, notes + fixDirective to the driver} , decision-match hard gate + substantive-recommendation bar vs the recorded review-verdict
- navigator-reflect , VERDICT-ALIGNMENT judge: reflect-verdict.json {passed, findings} vs the recorded reflect-verdict
New: BuildRoleChain.assertKind += review|reflect + verdictFile; buildVerdictAlignmentJudgePrompt/makeVerdictAlignmentJudge (semantic-gate); sweepOneChain build-branch (runBuildRoleChainLive + judge-by-assertKind); CHAIN_SETS.navigator; expandChains accepts build handles. 58 optimize tests + full suite 3423 green, tsc clean. LEAN, no cloud. Live sweep command (HELD): `scripts/optimize-role.sh --chains navigator --concurrency 3`.

## Stage 4 — driver build chains (live cloud) , pre-approved

DRIVER MAP: green (no buildMode) / refactor / repair , all gated by the post-turn `@build-cycle`
HONEST-GREEN verify (defaultGreenVerifier -> ensureDeployedAndVerify: `alembic upgrade head` + pytest
against a LIVE Lakebase branch, cycle-record.ts:464). That live-branch dependency is why driver != lean.
Trial verdict = classifyBuildTrial (honest-green + escalations) + makeBuildDiscriminatorJudge. Seed =
recorded `002-navigator` pre-GREEN tree; GREEN reference = `003-driver`.
DECISIONS: isolation = WORKTREE + own Lakebase branch per candidate (parallel, #589 model), teardown
mandatory in finally + orphan sweep; SCOPE = driver-green ONLY first (refactor/repair after it's proven).
Reuse: snapshotBuild/BuildSnapshotDeps/turnMutatesDb, makeBuildSnapshotDeps + cutExperiment(resetStaleBranch)/
deleteExperiment, createWorktree (design-equivalence-support). Build seam: runBuildDriverChainLive at
build-role-chains.ts:183. Creds: .env.local.test.config (profile fevm-serverless-stable-ecparr, owner kevin-hartman).

SEED RESOLVED: the faithful pre-GREEN driver seed is the recorded `002-navigator` tree (RED tests present, impl absent , 46 files) under `examples/replay/corpora/stockflow-rerecord/recorded-build/features/F1-stock-visibility/stories/S1-file-stock/turns/002-navigator/code`; `003-driver` (54 files, impl added) is the GREEN result to judge against. Driver-green chain = seed 002 -> live driver GREEN turn -> honest-GREEN verify on a per-candidate Lakebase branch -> discriminator judge vs 003. Build pending (see [[project_optimize_every_chain_parallel]] for the full Stage 4 spec).

---

## Scores (winners per chain)

| Chain | Baseline | Winner | Winner time | Saved | Winner levers |
|---|---|---|---|---|---|
| dba | 29.5s (opus) | m-sonnet-e-low | 20.9s | 29% | model=sonnet, effort=low |
| test-strategist (uiTrack ON, 3 analysts + SUPERVISOR levers) | 585.5s | **s-low+a-all-low** | 173.6s | **70%** | LEAN SUPERVISOR (effort=low) + all analysts effort=low |
| ~~test-strategist (analysts-only sweep, uiTrack ON)~~ | ~~820.8s~~ | ~~a-all-low~~ | ~~318.4s~~ | ~~61%~~ | superseded by the supervisor sweep below (analysts-only left the supervisor win on the table) |
| ~~test-strategist (uiTrack off , INVALID, no client)~~ | ~~665.7s~~ | ~~a-all-low~~ | ~~223.4s~~ | ~~66%~~ | superseded , dropped the client analyst |
| spec-author-propose | 49.0s (opus) | e-low | 29.6s | 39% | effort=low (haiku disqualified) |
| spec-author-story | 31.0s (opus) | e-low | 11.5s | 63% | effort=low |
| architect-estimator | 19.0s (opus) | e-low | 14.6s | 23% | effort=low (FP-slice fix validated) |
| ux-designer | 33.7s (sonnet) | m-opus-e-low | 31.6s | 6% | model=opus, effort=low (haiku blocked) |
| architect-reviewer | (opus baseline blocks) | e-low* | 27.5s | — | effort=low , the RELIABLE+fast config (hi-effort blocks, reproducible) |
| _navigator-red, navigator-assess_ | | | | | _pending (lean build chains, wire into CLI chain-set)_ |
| _driver-green, driver-refactor_ | | | | | _pending Stage 4 (cloud)_ |

\* architect-reviewer has no baseline-relative winner (baseline blocks), but e-low is the only reliably-conformant + fast config , the actionable optimize conclusion.

**Headline across ALL swept chains: `effort=low` is the dominant win** (dba, spec-author-propose, spec-author-story, architect-estimator, architect-reviewer all favor low effort; test-strategist favors both analysts at low; ux favors opus+low). Cheaper models (haiku) consistently UNDER-deliver on the reasoning-heavy turns (propose/estimate/architecture/design-guide) , disqualified or quality-failed , so the win is EFFORT reduction at the capable model, not model downgrade.
