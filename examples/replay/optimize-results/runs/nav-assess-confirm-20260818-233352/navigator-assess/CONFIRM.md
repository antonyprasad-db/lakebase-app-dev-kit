# navigator-assess confirm sweep , live sonnet-default baseline + opus x3 variance

Turn `0157-navigator-assess`, replayed through the unified lean path, graded by the TIGHTENED assess
discriminator (regression fidelity). Fills the gap the panel left (`baselineMs=0`, n=1) with a live
sonnet-default baseline + opus replicas.

| candidate | wall | cost | turns | fidelity |
|-----------|------|------|-------|----------|
| sonnet (default = the baseline) | 174.8s | $0.685 | 10 | PASS |
| opus     | 93.7s  | $0.644 | 12 | PASS |
| opus-2   | 174.6s | $0.904 | 12 | PASS |
| opus-3   | 159.4s | $0.821 | 8  | PASS |
| opus (panel, prior run) | 143.8s | $0.841 | 12 | PASS |

## opus vs the sonnet default

- **Speed**: opus mean 142.9s (range 93.7-174.6s, stdev 30.4s) vs sonnet 174.8s , **18% faster on
  average**, but HIGH variance: the slowest opus run (174.6s) tied the baseline.
- **Cost**: opus mean ~$0.80 vs sonnet $0.685 , **~17% more expensive** on average (one opus run was
  cheaper, one was +32%).
- **Fidelity**: opus held the correct root-cause determination 4/4; sonnet held it too. Correctness is
  not the differentiator , both are right.

## Call

opus buys ~18% average latency on the assess turn for ~17% more cost, with noticeable run-to-run
variance. Assess fires only on a failed honest-GREEN verify and sits on the self-heal critical path
(the story is blocked until it lands), so latency there is worth more than the ~$0.12/call premium ,
which argues for opus. But it is a genuine speed-for-cost trade, not a free win, and the harness
crowns no winner because the DETERMINATION only matches (never beats) the baseline. Either lever is
defensible; the durable result is the tightened discriminator that made this an honest comparison.
