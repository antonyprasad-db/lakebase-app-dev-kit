# next-step , contained reference determinations for the driver-turn discriminator

The driver-turn optimize discriminator judges a driver candidate the way the real workflow does: it runs
the navigator EVALUATION turn that actually follows that driver turn (pinned opus-high) on the candidate's
output, then compares THAT navigator's determination to the RECORDED navigator determination at the same
step. This directory holds the recorded determinations, one subdir per swept driver turn.

CONTAINMENT: these are the judge references. Copied in once, pinned. The discriminator reads ONLY here ,
NEVER out to the moving evaluation corpus (`examples/replay/corpora/`). Assume that corpus is deleted; the
sweep must still run against these.

## Layout (per swept driver turn -> its recorded next-step evaluator determination)
- `driver-green/` , driver GREEN's next step is navigator ASSESS. `superseded-tests.json` (the recorded
  superseded-shift: 8 tests the AC retires) + `green-failure.json` (what the green tripped).
  classification = superseded-shift.
- `driver-repair/` , driver-repair's next step is navigator ASSESS. `regression-assessment.json` (a real
  regression WITH a fixDirective , classification=regression, "driver-repair-with-directive") +
  `green-failure.json`. This is the CLEAN determination.
- `driver-refactor/` , driver-refactor's trigger/evaluator is navigator REVIEW. `review-verdict.json`
  (`refactor:true` , the DROP-COLUMN refactor: the client still uses `inventory_code`; replace with the
  split `batch_number`/`serial_number`). The robust S3 refactoring sample.

## Directional verdict (what the judge decides)
Compare the candidate navigator's determination to the recorded one, directional on issues found:
- candidate ⊆ recorded issues, coverage-equivalent -> PASS
- candidate finds FEWER / NO issues where recorded found some -> PASS-WITH-HONORS (better; always flagged)
- candidate finds MORE / different issues than recorded -> FAIL

## Provenance (which recorded turn each came from)
Captured from the stockflow-rerecord corpus, F6-split-tracking-code / S3-stock-shows-split-fields:
- driver-green ref  <- turn 004-navigator-assess (S3/AC1)
- driver-repair ref <- turn 006-navigator-assess (S3/AC1) , the turn that followed 005-driver-green-superseded
  and produced a real regression+fixDirective. (Turn 008's markers were stub-polluted , NOT used.)
- driver-refactor ref <- turn 010-navigator-review (S3 story-level review-verdict, refactor:true , the
  refactor that 011-driver-refactor then executed).
Pinned here so the discriminator is stable + corpus-independent.
