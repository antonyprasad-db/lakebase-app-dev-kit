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
