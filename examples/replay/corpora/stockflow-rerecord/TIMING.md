# stockflow-rerecord , per-turn timing (optimization signal)

Measured from the run's `agent-log.jsonl` `turn.usage` events (`metadata.duration_ms`
+ `cost_usd`), NOT wall-clock. This matters: the run's wall-clock spanned ~21.7h,
but most of that was dead time (two OAuth/IP outages + a manual pause + between-relaunch
windows), which the corpus/agent-log timeshift removed while PRESERVING every real
per-turn duration. So these numbers are the true compute, immune to the outage gaps.

(The kit's `lakebase-sftdd-timing` "slowest spans" reports the OUTAGE gaps , 619 min,
222 min , because it measures between-event wall-clock. Use this duration_ms rollup
for optimization, not the gap-span view.)

## Totals

- **69 agent turns** carrying usage, **324 min (5.4 h)** of real agent compute, **~$48**.

## By role

| role | min | % time | $ | turns | avg min/turn |
|---|---:|---:|---:|---:|---:|
| navigator | 162.4 | 50% | $21.17 | 26 | 6.2 |
| driver | 108.8 | 34% | $14.64 | 15 | 7.3 |
| test-strategist | 22.2 | 7% | $4.98 | 7 | 3.2 |
| spec-author | 15.2 | 5% | $3.25 | 9 | 1.7 |
| architect-reviewer | 11.8 | 4% | $2.93 | 9 | 1.3 |
| ux-designer | 2.3 | 1% | $0.35 | 1 | 2.3 |
| dba | 1.7 | 1% | $0.51 | 2 | 0.8 |

## By model

| model | min | % time | $ | turns |
|---|---:|---:|---:|---:|
| sonnet | 269.7 | 83% | $35.72 | 40 |
| opus | 50.8 | 16% | $11.66 | 27 |
| haiku | 3.8 | 1% | $0.44 | 2 |

## Longest turns

The 8 longest turns (11-25 min each) are ALL navigator/driver on sonnet, in the
build lane.

## Optimization signal

- **The BUILD lane is the target.** navigator + driver together are **84% of time
  and 75% of cost**, all on sonnet. The design lane (opus: spec-author, architect,
  dba, ux) is cheap and fast by comparison.
- **navigator RED turns are the #1 lever** , the single largest role slice (50% of
  time), and its longest turns are the RED test-authoring turns that re-read the
  design tree each time. Cutting the navigator's per-turn context re-reads (a richer
  inline context pack, fewer round-trips) attacks the biggest block directly.
- The driver's longest turns are the multi-AC GREEN passes; the build context pack
  (rubric + module layout + test locations, injected inline) already targets these.
