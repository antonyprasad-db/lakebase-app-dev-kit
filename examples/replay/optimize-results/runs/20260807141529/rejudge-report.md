# Independent re-judge report , run 20260807141529 (navigator: red / assess / review / reflect)

Generated 2026-08-08 by `optimize-role.cli --rejudge` (LOCAL opus judges over the PRESERVED outputs; no
live drive / cloud). This whole run PREDATES the mandatory-judge engine , its `summary.json` recorded 0/8
verdicts on every chain. The re-judge gives its outputs their FIRST discriminator verdict where the judged
target was preserved, and flags where it was NOT (un-recheckable , they need a fresh live run, #722).
Per-candidate detail is in each `<candidate>/rejudge.json`.

## navigator-red , 8/8 FIRST-VERDICT (real scores; the run was never actually judged)

Preserved `tests/**` (the judged target). Functional threshold = 0.75. NOTE: these are FIRST verdicts,
not reproduces (the original run stored none) , and they REQUIRED the primary-reconstruction fix
(concatTreeFiles), without which the red judge short-circuited to "no tests produced".

| candidate | fresh | score |
|---|---|---|
| baseline | PASS | 0.80 |
| e-low | PASS | 0.80 |
| e-medium | PASS | 0.80 |
| m-haiku | PASS | 0.78 |
| m-haiku-e-low | PASS | 0.80 |
| m-opus | PASS | 0.80 |
| m-opus-e-low | PASS | 0.80 |
| scan-tight | PASS | 0.80 |

All pass (>= 0.75), clustered 0.78-0.80. CAVEAT: scores sit close together just above the bar; e-medium
flipped PASS/FAIL across two re-judge runs (0.80, right at the low end) , judge variance at the margin, not
a stable separation. The applied navigator-red manifest winner (opus+low) is CONFIRMED viable (m-opus-e-low
passes), though the near-flat scores mean the lever choice is not strongly discriminated here.

## navigator-review , 2/8 first-verdict, 6/8 NOT rejudgeable

Only m-opus + m-opus-e-low preserved a review-verdict; both re-judge PASS (first-verdict). The other 6
preserved no artifacts.

| candidate | result |
|---|---|
| m-opus | first-verdict PASS |
| m-opus-e-low | first-verdict PASS |
| baseline, e-low, e-medium, m-haiku, m-haiku-e-low, scan-tight | NOT rejudgeable (no preserved artifacts) |

## navigator-assess , 0/8 rejudgeable (NO preserved artifacts)

Every candidate preserved no `artifacts/`. Cannot be re-judged from disk , needs a fresh live run (#722).

## navigator-reflect , 0/8 rejudgeable (judge target not preserved)

Preserved the code tree but NOT `reflect-verdict.json` (the file the reflect judge scores); one candidate
preserved nothing. Cannot be re-judged from disk , needs a fresh live run (#722).

## Bottom line
- Re-judgeable + verdicted here: navigator-red (8, first-verdict) + navigator-review (2, first-verdict).
- NOT re-judgeable (outputs/verdict-target not preserved): navigator-assess (8) + navigator-reflect (8) +
  navigator-review (6) => a fresh live run through the current judged+preserving engine is the ONLY way
  these get a verdict + durable output (#722). This is the preservation gap: the run predates always-on
  preservation, so "independent recheck" is impossible for them until re-captured.
