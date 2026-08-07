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

## Stage 4 — driver build chains (live cloud) , pre-approved, in progress

---

## Scores (winners per chain)

| Chain | Baseline | Winner | Winner time | Saved | Winner levers |
|---|---|---|---|---|---|
| dba | 29.5s (opus) | m-sonnet-e-low | 20.9s | 29% | model=sonnet, effort=low |
| test-strategist | 665.7s (sonnet) | a-all-low | 223.4s | 66% | analysts behavior+fitness effort=low |
| _spec-author-story, architect-reviewer, spec-author-propose, architect-estimator, ux-designer_ | | | | | _pending full design-set run (per-chain batches under the cap)_ |
| _navigator-red, navigator-assess_ | | | | | _pending (lean build chains)_ |
| _driver-green, driver-refactor_ | | | | | _pending Stage 4 (cloud)_ |
