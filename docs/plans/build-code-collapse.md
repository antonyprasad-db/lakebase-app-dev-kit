# Collapse the two build-code homes into one (#736)

Status: FEASIBILITY ANALYSIS COMPLETE (approved). Not yet implemented.

## Context
A build turn's CODE is recorded TWICE in different layouts. The general recorder was layered on top of a
pre-existing build recorder rather than replacing it, so the duplication is historical, not designed.

## The two homes
- **HOME A — `recorded-build/features/<F>/stories/<S>/turns/<NNN>-<label>/code/`**: story/AC-scoped FULL
  code tree per build turn. Written by the OLDER `recordBuildTurn` (`consort/pipeline/record-build.ts:71-98`,
  full `cpSync` with `codeTreeFilter`). READ by the build-replay lane `replayBuildTurn`
  (`consort/logging/replay-build.ts:148-190`) to jump to a story's turn and restore a deterministic tree.
  Per-story ordinal via `nextBuildTurnNumber` (resume-safe).
- **HOME B — `turns/<NNNN>-<label>/`**: flat sequential design+build timeline. Written by the newer
  `recordTurn` (`consort/logging/turn-recorder.ts`) — `turn.json` (delta + story/ac/mode), `files/`
  (output delta), `transcript.md`, `replay-set/pre-project/` (FULL pre-turn code snapshot). READ by
  optimization experiments + the per-turn audit.

Same bytes, two layouts, feeding two machineries built at different times.

## ⚠️ BLOCKED (2026-08-08): the feasibility assumption is FALSE on existing corpora
The analysis assumed `turns/` carries `replay-set/pre-project/` (a full pre-turn tree). VERIFIED FALSE:
`examples/replay/corpora/stockflow-rerecord/turns` has **zero** pre-project dirs (41 build turns, 0
pre-project). The `replay-set/pre-project/` instrumentation was added THIS SESSION (route-contract /
capture work); EVERY existing committed corpus (stockflow, stockflow-rerecord, stockflow-live,
bug-tracker, s3-selfheal) predates it — they have `recorded-build/code/` but NO `turns/…/pre-project/`.
So repointing `replayBuildTurn` off `recorded-build/` would break every corpus the replay lane reads
today, and the byte-identical proof would have nothing to reconstruct from.

What IS still true: `turn.json` carries `story` + `ordinal` (and `label` encodes role/mode), so the
story/AC keying + reflect-filtering is recoverable from `turns/`. Only the FULL-TREE source is missing.

### Unblock options (decision needed before any code)
- **(a) Re-record then repoint** — re-capture all corpora with the pre-project instrumentation, THEN do
  the repoint as designed. Large + gated live (Lakebase). Cleanest end state.
- **(b) Forward delta-accumulation** — reconstruct a turn's full tree by replaying `turns/<n>/files/`
  deltas (+ `turn.json.deleted[]`) FORWARD from turn 0, instead of a per-turn pre-project snapshot. No
  re-record needed, but must PROVE the delta chain reconstructs byte-identical to `recorded-build/code/`
  on an existing corpus (the same safety proof, different source).
- **(c) Narrow the dedup** — keep `recorded-build/` as the build-restore home; only collapse the DESIGN
  mirror duplication. Smallest, preserves the deterministic build restore untouched.

## (original feasibility verdict — assumed pre-project present; SUPERSEDED by the block above)
turns/ HAS everything recorded-build gives:
- `replay-set/pre-project/` is a FULL pre-turn code tree (same codeTreeFilter as recorded-build's `code/`).
- `files/` + `turn.json.deleted[]` is the OUTPUT delta.
- **pre-project + delta = byte-identical to recorded-build's per-turn `code/`.**
- Story/AC identity IS recoverable: every build turn's `turn.json` (+ turns/index.json entry) carries
  `story` + `ac` + `mode`.

## The ONE real gap (CRITICAL but small)
`replayBuildTurn` selects by a **1-based PER-STORY** turnIndex via `listBuildTurns` over the story-keyed
dir; turns/ is **global-ordinal**, not per-story. So a direct O(1) path lookup becomes an index filter:
scan `turns/index.json` → filter `kind==invoke-role && role∈{navigator,driver} && story==S &&
mode!=reflect` → sort by ordinal → pick `[turnIndex-1]`. (recorded-build baked reflect-skipping into
`listBuildTurns`; turns/ does it via the `mode`/label filter — same result.) O(n) index scan for
50–100 turns is negligible.

## Repoint changes (named)
- Add `buildStoryTurnIndex(recordDir, featureId, story): Map<turnIndex, {ordinal, dir}>` to
  `consort/logging/replay-build.ts`.
- Rewrite `replayBuildTurn` (`replay-build.ts:148-190`) to use that instead of `listBuildTurns` + the
  story-keyed path; restore from `turns/<dir>/replay-set/pre-project/` + `files/` (reconstruct the
  post-turn tree) rather than `recorded-build/.../code/`.
- Update `recordedBuildVerdict` (`replay-build.ts:228-239`) to read the replayed verdicts
  (review-verdict / regression-assessment / superseded-tests) from the turns/ manifest path.
- Callers `consort/orchestrator/drive/claude-runner.ts:396-402` + `mock-replay-agent.ts:279-283` UNCHANGED
  (same `story` + `turnIndex` API).
- Deprecation (two commits): (1) repoint the READER at turns/ and prove byte-identical restore on a
  corpus; (2) THEN stop writing recorded-build (`drive.cli.ts:233-244` / `replay-recorder-wrapper.ts`) and
  delete `record-build.ts`'s writer. Do NOT delete the writer before the reader is proven.
- **Retire the subdirectory itself once a REPLAY confirms it is no longer needed:** after
  `replayBuildTurn` reconstructs faithfully from `turns/` alone (proven by an actual replay, not just
  the hermetic byte-diff), the separate `recorded-build/` build-turn subdirectory can be REMOVED , both
  the writer AND the existing per-corpus `recorded-build/` trees. The replay passing is the proof gate
  for deleting the dir.
- Tests: `consort-replay-build.test.ts` rewritten to build a turns/ structure;
  `consort-record-build.test.ts` retired with the writer.

## Verification (the safety proof)
Hermetic: restore a known corpus turn from turns/ and assert a byte-identical tree to what recorded-build
produced — diff the two restores BEFORE deleting the writer.

## Critical files
`consort/logging/replay-build.ts`, `consort/pipeline/record-build.ts`, `consort/logging/turn-recorder.ts`
(index shape), `consort/orchestrator/drive/claude-runner.ts`.
