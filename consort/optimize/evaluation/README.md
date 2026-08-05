# Optimization evaluation fixtures

`fixtures/` is a SELF-CONTAINED snapshot of exactly the recorded artifacts the per-role BUILD
experiments (navigator RED + navigator ASSESS live chains) need, copied out of the live scenario
corpus (`examples/sftdd-scenarios/stockflow-rerecord`).

## Why this exists , don't assume the corpus is present

The scenario corpus is a great *reference* while developing, but it is a MOVING target (re-recorded,
scrubbed, renumbered) and may not be available at all when someone later re-runs an experiment or
reviews the evidence. An experiment that reads its seeds + references directly from the corpus is
not durably reproducible. So the experiments read from THIS pinned fixture set instead
(`BUILD_CORPUS_REL` points here), and the corpus is not a runtime dependency of the experiments.

This is the preserve-experiment-artifacts discipline applied to INPUTS + REFERENCES, not just
outputs: the exact bytes an experiment was conditioned + judged against are pinned alongside it.

## What's in here (and which experiment uses each)

- `recorded-artifacts/` , the design artifacts the chains seed into the workspace `.sftdd`:
  - `features/F6-split-tracking-code/{architecture,db-design,test-list}.json`
  - `features/F6-split-tracking-code/stories/S3-stock-shows-split-fields/acs/AC1-split-fields-shown.json` (RED)
  - `features/F6-split-tracking-code/stories/S1-split-columns-migration/acs/AC1-batch-serial-columns-added.json` (ASSESS)
  - `architecture/conventions.json` , the module LAYOUT `buildContextPack` projects into the pack.
- `recorded-build/features/F6-split-tracking-code/stories/...`:
  - `S3-.../turns/001-navigator-reflect/code` , the pre-RED code tree the RED chain overlays.
  - `S1-.../turns/003-driver/code` + its `tdd/.../green-failure.json` , the post-GREEN tree +
    the DETERMINISTIC pre-localized failed-GREEN marker the ASSESS chain seeds (assessed:false +
    supersededTestRefs; NOT the navigator's own diagnosis).
  - `S1-.../turns/004-navigator-assess-.../tdd/.../superseded-tests.json` , the RECORDED GROUND
    TRUTH the alignment gate judges the live navigator's flagged set against (via the delta judge).

## Refreshing the fixtures

If the experiment's story/AC/turn selection changes, re-copy the corresponding subtree from
`examples/sftdd-scenarios/stockflow-rerecord` into the same relative path here. Keep the copy
MINIMAL (only the turns/artifacts an experiment actually reads) so the fixture set stays small and
its provenance obvious. Excluded from tsc + vitest collection (tsconfig `exclude`; vitest include is
`tests/**`), so the fixture code trees are treated as DATA, never compiled or run as kit tests.
