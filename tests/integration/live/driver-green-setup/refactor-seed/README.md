# refactor-seed , the contained PRE-TURN snapshot for the driver-REFACTOR sweep

The driver-refactor sweep exercises the Driver's REFACTOR turn: given a navigator REVIEW that asked for a
cleanup (`refactor: true`), the Driver refactors the code. To position the live drive on that turn, we seed
the state the corpus recorded RIGHT BEFORE it , then the drive's own probes route to `driver refactor`.

## Layout
- `code-assets/` , the recorded application tree at that point (app/ + alembic/ + client/ + tests/), the
  story already honest-GREEN.
- `cycles/` , the recorded `tdd/cycles/<feature>/...` tree, INCLUDING the S3 story-level
  `review-verdict.json` with `refactor: true` (the DROP-COLUMN cleanup directive: the client still uses the
  old `inventory_code`; replace with the split `batch_number`/`serial_number`). Overlaid into
  `<consortDir>/cycles/` so the drive's `refactorStoryPending` probe reads the SAME on-disk state the corpus
  recorded and routes to the Driver REFACTOR turn.

## Provenance
Captured from the stockflow-rerecord corpus, F6-split-tracking-code / S3-stock-shows-split-fields,
turn **010-navigator-review** (the review whose `refactor: true` verdict drove 011-driver-refactor , the
robust drop-column refactoring). Pinned here so the sweep is stable + corpus-independent (assume the
corpus is deleted).

## Refactor's discriminator (RESOLUTION semantics)
There is NO recorded navigator turn AFTER the refactor. So the refactor candidate is judged by running a
navigator REVIEW on its POST-refactor output: a good refactor RESOLVES the flagged issue, so its review
should come back `refactor: false` (PASS). Still `refactor: true` (unresolved) or a new/different issue is
a FAIL. See consort/evaluation/reference-assets/stockflow/next-step/driver-refactor/.

## Note
SCAFFOLD FIXTURE, not part of the repo's test suite (client tests excluded from tsc + vitest). LIVE run;
the seed's correctness is confirmed at the gated live run.
