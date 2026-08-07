# Optimize experiment run log

Autopilot run of the one-`.sh` optimize experiment across every manifest turn-chain
(design + build), reference-seeded, parallel candidates. Plan: `~/.claude/plans/giggly-petting-whisper.md`.
Each stage: build → tsc + hermetic suite → source-only commit → live proof → record scores → fix-and-rerun on failure.

Branch: `fix/headless-permission-mode-acceptedits`. LOCAL only; nothing pushed.

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

Live findings during the run (the sweep working as designed):
- `spec-author-propose`: `m-haiku` AND `m-haiku-e-low` DISQUALIFIED (emitted "blocked" past retry budget) , a real signal that **haiku is too weak for the propose turn**; baseline/e-low/e-medium/m-sonnet/m-sonnet-e-low PASSED. Sweep continued (disqualify-and-continue works live under parallelism).
- `architect-estimator`: **baseline itself quality-FAILED (0.68)** vs its reference. CALIBRATION FOLLOW-UP (not a crash): the estimate chain's `referenceFile` likely scores the isolated estimate turn against a WIDER `estimates.json` than the turn is seeded to produce (the F1/F6 entries added later by sync-backlog) , the same scope-mismatch `DESIGN_LIVE_SPECS.estimate.equivalenceReferencePaths` fixes with `estimates.FP-slice.json`. When baseline fails quality, the chain yields "no winner" (baseline levers stand). FIX (queued): point `ROLE_CHAINS["architect-estimator"].referenceFile` at the FP-slice. Non-blocking , other chains unaffected.

## Stage 4 — driver build chains (live cloud) , pre-approved, in progress

SEED RESOLVED: the faithful pre-GREEN driver seed is the recorded `002-navigator` tree (RED tests present, impl absent , 46 files) under `examples/replay/corpora/stockflow-rerecord/recorded-build/features/F1-stock-visibility/stories/S1-file-stock/turns/002-navigator/code`; `003-driver` (54 files, impl added) is the GREEN result to judge against. Driver-green chain = seed 002 -> live driver GREEN turn -> honest-GREEN verify on a per-candidate Lakebase branch -> discriminator judge vs 003. Build pending (see [[project_optimize_every_chain_parallel]] for the full Stage 4 spec).

---

## Scores (winners per chain)

| Chain | Baseline | Winner | Winner time | Saved | Winner levers |
|---|---|---|---|---|---|
| dba | 29.5s (opus) | m-sonnet-e-low | 20.9s | 29% | model=sonnet, effort=low |
| test-strategist | 665.7s (sonnet) | a-all-low | 223.4s | 66% | analysts behavior+fitness effort=low |
| spec-author-propose | 49.0s (opus) | e-low | 29.6s | 39% | effort=low (haiku disqualified) |
| spec-author-story | 31.0s (opus) | e-low | 11.5s | 63% | effort=low |
| architect-estimator | 17.9s (opus) | _re-run pending_ | | | (batch-1 stale ref; FP-slice fix d0d32f57) |
| architect-reviewer | (opus, baseline blocked) | _re-run pending_ | | | e-low/e-medium reliably pass; hi-effort blocks (role reliability finding) |
| _ux-designer_ | | | | | _pending batch 2_ |
| _navigator-red, navigator-assess_ | | | | | _pending (lean build chains, wire into CLI chain-set)_ |
| _driver-green, driver-refactor_ | | | | | _pending Stage 4 (cloud)_ |
