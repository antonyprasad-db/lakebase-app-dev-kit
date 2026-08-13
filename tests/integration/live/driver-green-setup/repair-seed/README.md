# repair-seed , the contained PRE-TURN snapshot for the driver-REPAIR sweep

The driver-repair sweep exercises the Driver's REPAIR turn: given a navigator ASSESS that diagnosed a
genuine regression (with a fix directive), the Driver repairs the code. To position the live drive on
that turn, we seed the state the corpus recorded RIGHT BEFORE it , then the drive's own probes route to
`driver repair` (no hand-set flags).

## Layout
- `code-assets/` , the recorded application tree at that point (app/ + alembic/ + client/ + tests/).
- `cycles/` , the recorded `tdd/cycles/<feature>/...` tree, INCLUDING the S3/AC1 routing markers:
  `green-failure.json` (`assessed: true` + a `fixDirective`) + `regression-assessment.json`. Overlaid into
  `<consortDir>/cycles/` so the drive's `repairRegressionAc` probe reads the SAME on-disk state the corpus
  recorded and routes to the Driver REPAIR turn.

## Provenance
Captured from the stockflow-rerecord corpus, F6-split-tracking-code / S3-stock-shows-split-fields,
turn **006-navigator-assess** (the assess that followed 005-driver-green-superseded and produced a real
regression + fixDirective; the drive's next step from here is 007-driver-repair). Pinned here so the
sweep is stable + corpus-independent (assume the corpus is deleted).

## Note
This is a SCAFFOLD FIXTURE, not part of the repo's test suite , its `code-assets/` client tests import
react/playwright and are excluded from tsc + vitest (see tsconfig.json / vitest.config.ts). The
driver-repair sweep is a LIVE run; the seed's correctness (that the drive routes to REPAIR) is confirmed
at the gated live run.
