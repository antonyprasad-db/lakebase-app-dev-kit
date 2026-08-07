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

## Stage 2 — test-strategist per-analyst permutation candidates + supervisor consistency

_in progress_

---

## Scores (winners per chain)

| Chain | Baseline | Winner | Winner time | Saved | Winner levers |
|---|---|---|---|---|---|
| dba | 29.5s (opus) | m-sonnet-e-low | 20.9s | 29% | model=sonnet, effort=low |
| _spec-author-story, architect-reviewer, spec-author-propose, architect-estimator, ux-designer_ | | | | | _pending full design-set run (Stage 3)_ |
| _test-strategist_ | | | | | _pending Stage 2 per-analyst sweep_ |
| _navigator-red, navigator-assess_ | | | | | _pending Stage 3_ |
| _driver-green, driver-refactor_ | | | | | _pending Stage 4 (cloud)_ |
