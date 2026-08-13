# Optimize experiment run log

Autopilot run of the one-`.sh` optimize experiment across every manifest turn-chain
(design + build), reference-seeded, parallel candidates. Plan: `~/.claude/plans/giggly-petting-whisper.md`.
Each stage: build → tsc + hermetic suite → source-only commit → live proof → record scores → fix-and-rerun on failure.

Branch: `fix/headless-permission-mode-acceptedits`. LOCAL only; nothing pushed.

---

## MANDATORY JUDGE + PRESERVE on EVERY evaluation, through ONE sweep engine (invariant enforced)

Requirement (absolute): every optimize evaluation runs an LLM judge vs the recorded reference AND
preserves its produced output for independent re-judging. Audit found the judge was conditional/absent in
several places; fixed so there is NO judge-less or output-discarded path, and ONE engine does the work for
all chain kinds (no second engine, no new name for the same job):
- `role-sweep.ts` `runOneCandidate` (THE Template Method): run -> conformance -> MANDATORY judge -> a
  conformant candidate with NO verdict / a throwing judge is DISQUALIFIED (never silently unscored). The
  `QualityGate` is now a per-chain `judgeCandidate` CLOSURE; `ChainRunResult` gained an optional `gate`
  so a runner can supply its own conformance (driver-green's honest-GREEN) , the SAME engine now handles
  design, navigator, AND driver.
- `optimize-role.cli.ts` `buildChainJudge`: every chain routes to its EXISTING discriminator , design/red
  = makeOpusJudge; assess = evaluateNavigatorAssessAlignment + makeSupersessionDeltaJudge; review/reflect =
  makeVerdictAlignmentJudge + parseVerdictFile; driver-green = makeBuildDiscriminatorJudge (code vs the
  003-driver pin). A missing reference THROWS (evaluation invalid), never a silent skip. Reflect's reference
  was mine-only , extracted into the camp.
- **driver-green CONVERGED onto the ONE engine**: `sweepDriverGreen` now scaffolds once + drives
  `runRoleSweep` with a driver ChainRunner (returns producedArtifacts = app/+tests captured PRE-teardown,
  via the shared snapshotTree + `gate:{honestGreen}`) + the code discriminator judgeCandidate. Winner is
  judge-ranked (classification), NOT wall-clock (the prior bug). The duplicate engine `driver-sweep.ts` +
  its test were DELETED; the one-off preserve/judge options on runDriverGreenOnScaffold were reverted.
- Preservation is uniform: `persistTrial` writes every candidate's producedArtifacts (navigator's tests/app
  via extraSnapshotRoots; driver's app/tests via snapshotTree) to `<run>/<candidate>/`, so an independent
  judge can re-evaluate. tsc clean; full hermetic suite 3428 passed. Stage 5 (gated concurrency-4 live)
  re-runs on the judge-enforced engine when given the go.

---

## Driver-green: share ONE scaffold across candidates (worktree + Lakebase branch per candidate) , Stages 1-4 DONE

The driver-green sweep scaffolded a WHOLE fresh project per candidate (heavy; 8 candidates = 8 Lakebase
projects; parallel candidates collided on the second-granularity slug + contributed to the host crash).
Refactored to the #589 model the DESIGN chains already use (`design-equivalence-support.ts`): scaffold ONCE,
each candidate cuts its OWN git worktree off the scaffold HEAD + its OWN Lakebase branch off the parent, run
in parallel, torn down per-candidate. Reused the existing primitives (the "don't reinvent" discipline):
- **Stage 1**: extracted the worktree helpers (`cutWorktree` + `forceRemoveWorktree`) that were module-private
  in design-equivalence-support.ts into `tests/integration/live/shared-scaffold-support.ts`; design-equivalence
  re-imports them (no behavior change, full suite green).
- **Stage 2**: split `runDriverGreenLive` into `scaffoldDriverGreenProject` / `runDriverGreenOnScaffold`
  (cuts a worktree + `cutExperiment` branch per candidate; `finally` `deleteExperiment({deleteBranchToo})` +
  `forceRemoveWorktree`) / `teardownDriverGreenProject`. `runDriverGreenLive` is now the thin scaffold-once
  wrapper, so the two standalone live tests keep their single-call contract.
- **Stage 3**: `sweepDriverGreen` scaffolds ONCE before the candidate loop, runner calls
  `runDriverGreenOnScaffold`, teardown once in `finally`. Per-candidate crash-resilient persistence
  (`<run>/driver-green/<candidate>/trial.json`) + `--candidates` resume + orphan sweep retained.
- **Stage 4**: matched the sibling's convention (design-equivalence has NO mock-injected scaffold hermetic
  test , it's proven by its gated live run; hermetic tests cover the ENGINE). Added only the cheap pure
  assertions: `selectDriverCandidates` subset/unknown-id (fail-fast before a scaffold) + `--candidates` parse.
- Concurrency 4 is now safe + cheap: ONE project, not 8; no slug collision (per-worktree branch). tsc clean,
  full hermetic suite 3436 passed. Stage 5 (gated concurrency-4 all-8 live run) HELD for explicit go.

---

## #705 , reference-model correction: judge vs RECORDED PER-TURN OUTPUT, delete manufactured slices (DONE)

The manufactured slices are GONE; every reference is now the real recorded per-turn output. Provenance
proven byte-identical to the mine before extraction:
- `estimates.FP-slice` (== corpus turn `0001-architect-reviewer-estimate` output, verified identical)
- `acs-spec-author-slice/` (== corpus turn `0006-spec-author` acs/, verified identical)
- `test-list.S1-slice` (== corpus turn `0018-driver-repair` output, verified identical)
- `architecture.S1-slice` was PURELY FABRICATED (matched NO recorded turn , a hand-carved 4-PI subset
  that DROPPED PI5-migration-reversible). Its honest reference is the accreted `architecture.json`,
  which IS the single authoring turn 0007's output (F1 architecture is not accreted across stories).

DONE:
- Extracted the 3 real per-turn outputs VERBATIM into the camp under
  `consort/evaluation/reference-assets/stockflow/recorded-turns/<NNNN>-<role>/…`.
- Repointed both reference consumers: the optimize sweep (`role-chains.ts` test-strategist + estimate
  `referenceFile`, resolved against the camp in `readReference`) and the executor-dispatch equivalence
  proofs (`executor-dispatch-live-support.ts` acs/architecture/estimate/test-list `equivalenceReferencePaths`).
- Deleted all 4 manufactured slices from `tests/integration/intake`.
- Rebaselined the baseline-exists guard (`design-role-chains.test.ts`) to mirror `readReference`
  (referenceFile -> camp, else outputFile -> intake). Updated both camp READMEs with the recorded-turns
  provenance + the "never a slice" rule.
- tsc clean; full hermetic suite 3432 passed.

## Driver-green LIVE sweep (#698) , TWO real path-bugs fixed, then PROVEN live

The driver-green cloud sweep is wired + hermetic-green; taking it live surfaced (and fixed) two real
defects on the shipped path, then candidates started passing honest-GREEN against a live Lakebase branch:
1. **vitest bundled into the standalone CLI**: `driver-build-support.ts` imported `expect` from
   `vitest`, which throws at import when the optimize CLI (a standalone node bin, not a vitest run)
   loads it. FIX: replaced with a local runner-independent `assert`/`assertEq`/`assertGt` (same
   fail-loud semantics). The CLI bundle is now vitest-free.
2. **launcher didn't source the test-env home**: `scripts/optimize-role.sh` did `exec node` without
   sourcing `.env.local.test.config`, so `resolveTestEnv()` saw no profile/host -> the driver-green
   scaffold got an empty config -> "requires config.projectName". FIX: source the env home (guarded,
   same as `run-all-live-tests.sh`); harmless for lean chains.
LIVE PROOF (first run): baseline PASSED 334.1s, m-haiku PASSED 200.1s, m-opus PASSED 560.6s,
e-low PASSED 244.4s, e-medium PASSED 254.4s (5/8) , all honest-GREEN vs a live Lakebase branch.
Then the MACHINE CRASHED (too many live experiments in parallel , the sweep spun up scaffolds +
Lakebase projects + claude -p trees WHILE a full vitest run + rebuilds ran alongside; see
[[feedback_cap_live_experiment_parallelism]]). The crash orphaned the in-flight candidate's Lakebase
project (deleted) AND lost all 5 completed results , because the summary was written ONCE at the end.

FIXES from the crash (crash-resilience, committed):
- **Per-candidate persistence**: `sweepDriverGreen` now writes each trial to `<run>/driver-green/
  trials/<candidate>.json` the instant it finishes (in onDone), and REBUILDS the summary by reading
  trials/. A crash now loses at most the in-flight candidate.
- **`--candidates <ids>` subset flag** (+ `--telemetry-dir` to pin the run dir): RESUME a partial
  sweep by running only the not-yet-done candidates into the SAME dir; the rollup merges all persisted
  trials. parseArgs test added.
- **Per-candidate unique project slug**: the run-config default `dg-live-{{TS}}` is second-granularity,
  so two PARALLEL candidates scaffolding in the same second collided ("project slug already exists").
  `runDriverGreenLive` now derives the project name from the candidate's experimentSlug + a random
  suffix. (An explicit DRIVER_GREEN_PROJECT still wins.) This + the parallelism cap means driver-green
  runs concurrency 1, sweep-owns-the-machine.
- Orphan discipline reaffirmed: teardown-in-finally works on a clean run; a `kill -9` / crash bypasses
  it , clean up with `databricks postgres delete-project` + rm, verify zero remain.

---

## APPLIED WINNERS , baked into the kit default (user: "change all default agents on the manifest for each chain to the winning agent and levers")

The applied-winners single source of truth is `consort/config/optimized-defaults.json` (a DATA overlay
`defaultConsortConfig()` deep-merges; the shipped step-manifest `agentOptions` MIRROR it, kept honest by
`manifest-agentoptions-resolver-parity.test.ts`). Applied ONLY the winners judged against a REAL recorded
comparable; the two still judged against a manufactured slice are HELD for the #705 reference correction.

APPLIED (real comparable):
- spec-author: breakdown haiku+low (prior) · propose opus+low · acs opus+low
- architect-reviewer: architect (per-story) opus+low
- dba: sonnet+low (model tier drop was the swept winner, -29%)
- ux-designer: opus+low (prior)
- navigator: red opus+low (-88%) · reflect haiku+low (-85%) · review low (P6)

REFLECT MADE TUNABLE (user decision 1): `reflect` added to the `BuildTurn` union (step-key.ts) and
`turnKeyForAction`/`buildTurnForHandoff` now return "reflect" instead of undefined, so its swept winner
(haiku+low) has a real config path instead of silently riding the navigator scalar. tsc clean (all
`Record<BuildTurn,…>` uses are Partial); 2 tests rebaselined (parity + optimize-lane-candidates).

HELD for #705 (slice-judged, NOT baked): architect-ESTIMATOR (judged vs estimates.FP-slice) and
test-strategist ANALYSTS (judged vs test-list.S1-slice). Their manifests/catalogue reverted to pre-apply
defaults so nothing rides a manufactured comparable. Supervisor lever (sonnet+low) was NOT slice-judged and
remains as-is.

Config tests rebaselined (user decision 2 , only where seed+comparable are legitimately swept): the
`consort-config.test.ts` defaults/tiering/round-trip cases + the analyst-catalogue effort assertion. tsc +
full hermetic suite GREEN (3432 passed).

---

## AUDIT , camp provenance + the manufactured-slice reversal (user-requested)

RULE (user): the camp (consort/evaluation/reference-assets/) is the ONE canonical test-data home for
integration tests + experiments; EVERYTHING in it must come from the mine (examples/replay/corpora)
verbatim , nothing manufactured. Judge a turn against WHAT THAT TURN RECORDED, never a hand-carved slice.

AUDIT RESULTS (byte-hash vs the mine):
- Existing camp `reference-assets/stockflow`: **ALL 348 files trace byte-identically to the mine. Zero orphans.** Clean.
- The manufactured SLICES live in `tests/integration/intake` (NOT the camp), and the audit shows they were wrong-headed:
  - `architecture.S1-slice.json` , NO mine match (name or bytes) = **purely fabricated**. DELETE.
  - `estimates.FP-slice.json` , byte-identical to `turns/0001-architect-reviewer-estimate/files/.sftdd/planning/estimates.json` = a RENAMED copy of the real recorded estimate-turn output. Point the estimate chain at that turn's output; DELETE the slice.
  - `test-list.S1-slice.json` , byte-identical to `turns/0018-driver-repair/files/.sftdd/features/F1-stock-visibility/test-list.json` = a renamed real turn output too. Point at the turn; DELETE the slice.
- CORRECTION (#705, supersedes the d0d32f57 "FP-slice fix"): every chain's reference = the real per-turn recorded output (turns/<NNNN>-<role>/files/...), extracted into the camp. Delete all manufactured slices + acs-spec-author-slice/.

## AUDIT , sweep reference-scope vs the live/equivalence tests (earlier, now SUPERSEDED by the per-turn-output rule)

Each chain has a recorded corpus segment its LIVE test seeds from + judges against. The SWEEP must
judge against the SAME scoped reference (only the lever varies). Cross-checked ROLE_CHAINS.referenceFile
(sweep) against DESIGN_LIVE_SPECS.equivalenceReferencePaths (live test source of truth):

| chain | live test judges vs | sweep judges vs | aligned? |
|---|---|---|---|
| spec-author-propose | whole feature-proposals.md | feature-proposals.md | YES |
| spec-author-story (acs) | acs-spec-author-slice/ (3 AC files, a DIR) | acs/AC1-...json (ONE file, outputFile) | **NO , scope + shape mismatch** |
| architect-reviewer | architecture.S1-slice.json | architecture.json (FULL) | **NO , scope mismatch** |
| architect-estimator | estimates.FP-slice.json | estimates.FP-slice.json | YES (fixed d0d32f57) |
| dba | whole db-design.json | db-design.json | YES |
| test-strategist | test-list.S1-slice.json | test-list.S1-slice.json | YES (fixed) |
| ux-designer | whole design-guide.json | design-guide.json | YES |

**TWO chains still misaligned** (same bug class as estimate): (1) architect-reviewer , the per-story turn
accretes the feature architecture, so judge the S1 SLICE not the full file , CLEAN one-line referenceFile
fix. (2) spec-author-story , produces an acs/ DIR of multiple ACs, but the sweep's readReference reads ONE
file + the gate scores producedArtifacts[outputFile] (one AC) , needs the reference to be the acs-slice AND
the sweep to score the DIR (structurally harder; the file-based gate doesn't fit a dir-output turn).
STATUS: fixes queued behind the in-flight subagents (navigator + driver-green touch role-chains.ts /
optimize-role.cli.ts); apply once they land to avoid a mid-flight collision. The design-batch spec-author-story
(-63%) + architect-reviewer results were scored against the WRONG-scope reference , re-run both after the fix.

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
build-role-chains.ts:183. Creds: resolved from the single test-env home (.env.local.test.config , profile + owner read via resolveTestEnv; the literal host/profile live only in that gitignored file, never inlined here).

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
| navigator-red | 529.6s (sonnet) | m-opus-e-low | 65.9s | **88%** | model=opus, effort=low (APPLIED) |
| navigator-reflect | 666.8s (sonnet) | m-haiku-e-low | 101.1s | **85%** | model=haiku, effort=low (APPLIED; reflect made a tunable BuildTurn) |
| navigator-assess | , | none | , | , | no on-disk reference (verdict turn); held for #705 |
| navigator-review | , | none | , | , | no on-disk reference (verdict turn); held for #705 |
| _driver-green, driver-refactor_ | | | | | _pending Stage 4 (cloud)_ |

\* architect-reviewer has no baseline-relative winner (baseline blocks), but e-low is the only reliably-conformant + fast config , the actionable optimize conclusion.

**Headline across ALL swept chains: `effort=low` is the dominant win** (dba, spec-author-propose, spec-author-story, architect-estimator, architect-reviewer all favor low effort; test-strategist favors both analysts at low; ux favors opus+low). Cheaper models (haiku) consistently UNDER-deliver on the reasoning-heavy turns (propose/estimate/architecture/design-guide) , disqualified or quality-failed , so the win is EFFORT reduction at the capable model, not model downgrade.

---

## 2026-08-07 , champion-walk stack DEPRECATED + driver-green Stage 5 (live) launched

**Deprecated the OTHER (champion-walk) optimize engine** (`optimize-live.ts` + `optimize-autocontinue.ts`
+ `bin/consort/optimize.cli.ts`, runbook `optimize-scenario.sh`). It ranks on the fastest gate-passing
turn and runs an LLM judge only OPTIONALLY (design turns w/ a reference; build handoffs bypass a judge
entirely), violating the standing invariant that EVERY candidate is judged vs the recorded reference +
its output preserved. Actions: deprecation banners on all three modules + a stderr warning in the bin's
`main()`; `optimize-scenario.sh` moved to `examples/replay/deprecated/` (depth-compensated); OPTIMIZE-INDEX.md
topped with a deprecation notice; consolidation + replay READMEs repointed. NOT deleted , the
`consort-optimize`/`-apply` bins stay published + ~20 tests exercise the pure exports; removal is deferred
until optimize-apply's winner-persist path is re-homed onto the judged engine (`runRoleSweep`). The ONE
sanctioned launcher is `scripts/optimize-role.sh`. (96 champion-walk + apply tests still green.)

**driver-green Stage 5 live launch , EISDIR fix (real live-path bug).** First launch died instantly at
setup: `EISDIR: illegal operation on a directory, read`. Root cause: the driver-green judge's reference
(`readCampReference` -> `readFileSync`) pointed at the 003-driver `.../code/app` DIRECTORY (a tree of .py
files), not a file. The judge compares against the candidate's produced `app/**/*.py` concatenated, so the
reference must be built the SAME way. FIX: new `readCampAppDir(rel, what)` (exported) reads the app dir via
`snapshotTree`, concatenates its `.py` contents sorted-by-relpath (same currency as the candidate side),
throws loud if absent/empty; `readCampReference` unchanged for the genuine single-file refs (test-list.json,
verdict). GUARD: `tests/bdd/optimize-role-cli.test.ts` now asserts the real camp code pin resolves to
non-empty concatenated .py text + throws on a missing dir , the exact mistake can't reach a live launch
again (would have caught this hermetically). tsc clean; 18 CLI tests green.

Relaunched through the one launcher (`scripts/optimize-role.sh --chains driver-green --concurrency 4`,
always-rebuilds). Live now: shared scaffold cut ONCE, all 8 candidates (baseline, m-haiku, m-opus, e-low,
e-medium, m-haiku-e-low, m-opus-e-low, scan-tight) each in their OWN worktree + Lakebase branch off it,
4 in flight. Each judged by the build-code discriminator vs the 003-driver pin; winner is judge-ranked
(honest-GREEN AND judge-passed, fastest), NOT wall-clock. Results -> optimize-results/runs/20260807213518/.
_(scores row pending run completion.)_

---

## 2026-08-07 , CORRECTION: navigator-red + navigator-reflect winners were recorded WITHOUT a judge

Auditing every committed run summary (not just driver-green) surfaced a real invariant violation:

| chain (run) | timing | JUDGED (qualityPassed recorded) | winner | applied? |
|---|---|---|---|---|
| test-strategist (134637) | 10/10 | **10/10** | s-low+a-all-low | yes , VALID (judged) |
| navigator-red (141529) | 8/8 | **0/8** | m-opus-e-low | yes , **judge-less** |
| navigator-reflect (141529) | 7/8 | **0/8** | m-haiku-e-low | yes , **judge-less** |
| navigator-assess/review (141529) | , | 0 | none (verdict turn) | n/a |
| driver-green (213518) | (timing bug) | 8/8 | none (ranking bug) | no |

navigator-red + navigator-reflect were captured at 14:36 , BEFORE the mandatory-judge template landed
this session. Their candidate records carry only `gatePassed` + `medianMs`; `qualityPassed` is ABSENT.
So those winners were ranked on conformance + wall-clock with NO recorded judge verdict , and I APPLIED
them to the manifests (navigator-red.json opus+low, navigator-reflect.json haiku+low). That is
judge-less config in production, the exact thing the invariant forbids. There is no second code path:
the CURRENT engine (runOneCandidate -> buildChainJudge) DOES wire a judge for navigator-red
(makeOpusJudge kind:tests vs the recorded test-list) and reflect (verdict-alignment). The stale
summaries simply predate that wiring , the fix is to RE-RUN both through the judged engine and
re-confirm or replace the applied winner against a real verdict. Lean chains (no cloud), so cheap.
Queued behind the driver-green re-run (never overlap live sweeps).

## driver-green re-run (after the 3 fixes)
Relaunched `--chains driver-green --concurrency 4` on the fixed engine (EISDIR ref-as-dir, durationMs
ranking override, keep-dir-on-failed-Lakebase-delete). Results -> runs/20260807220243/. Expect: 8
candidates honest-GREEN + judged + PRESERVED, a judge-ranked winner (now that durationMs flows), clean
teardown (fail-loud + orphan-reclaim), zero orphans.

---

## 2026-08-07 , driver-green re-run: WINNER found + the teardown-orphan ROOT CAUSE

Re-run (20260807220243) on the fixed engine: all 8 candidates honest-GREEN + judge PASSED (equivalent)
with REAL distinct durations (the durationMs fix works). Judge-ranked winner:

| candidate | ms | vs baseline |
|---|---|---|
| **m-opus-e-low** | 293223 | **-43% (WINNER)** |
| e-low | 314782 | -39% |
| e-medium | 373655 | -27% |
| scan-tight | 406442 | -21% |
| baseline | 513514 | , |
| m-haiku-e-low | 558060 | +9% |
| m-opus | 698270 | +36% |
| m-haiku | 715791 | +39% |

summary.json: winner=m-opus-e-low, every candidate gate=True judge=True. The judge invariant held on all 8
+ artifacts preserved. **driver-green optimize conclusion: opus+low (fastest, quality-equivalent).**

### Teardown orphan , ROOT CAUSE (both Stage-5 runs leaked a live dg-live project)
`databricks postgres delete-project` is ASYNC/eventually-consistent: it returns exit 0 (request accepted),
so `runDatabricks` does NOT throw, `remove-project` reports ok:true + removes the local dir , yet the
project LINGERS (a candidate branch still being torn down, or plain propagation). The orphan sweep then
can't reclaim it because its only key (the local dg-live-* dir's .env) is already gone. So a
fire-and-forget delete + a dir-keyed sweep BOTH miss an async-lingering project. (My earlier keep-dir-on-
throw fix addressed a DIFFERENT mode , a thrown delete , which never fired here.)
FIX: `teardownDriverGreenProject` now CONFIRMS deletion , `confirmLakebaseProjectDeleted(id, host)` polls
`getProjectInfo` (undefined==404==gone) and RE-DELETES (up to 5x, 3s backoff) using the id+host held on
the scaffold (no local-dir dependency). Best-effort, never throws; orphan sweep still the final backstop.
LIMITATION: this is a live-only path (real getProjectInfo/deleteLakebaseProject) , its proof is the NEXT
live run showing zero orphans, not a hermetic test. Both leaked projects were deleted by hand
(`databricks postgres delete-project`); zero orphans confirmed after.

---

## 2026-08-07 , driver-turn discriminator = the NEXT-STEP NAVIGATOR's determination (Stages 0-4)

Replaced the driver-green code-pin judge with a truer discriminator: judge a driver candidate the way the
workflow does , run the navigator evaluation turn that FOLLOWS that driver turn (pinned opus-high) on the
candidate's output, compare THAT determination to the recorded one. Directional on issues:
PASS (same/coverage-equivalent) / PASS-WITH-HONORS (fewer/none , flagged, better) / FAIL (more/different).

- **Stage 0 (containment):** three recorded determinations copied into a CONTAINED camp home
  `consort/evaluation/reference-assets/stockflow/next-step/{driver-green,driver-repair,driver-refactor}/`
  (read via BUILD_CORPUS_REL, corpus assumed deleted). Corpus survey fixed the mapping: driver-green→004
  assess (superseded-shift), driver-repair→006 assess (regression+fixDirective; 008 was stub-polluted, NOT
  used), driver-refactor→010 review (refactor:true, the drop-column client cleanup). README + provenance.
- **Stage 1 (judge):** new `evaluateNextStepDetermination` in semantic-gate.ts , directional trichotomy
  built on the EXISTING parsers (parseNavigatorAssessMarker + makeSupersessionDeltaJudge for assess;
  parseVerdictFile + makeVerdictAlignmentJudge for review). Refactor uses RESOLUTION semantics (no recorded
  turn after it): candidate's post-refactor review must come back clean (refactor:false) = PASS. 9 new
  hermetic cases.
- **Stage 2 (harness):** after the driver turn + honest-GREEN, run ONE more live turn , the navigator eval
  nextTransition routes to , pinned opus-high; capture its marker from the RESOLVED consortDir via
  cycleDir() (never hardcoded .sftdd) as RunDriverGreenResult.nextStepMarker.
- **Stage 3 (CLI):** driver-green judge swapped to evaluateNextStepDetermination vs the contained ref;
  driver-repair + driver-refactor handles added (DRIVER_TURN_SPECS); the "driver" set now expands to all
  three. The navigator evaluation is DURABLY stored per candidate at
  `<candidate>/artifacts/navigator-eval/<file>` + indexed in replay.json , a first-class REUSABLE SAMPLE
  for a separate test OF THE NAVIGATOR (how it assessed/reviewed each driver candidate).
- **Stage 4 (guard + suite):** three-handle contained-reference-resolution guard (parses each recorded
  determination); driver-set expansion test. tsc clean; full suite 3443 green.

**OPEN (Stage 2b, before the gated live run):** driver-REPAIR and driver-REFACTOR need their flagged
pre-turn SEED states captured into the contained setup bundle (tests/integration/live/driver-green-setup/).
runDriverGreenOnScaffold currently THROWS loud for driverTurn != "green" (never silently runs the wrong
seed). driver-GREEN is fully wired + its next-step (assess) captured. Stage 5 (gated live) runs green first.

---

## 2026-08-07 , Stage 2b: driver-repair + driver-refactor SEEDS captured + wired (turn-aware)

The seed for each driver turn IS the recorded PRE-TURN snapshot (the user: "it's in the corpus, it's the
next step") , same pattern as driver-green's code-assets (recorded 002-navigator). Captured into the
CONTAINED setup bundle (corpus assumed deleted):
- `driver-green-setup/repair-seed/`   <- recorded 006-navigator-assess: code/ + cycles/ (S3/AC1
  green-failure assessed + regression-assessment w/ fixDirective => repairRegressionAc routes to REPAIR).
- `driver-green-setup/refactor-seed/` <- recorded 010-navigator-review: code/ + cycles/ (S3 story
  review-verdict refactor:true => refactorStoryPending routes to REFACTOR).
Wiring: layBundle(projectDir, consortDir, driverTurn) overlays the turn's code tree + (repair/refactor)
overlays the recorded cycle markers into <consortDir>/cycles/ so the drive's OWN probes route to the turn
(no hand-set flags). The pipeline open-RED batch is green-only; the drive stopWhen matches the target
driver turn's buildMode; the honest-GREEN hard-assert is green/repair-only (refactor runs on green code).
The removed throw guard is gone , all three driverTurns drive. tsconfig + vitest EXCLUDE the *-seed
code-assets (scaffold fixtures, not our suite; they carry react/playwright client tests).

Hermetic guards (optimize-role-cli.test.ts): each contained next-step REFERENCE parses to a real
determination; each SEED carries the recorded routing markers (repair: assessed green-failure +
fixDirective; refactor: review-verdict refactor:true). tsc clean; full suite 3443 green.

The clean-model chain per driver turn (all judged by the NEXT-STEP navigator at opus-high vs the recorded
determination , same=PASS, fewer=PASS-WITH-HONORS[flagged], more=FAIL; navigator eval stored per candidate
at artifacts/navigator-eval/ as a reusable sample for a future navigator test):
  driver-green   -> navigator ASSESS  (vs recorded 004)
  driver-repair  -> navigator ASSESS  (vs recorded 006)
  driver-refactor-> navigator REVIEW  (resolution: candidate's post-refactor review must be clean)

LIVE-ONLY correctness (that each seed routes to its intended turn) is confirmed at the gated Stage-5 run.

---

## 2026-08-08 , CORRECTION + disk audit: which PRESERVED outputs actually have a discriminator verdict

I stated two contradictory things and the user caught it. Squaring it: the current CODE discriminates
every chain (buildChainJudge, guarded) , TRUE going forward. But several PRESERVED on-disk runs predate
the mandatory judge and were never discriminated , which I understated (named only red+reflect earlier).

Disk audit (qualityPassed present per candidate in each run's summary.json):
| run / chain | verdict on disk | judge target preserved | re-judgeable from disk |
|---|---|---|---|
| test-strategist 20260807134637 | 10/10 ✓ | yes | reproduce-check |
| driver-green 20260807213518 + 220243 | 8/8 ✓ | yes | reproduce-check |
| navigator-red 20260807141529 | 0/8 ✗ | yes (tests/**) | YES (reconstruct primary=concat tests) |
| navigator-reflect 20260807141529 | 0/8 ✗ | NO (reflect-verdict.json absent) | no -> fresh live run |
| navigator-assess 20260807141529 | 0/8 ✗ | NO (no artifacts/ dir) | no -> fresh live run |
| navigator-review 20260807141529 | 0/8 ✗ | NO (no artifacts/ dir) | no -> fresh live run |

So the ENTIRE navigator run (all 4 chains) is undiscriminated on disk, and 3 of the 4 preserved no
re-judgeable target (predate always-on preservation too). Only navigator-RED can be re-judged in place.
This is the "all runs recorded the SAME way" drift (feedback_no_judgeless_applied_winners): the applied
navigator winners (red opus+low, reflect haiku+low) got applied WITHOUT a discriminator verdict.

Plan (respecting the parallelism cap , the driver sweep is LIVE now):
- #721 re-judge IN PLACE: navigator-red (first real verdict) + reproduce-checks on test-strategist +
  driver-green. Harness reuses buildChainJudge against the preserved artifacts/ (reconstruct `primary`
  as the live judge built it). Built hermetically; RUN after the driver sweep tears down clean.
- #722 fresh LIVE run: navigator-assess + navigator-review + navigator-reflect (judge target not on
  disk) , the only way they get a verdict + preserved output. Sequenced after #721.

---

## 2026-08-08 , BUG found while building the re-judge harness: navigator-red judge never scored (primary=undefined)

Building #721 surfaced a real latent defect. runOneCandidate sets `primary = producedArtifacts[chain.outputFile]`.
For navigator-red, outputFile is the "tests" DIRECTORY , but snapshotTree only ever keys INDIVIDUAL files
(tests/conftest.py, ...), never the bare "tests". So primary is ALWAYS undefined and the red judge branch
short-circuits: `if (primary === undefined) return { passed:false, reason:"no tests produced to judge" }`.
=> navigator-red's discriminator NEVER actually scored the produced tests. (Consistent with the 141529 run
showing 0/8 verdicts + a timing-only "winner" , that run was never really judged.)
navigator-assess is NOT affected (its judge reads producedArtifacts by filename suffix, not `primary`).

FIX: reconstruct the judged text the way the functional judge expects , concatTreeFiles(producedArtifacts,
"tests/", [.py,.ts,.tsx]) (sorted, deterministic), falling back to `primary` for a file-shaped outputFile.
Extracted concatTreeFiles as a pure exported helper + hermetic guard (optimize-role-cli.test.ts): proves the
reconstruction yields non-empty text from tests/** when there is no bare "tests" key (the exact bug), and
empty only when nothing under tests/ matches. tsc clean; 24 CLI tests green.

CONSEQUENCE for the re-judge plan: navigator-red IS re-judgeable in place (#721) , its tests/** are
preserved and the judge now scores them for the first time. The applied navigator-red winner (opus+low) was
chosen from an unjudged run, so #721's re-judge is what finally gives it a real verdict.

---

## 2026-08-08 , driver next-step LIVE run (20260808012757) HUNG , recovered, diagnosed

The 3-chain live run stalled ~4.5h on driver-green wave 1. The user flagged it ("it cannot be running
still") , correct: parent pid was STAT=SN, %CPU 0.0, log mtime frozen 4.5h. My earlier "pid ALIVE" checks
were shallow (liveness != progress). LESSON: for a live sweep, check log-mtime advancement + %CPU +
child-proc state, not just "process exists".

Diagnosis (from the log + persisted trials, NOT a guess):
- Only m-opus completed cleanly (gate=True, judge pass-with-honors, 485.8s) , the new next-step-navigator
  discriminator WORKS live (pass-with-honors = candidate's assess found fewer/no issues than recorded).
- The other 5 persisted gate=False/quality=None: they did NOT fail tests (0 pytest FAILED in the log;
  only 2 transient API errors). They never reached honest-GREEN verify , a `cycle.cli green` subprocess
  WEDGED (leaked uvicorn + esbuild children left running; the green cycle spins up the app server + client
  build and something there hung, never returned), blocking the bounded-concurrency pool. A haiku driver
  turn ran 772s just before the freeze.
- NOT a code regression from the turn-aware seeding (the green path reached the driver turn fine; the hang
  is in the green-cycle app-server/client-build subprocess under concurrency).

Recovery (per the no-kill-9-a-live-sweep rule): SIGTERM parent (finally did NOT complete teardown , Node
terminates the event loop before an await-blocked finally runs, so 2 dg-live projects + 1 worktree
orphaned , EXPECTED for SIGTERM-during-await). Then reclaimed by hand: TERM the leaked child procs,
`databricks postgres delete-project` the 2 orphans (dg-live-20260808-012757 + -012744), rm the worktree.
VERIFIED: zero dg-live orphans, no worktree dirs, no procs. Partial run dir kept (m-opus's real verdict).

OPEN: the green-cycle-subprocess hang needs a bounded timeout (a wedged app-server/client-build must fail
the candidate, not hang the pool). Until then a live driver sweep can stall. Re-run of Stage 5 + the #721
re-judge + #722 fresh run are BLOCKED on either that timeout fix or a manual watch.

---

## 2026-08-08 , #721 re-judge harness + green-cycle hang FIX (both landed hermetically)

**Green-cycle hang root cause (Explore-confirmed) + FIX.** deploy.ts `defaultRunVerify` ran
`execSync(cmd, {...})` with NO timeout , a wedged verify (pytest + client build / an app server that
never returns) blocked forever, and the app-stop `finally` never ran (the 4.5h stall). FIX: pass
`timeout` (read per-call from LAKEBASE_VERIFY_TIMEOUT_MS, default 15min) + killSignal SIGTERM; a timeout
is CAUGHT and returned as passed:false with a "VERIFY TIMED OUT" reason (not rethrown), so the caller's
finally runs `stop()` and the app always comes down. Hermetic guard (consort-deploy.test.ts): `sleep 30`
under a 0.4s bound returns passed:false + "TIMED OUT" in <5s (proves no hang); a fast `true` still passes.
tsc clean; 41 deploy tests green.

**#721 re-judge harness (independent recheck of preserved outputs).** New `runRejudge(runDir)` +
`--rejudge` CLI flag + `loadPreservedArtifacts` (reads a candidate's artifacts/ back to the
producedArtifacts map). Reuses the SAME discriminators the live sweep uses: `buildChainJudge`
(design/navigator) + `buildDriverNextStepJudge` (driver , extracted + shared with sweepDriverGreen, DRY).
Per candidate: reconstruct output, re-judge vs the recorded reference, write rejudge.json, flag
REPRODUCED / DIVERGED / first-verdict. NO live drive / cloud / green-cycle , pure opus judges over
preserved bytes (safe to run independent of a live sweep). Also fixed a LATENT BUG it exposed: the red
judge's `primary` (outputFile "tests" = a dir) was always undefined => it never scored; now reconstructs
via concatTreeFiles(tests/**). Guards: loadPreservedArtifacts round-trip + concatTreeFiles + red-judge.

RESULTS (run in progress, LOCAL, no cloud): test-strategist 20260807134637 re-judge = REPRODUCED on every
candidate seen (7 PASS + 1 FAIL reproduced) , the stored verdicts re-derive exactly, in BOTH directions.
navigator-red 20260807141529 = re-judging next (its FIRST real verdict , the run predated the working
judge). driver-green 20260807220243 is NOT a valid target (it predates the next-step discriminator +
preserved no navigator-eval marker , a discriminator mismatch, correctly excluded).

---

## 2026-08-08 , #721 re-judge: RESULTS + two harness bugs the run exposed (both fixed + guarded)

First re-judge run (LOCAL, opus judges, no cloud , recovered clean, no orphans) produced:
- **test-strategist 20260807134637: EVERY candidate REPRODUCED** , stored verdicts re-derive exactly,
  passes AND fails (s-haiku FAIL reproduced). The independent-recheck invariant proven on real data.
- **navigator-red 20260807141529: real scores now** (baseline 0.82, e-medium FAIL, ...) , its FIRST
  actual verdicts (the run predated the working red judge). Also validates the `primary`-undefined fix live.
- **navigator-assess/review: correctly "NO preserved artifacts, cannot re-judge"** , the un-recheckable gap.

Two BUGS the run exposed (fixed + hermetic guards; re-run of the re-judge underway for correct on-disk labels):
1. **Reproduce mislabel.** classifyReproduce keyed on storedClass===freshClass; a telemetry.json that EXISTS
   but holds NO verdict (never-judged run) gave undefined===undefined => false "REPRODUCED" instead of
   "first-verdict". FIX: classifyReproduce keys on whether a stored verdict VALUE exists; compares the right
   KIND (classification exact; score within |Δ|<=0.1). Guard: first-verdict/reproduced/diverged cases.
2. **Degenerate FAIL vs not-rejudgeable.** navigator-reflect preserved its code tree but NOT
   reflect-verdict.json (the file its judge scores), so the judge returned passed:false "no reflect-verdict
   produced to judge" , the harness recorded a bogus fresh FAIL. FIX: isMissingJudgeTarget() detects the
   judges' "no ... to judge" family => records rejudgeable:false "judge target not preserved" (same category
   as an empty artifacts/ dir), never a FAIL. Guard: the reason family + a genuine-content-FAIL negative.

Corrected re-judgeability map (disk-verified): re-judgeable in place = test-strategist (reproduce),
navigator-red (first-verdict). NOT re-judgeable (judge target not preserved) = navigator-assess + -review
(no artifacts) + navigator-reflect (no reflect-verdict.json) => all need the #722 fresh live run.
