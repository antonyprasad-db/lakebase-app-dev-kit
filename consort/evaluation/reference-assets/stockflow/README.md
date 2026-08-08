# Shared evaluation reference-assets: `stockflow`

A SELF-CONTAINED, PINNED snapshot of the recorded artifacts the comparison judges
(`consort/evaluation/semantic-gate.ts`) compare a produced output against , the "comparables". It is
the SHARED reference set for BOTH paths that judge outputs:
- the REGRESSION path (the executor-dispatch equivalence proofs , does the executor produce an
  output equivalent to the corpus?), and
- the OPTIMIZATION path (the champion-walk sweep , does a candidate lever hold quality vs the
  recorded winner?).

It also serves as the SEED corpus for the build-role chains (`BUILD_CORPUS_REL` points here): a
recorded `code/` tree is overlaid into a workspace and a live build role runs against it.

## Provenance
Copied out of the live scenario corpus `examples/replay/corpora/stockflow-rerecord` (the most
recent re-record). The scenario corpus is a MOVING target (re-recorded, scrubbed, renumbered) and
may be absent when someone later re-runs a comparison or reviews the evidence , so the exact bytes a
judge conditioned + scored against are PINNED here, and the corpus is not a runtime dependency. This
is the preserve-experiment-artifacts discipline applied to INPUTS + REFERENCES, not just outputs.

## Two kinds of asset , two trimming rules
- REFERENCE-ONLY (what a judge READS via readTree: source `.py/.ts/.tsx`) , may be trimmed to source.
- SEED trees (a `code/` tree the build chains OVERLAY into a workspace and RUN a live agent against)
  , kept BYTE-FAITHFUL (package.json, alembic.ini, configs, lockfiles), because the seed must
  execute. The F6 build trees below are seeds; do NOT trim them.

## What's in here
- `recorded-artifacts/` , design references (feature-spec / architecture / db-design / test-list /
  design-guide / proposals / estimates / ACs) + `architecture/conventions.json` (the module LAYOUT
  buildContextPack projects). F6 today; the F1 design slice is added as design-role comparison lands.
- `recorded-turns/<NNNN>-<role>/…` , RECORDED PER-TURN OUTPUTS, each extracted VERBATIM from
  `examples/replay/corpora/stockflow-rerecord/turns/<NNNN>-<role>/files/.sftdd/…` (byte-identical).
  The honest reference for an ISOLATED design turn whose accreted artifact is wider than the turn's
  scope (the #705 model , replaced the manufactured `*.S1-slice`/`*.FP-slice`/`acs-spec-author-slice`):
  - `0001-architect-reviewer-estimate/planning/estimates.json` , the estimate turn's FP-only sizing
    (before sync-backlog added the F1/F6 committed sizes) , the architect-estimator chain's reference.
  - `0006-spec-author/acs/{AC1,AC2,AC3}.json` , S1's ACs as spec-author wrote them (before the
    architect added per-AC `architectural_notes`) , the spec-author acs equivalence reference.
  - `0018-driver-repair/test-list.json` , the F1 test-list as recorded , the test-strategist chain +
    equivalence reference. (The F1 `architecture.json` is authored in ONE turn, 0007, so its accreted
    `recorded-artifacts/…/architecture.json` IS that turn's output , judged there directly, no extract.)
- `recorded-build/features/F6-split-tracking-code/stories/...` , the build seeds + judged refs:
  - `S3-.../turns/001-navigator-reflect/code` , the pre-RED tree the RED chain overlays (SEED).
  - `S1-.../turns/003-driver/code` + its `tdd/.../green-failure.json` , the post-GREEN tree + the
    pre-localized failed-GREEN marker the ASSESS chain seeds (SEED + marker).
  - `S1-.../turns/004-navigator-assess-.../tdd/.../superseded-tests.json` , the RECORDED GROUND
    TRUTH the alignment gate judges the live navigator's flagged set against (via the delta judge).

## Refreshing
If the comparison's feature/story/AC/turn selection changes, re-copy the corresponding subtree from
`examples/replay/corpora/stockflow-rerecord` into the same relative path here. Keep it MINIMAL (only
what a judge reads or a chain seeds) so the set stays small + its provenance obvious. The whole tree
is excluded from tsc (`tsconfig` exclude: `consort/evaluation/reference-assets`) + vitest collection
(include is `tests/**`), so the reference code trees are DATA , never compiled or run as kit tests.
