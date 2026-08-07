# reference-assets , the canonical repository of test data

**This directory is THE single, canonical home for committed test data used by BOTH the integration
tests AND the optimization/evaluation experiments. Period.**

Every seed (the inputs a test or experiment replays into a workspace) and every reference (the
recorded output a produced result is judged against) lives here. There is exactly ONE home; do not
create a second copy elsewhere (no per-check "setup bundles", no parallel fixtures dir).

## Mine vs. camp

- The **mine** is `examples/replay/corpora/<scenario>/` , the full, MOVING recorded corpora. You run
  mining expeditions there (capture / re-record). It can change or be removed.
- This directory is the **camp** , the goods you extracted from the mine and committed. Tests and
  experiments read ONLY from here, NEVER from the mine at test/experiment time. If the mine is
  deleted, the camp still stands and every test + experiment still runs.

Extraction (mine → camp) is a deliberate, manual step; each subtree's provenance (which scenario +
turns it came from) is documented in the per-scenario README (e.g. `stockflow/README.md`).

**Every artifact in this camp MUST come from the mine, verbatim. Nothing manufactured, ever.** No
hand-written fixture, no hand-carved subset, no synthesized "expected" file. If a file here cannot be
pointed back to a specific corpus turn/artifact it was extracted from, it does not belong here. This
is the hard intake rule for the camp: extract real recorded goods, never fabricate.

## What a reference IS (and is NOT)

The reference for a swept/replayed turn is **what THAT turn actually recorded** , the per-turn
produced-output snapshot captured under the corpus at
`turns/<NNNN>-<role>[-mode]/files/.sftdd/<artifact>`, extracted here verbatim.

**Never manufacture a reference.** Do not hand-carve a "slice" (a subset of a full accreted
artifact) to approximate what an isolated turn "should" have produced. If the recorded turn did not
produce it, it is not the reference. Seed the isolated turn with the SAME inputs the recorded turn
consumed and judge against the SAME turn's recorded output , the scope then matches by construction.

## Who reads this

- Integration tests: the design/build/live chains + the executor-dispatch equivalence proofs.
- Experiments: the per-chain optimize sweep (`tests/optimization/`, via the sweep CLI).
- The comparison judges (`consort/evaluation/semantic-gate.ts`).

All resolve their seed + reference paths against this root (one constant , see the chain modules).

## Layout

Per-scenario subdirs (e.g. `stockflow/`). Each holds:
- `recorded-artifacts/` , the design artifacts (per feature/story) a turn is seeded with or judged against.
- `recorded-build/` , the per-turn code trees (navigator RED, driver GREEN, …) for the build lane.
- a per-scenario `README.md` with the extraction provenance.
