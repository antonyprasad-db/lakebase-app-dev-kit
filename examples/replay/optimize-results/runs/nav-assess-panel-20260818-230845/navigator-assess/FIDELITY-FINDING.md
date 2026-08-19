# navigator-assess lever panel , fidelity finding

Turn `0157-navigator-assess`, AC `AC1-detail-view-shows-batch-and-serial`, replayed off
the corpus turn through the unified lean path. 5 candidates, discriminator = the assess
next-step determination vs the recorded turn's determination.

## Raw result (harness `report.txt`)

| candidate     | wall    | cost   | turns | discriminator | root-cause fidelity |
|---------------|---------|--------|-------|---------------|---------------------|
| haiku         | 71.6s   | $0.17  | 2     | PASS (viable) | **WRONG** , blames `inventory_code`/serializer; no `fixDirective` (wrote `fix`) |
| haiku-e-low   | 116.6s  | $0.22  | 12    | PASS (viable) | **WRONG** , blames `StockOut.model_validate`/ORM load; fix aimed at wrong layer |
| opus          | 143.8s  | $0.84  | 12    | PASS (viable) | **CORRECT** , `repos.stock` import-ordering; valid `fixDirective` |
| sonnet-e-low  | 230.6s  | $0.87  | 22    | PASS (viable) | **CORRECT** , same root cause; concise valid `fixDirective` |
| opus-e-low    | 253.1s  | $1.54  | 25    | PASS (viable) | **CORRECT** , same root cause; valid `fixDirective` |

Mechanical WINNER: none (no candidate's determination beat the recorded baseline; all matched = SAME).

## The finding

The current discriminator gates on the determination **class** (genuine-regression vs
supersession = "driver-fixable regression (viable)"). All 5 candidates landed that class,
so all "pass the score." But the **assessment content** diverges:

- The genuine root cause is an import-ordering bug: `app/repositories/__init__.py` is empty, so
  `repos.stock` only resolves after some *other* test imports the submodule. T48 collects first
  -> `AttributeError` at `app/services/stock.py:45`. Fix: `from app.repositories import stock`
  in `__init__.py`. (opus / sonnet-e-low / opus-e-low + the recorded baseline all reach this.)
- **haiku (71.6s, fastest) is fast because it stopped at 2 turns without finding the bug.** It
  misdiagnoses (blames the dropped `inventory_code` column / serializer, which is not what T48
  exercises) AND writes the fix under the key `fix` instead of `fixDirective` , a malformed
  artifact the downstream driver-fix consumer would not read.
- **haiku-e-low (116.6s)** is plausible-sounding but also wrong: it blames `StockOut.model_validate`
  / ORM loading and aims the fix at the wrong layer.

## Conclusion

"Fastest that holds the score" is a mirage for assess at the current discriminator resolution:
the two haiku variants win on wall-clock only by producing an assessment that would misdirect the
driver. Among candidates that produce a **correct, actionable** assessment, **opus (143.8s, $0.84)**
is the fastest and cheapest; sonnet-e-low and opus-e-low are correct but slower/costlier.

Recommendation: do NOT adopt a haiku lever for assess. Either keep the sonnet-default baseline, or
tighten the assess discriminator to grade root-cause / fixDirective fidelity (not just the
regression-vs-supersession class) and re-run , then a faster lever can only win if its diagnosis
actually holds.
