# Optimize results — the per-role lever sweep record

Persistent, committed archive of the per-handoff optimization champion walk, one
subdirectory per role handoff, accumulated as the sweep progresses down the
orchestrator's lane (design then build). This survives throwaway-project teardown
(the raw `experiments/` lives inside the scaffolded project, which is destroyed);
`archive-optimize-results.sh` copies each role's results here as it completes.

## Layout

```
optimize-results/
  <handoff-id>/                     e.g. spec-author, S1-record-stock-architect-reviewer
    summary.json                    winner + per-candidate median ms / gate / cost
    report.md                       the champion-walk report table from the run
    champion-walk.json              the recorded winner
    <candidate-id>/trial-N/result.json   raw per-trial gatePassed/durationMs/costUsd/tokens
```

## Lever set swept per role (defaultLaneCandidates)

From an identical pre-turn state, each role tries: baseline, every cheaper model
tier (opus→sonnet→haiku), cheaper effort rungs (low, medium), the model×effort
cross at low, and a hard scan-tighten (deny Grep/Glob). Fastest gate-passing wins;
its artifacts advance to the next role. Winners applied to the kit are noted in
each `summary.json` and the kit commit log.

## Chain-sweep runs (`runs/`) — repeat + compare

The per-CHAIN lever sweep (`scripts/optimize-role.sh --chains <set|list>` , the
one launcher) writes each run to a timestamped subdir here:

```
optimize-results/
  runs/
    <YYYYMMDDHHMMSS>/            one run
      rollup.txt                 one winner line per chain
      <chain>/
        summary.json             winner + per-candidate median ms / gate / quality
        report.txt               the ranked report
        <candidate>/             telemetry.json + artifacts/ + replay.json
```

**Repeat the experiment:** just run `--chains <set>` again. Each run lands in a new
`runs/<timestamp>/` (prior runs are never clobbered).

**Compare against a baseline / prior run:** the CLI automatically picks the **newest
prior run under `runs/`** as the baseline and prints a per-chain delta
(`[compare] <chain>: winner unchanged/CHANGED … baseline <ms> -> <ms>`). To pin a
specific baseline, keep its `runs/<timestamp>/` dir committed; to diff by hand,
`diff` two `summary.json` files. `summary.json` is the durable, diffable record —
same shape as the design-lane `<handle>/summary.json` above.
