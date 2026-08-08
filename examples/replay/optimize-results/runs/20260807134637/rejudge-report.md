# Independent re-judge report , run 20260807134637 (test-strategist)

Generated 2026-08-08 by `optimize-role.cli --rejudge` (LOCAL opus judges over the PRESERVED outputs; no
live drive / cloud). Each candidate's preserved `artifacts/` was re-scored through the SAME discriminator
the sweep uses (buildChainJudge, design/semantic) and compared to the stored `telemetry.json` verdict.
Per-candidate detail is in each `<candidate>/rejudge.json`.

## Verdict: REPRODUCED on every candidate (10/10)

The stored verdicts re-derive from the preserved outputs , the "everything preserved so an independent
judge can re-evaluate" invariant holds, in BOTH directions (a stored FAIL reproduces as FAIL).

| candidate | fresh | score | Δscore vs stored | reproduce |
|---|---|---|---|---|
| a-all-low | PASS | 1.00 | 0.00 | REPRODUCED |
| a-behavior-haiku | PASS | 0.92 | 0.02 | REPRODUCED |
| a-cheap-hold-fit | PASS | 0.90 | 0.00 | REPRODUCED |
| a-fitness-low | PASS | 1.00 | 0.05 | REPRODUCED |
| a-fitness-opus | PASS | 0.95 | 0.00 | REPRODUCED |
| baseline | PASS | 0.92 | 0.01 | REPRODUCED |
| s-haiku | **FAIL** | 0.80 | 0.00 | REPRODUCED (fail reproduced) |
| s-haiku+a-all-low | PASS | 0.85 | 0.07 | REPRODUCED |
| s-low | PASS | 0.93 | 0.03 | REPRODUCED |
| s-low+a-all-low | PASS | 1.00 | 0.00 | REPRODUCED |

All deltas <= 0.07 (well within the 0.1 reproduce tolerance; opus judges are near-deterministic, not
bit-identical). Design/semantic threshold = 0.85; the sole FAIL (s-haiku, 0.80) reproduced exactly.
