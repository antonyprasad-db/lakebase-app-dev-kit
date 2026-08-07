# Plan: shared comparison judges + a shared reference-asset area (regression AND optimization)

## Goal (user directive)
Two moves, so BOTH the regression path (the A-full executor-dispatch proofs) and the optimization
path (the champion-walk sweep) use ONE comparison mechanism against ONE reference set:

1. **Move the comparison judges** (semantic / discriminator / functional / RED-coverage) out of the
   optimization-only home into a COMMON area both paths import.
2. **Promote the comparables** (the recorded reference artifacts + code trees) into a COMMON, PINNED
   reference-asset area, sourced from the MOST RECENT re-record (`stockflow-rerecord`).

Today neither is shared: the judges live in `consort/optimize/`, and references are resolved LIVE
off `examples/replay/corpora/{stockflow,stockflow-rerecord}` (a moving target). A-full's regression
proofs never invoked a judge (they used conformance validators + honest-GREEN only), so
executor-produced outputs were never compared , semantically, discriminatively, or functionally ,
to the corpus. This plan builds the shared substrate that closes that.

## Current state (surveyed)
- **Judges** = `consort/optimize/optimize-semantic-gate.ts` (~880 LOC, 30+ exports). The full set:
  - DESIGN semantic: `makeOpusJudge`, `buildJudgePrompt`, `evaluateSemanticGate`, `parseJudgeReply`,
    `SEMANTIC_THRESHOLD=0.85`.
  - BUILD code: `makeBuildDiscriminatorJudge`, `buildFunctionalJudgePrompt`, `buildDiscriminatorPrompt`,
    `evaluateBuildFunctionalGate`, `FUNCTIONAL_THRESHOLD=0.75`, `parseDiscriminatorReply`.
  - RED tests: `buildRedCoverageJudgePrompt`.
  - ASSESS alignment: `evaluateNavigatorAssessAlignment`, `makeSupersessionDeltaJudge`,
    `parseNavigatorAssessMarker`.
  - Reference/candidate resolution: `resolveStepReference`, `readCandidateArtifact`,
    `resolveBuildReference`, `readCandidateBuildOutput`, `readTree`, `StepReference`.
  - Imports: node builtins + `TurnKey` (settings) + `consort-paths` , orchestrator-layer only, so a
    clean relocation (no scripts/bin edge).
- **Consumers today** (all import `consort/optimize/optimize-semantic-gate`):
  optimize: `build-role-chains.ts`, `optimize-live.ts`, `bin/consort/optimize.cli.ts`;
  tests: `tests/optimization/role-sweep.ts`, `tests/optimization/optimize-role.cli.ts`,
  `tests/bdd/{optimize-semantic-gate,optimize-build-functional-gate,role-sweep,recorded-build-baseline-guard}.test.ts`,
  `tests/integration/live/build-support.ts`.
- **Reference resolution** reads from TWO corpora, LIVE: `corpusForStep` maps dba->`stockflow-rerecord`,
  every other design step->`stockflow` (canonical), build code->`stockflow` recorded-build. Rooted at
  `examples/replay/corpora/<corpus>/recorded-artifacts|recorded-build`.
- **Precedent for pinning** = `consort/optimize/evaluation/fixtures/` , a SELF-CONTAINED snapshot of
  the exact recorded artifacts an experiment is judged against, with a README stating the
  "preserve-experiment-artifacts" discipline (the corpus is a MOVING target; pin the bytes). But it
  is optimize-scoped + only covers F6/S3+S1 build turns.
- **What the rerecord corpus actually holds (the candidate references, verified):**
  - DESIGN , COMPLETE for F1-stock-visibility: `feature-spec.json`, `architecture.json`,
    `db-design.json`, `test-list.json`, `design/design-guide.json`, `planning/{feature-proposals.md,
    estimates.json}`, `architecture/{canon,conventions}.json`, and per-story ACs across
    S1-file-stock / S2-stock-by-location-table / S3-sku-detail-view. (F6-split-tracking-code also
    present , the contract/drop feature , useful for assess/superseded references.)
  - CODE , 41 recorded turn `code/` trees under `recorded-build/features/{F1,F6}/stories/*/turns/*`,
    including navigator (RED), driver (GREEN), driver-repair, navigator-review, driver-refactor ,
    the per-turn code the discriminator/functional judge compares against.

## Move 1 , the shared comparison home: `consort/evaluation/`
Promote the judge library to a first-class `consort/` family (peer of the foliation families:
config, gates, pipeline, smells, ...). Name = `evaluation` (singular concept: the act of
evaluating an output against a reference; also matches the existing `optimize/evaluation` intent).
It is a LOW module , imports only node + `TurnKey` + `consort-paths` + the shared reference-asset
resolver (Move 2) , so both `consort/optimize/` (above it) and `tests/` (regression + optimization)
import DOWN into it. No new cycle.

- `consort/evaluation/judges.ts` , the injected LLM-as-judge builders + prompt builders + parsers +
  thresholds (the `make*Judge` / `build*Prompt` / `parse*Reply` / `SEMANTIC_THRESHOLD` /
  `FUNCTIONAL_THRESHOLD` set). PURE of corpus paths (takes reference + candidate TEXT).
- `consort/evaluation/gates.ts` , the orchestration over a judge + fs reads: `evaluateSemanticGate`,
  `evaluateBuildFunctionalGate`, `evaluateNavigatorAssessAlignment`, `SemanticGateOutcome`. These
  call the reference RESOLVER (Move 2), not hardcoded corpus paths.
- `consort/evaluation/reference.ts` , `resolveStepReference` / `resolveBuildReference` /
  `readCandidateArtifact` / `readCandidateBuildOutput` / `readTree` / `StepReference`, RE-POINTED at
  the shared reference-asset area (Move 2) instead of `examples/replay/corpora/`.
- `consort/optimize/optimize-semantic-gate.ts` becomes a thin RE-EXPORT of the moved symbols (so
  every current optimize + test importer keeps working with zero churn), OR the importers repoint in
  the same commit (repoint.mjs, the foliation mechanic). Prefer repoint + delete the shim after, per
  one-source-of-truth , but a transitional re-export keeps the move byte-safe first.

Discipline (matches the foliation stages): git mv + repoint in one commit; tsc + full hermetic
suite green; the two optimize goldens (`optimize-semantic-gate.test`,
`optimize-build-functional-gate.test`) prove the judges behave identically post-move; dist rebuilt +
committed; a foliation-guard entry so `consort/evaluation` owns its domain tokens and imports only
DOWN. Source-only local commits; nothing pushed.

## COMPARISON WITH THE EXISTING `consort/optimize/evaluation/fixtures/` PIN (do NOT duplicate)
`fixtures/` (2.0M) ALREADY pins references with this exact discipline , but scoped to the BUILD/
self-heal sweep on F6 only. Concretely it holds: F6 design refs (architecture, db-design, test-list,
2 ACs, conventions , NO feature-spec/propose/estimate/design-guide/ux), + 3 F6 build turn `code/`
trees (S1 003-driver, S1 004-navigator-assess, S3 001-navigator-reflect) as FULL trees (72 files
each, ~21 non-source: .vscode/.vite/.env.example/alembic.ini/lockfiles), + their tdd/ markers
(green-failure, superseded-tests, regression-assessment, review, cycle) + experiments/. The build
judge reads it via `BUILD_CORPUS_REL`; the DESIGN judge (`resolveStepReference`) reads live from
`examples/replay/corpora/{stockflow,rerecord}`. So references are ALREADY split across two homes +
two mechanisms , the fragmentation this work must end.

Implications for Move 2 (corrections to the naive "build a new pin"):
- **fixtures = the F6 build/self-heal half; it has NO design-role reference.** The design comparison
  (spec-author/architect/dba/test-strategist/ux/propose/estimate) has NO existing pin , the F1
  design slice below is NET-NEW + necessary, complementary to fixtures (not duplicative).
- **ABSORB, don't parallel:** the shared area SUBSUMES `fixtures/` (one reference home). Move its F6
  build trees + markers under `reference-assets/stockflow/`, repoint `BUILD_CORPUS_REL` there, delete
  the old dir. Not a second copy.
- **TRIM applies to JUDGE-ONLY references, NOT seeds (CORRECTION , learned the hard way):** a
  recorded `code/` tree can serve TWO consumers , (a) the JUDGE's reference read (readTree,
  source-only .py/.ts/.tsx), AND (b) a build-chain SEED that OVERLAYS the tree into a workspace and
  runs a LIVE agent against it (build-role-chains `intakeDir: BUILD_CORPUS_REL` + extraSnapshotRoots).
  The SEED needs the FULL tree (package.json, alembic.ini, configs, lockfiles) to execute. So the
  absorbed fixtures stay BYTE-FAITHFUL (they are seeds, not just references); source-only trimming is
  ONLY for NEW code references added purely as a judge comparable that nothing seeds+runs. Do NOT
  trim the fixtures build trees , it breaks the navigator/driver build chains.
- **Per-role sample is thus half-decided already:** BUILD + supersession/assess roles -> reuse
  fixtures' F6 (trimmed); DESIGN roles + the clean CRUD build path -> F1 (net-new slice below).

## Move 2 SCOPE , investigated: the MINIMAL per-role reference set (not the whole corpus, not one feature)
Directory: `consort/evaluation/reference-assets/stockflow/` (call it just `stockflow`, per the user).
The pin holds ONLY what a judge reads as its reference , candidate-vs-reference , picked per role
from F1 OR F6 by which sample actually exercises that role's judge (a single sample each). NOT the
corpus bulk: EXCLUDE `turns/` (3.2M replay snapshots), `run-config.json`/`scenario.json`/`TIMING.md`,
every INTERMEDIATE turn code tree, and lockfiles/.venv (readTree filters to .py/.ts/.tsx anyway).

Investigated pin map (verified against stockflow-rerecord):
- DESIGN artifacts (feature-spec, architecture, db-design, test-list, design-guide, proposals,
  estimates, conventions) + per-story ACs , **F1** (complete, clean sample). recorded-artifacts is
  676K total; pin F1's slice.
- navigator RED / driver GREEN code , **F1/S1** final turn `code/{tests,app}` (source only).
- driver refactor / navigator review code , **F1/S3** (ends 008-driver-refactor).
- assess + repair markers (green-failure.json + regression-assessment.json) , **F1/S1**
  (004-navigator-assess -> 005-driver-repair) , the genuine regression->repair cycle.
- assess + superseded + green-superseded markers (superseded-tests.json) , **F6/S3-stock-shows-
  split-fields** , ONLY the contract-drop feature produces real supersession (F1's are trivial).
- refactor-superseded / green-superseded code , **F6/S1 + S3** final turns.
Code = FINAL-turn source only (.py/.ts/.tsx), per resolveBuildReference (it reads only the last
turn's code/{app,tests}); a coverage guard asserts every A-full role resolves a reference in the pin.

## Move 2 , the shared reference-asset area: `consort/evaluation/reference-assets/stockflow/`
A PINNED, COMMON reference set (the "comparables") both paths read, sourced from the MOST RECENT
re-record. Follows the `evaluation/fixtures` preserve-artifacts discipline but promoted to the
common home + widened to the full A-full role set.

- Location: `consort/evaluation/reference-assets/stockflow-rerecord/` , the canonical pin. Layout
  MIRRORS a corpus (`recorded-artifacts/` + `recorded-build/`) so the existing sftdd-paths builders
  resolve reference paths the SAME way they resolve live `.consort` paths (no bespoke path logic).
- Sourced by COPYING (not symlinking) the exact bytes from
  `examples/replay/corpora/stockflow-rerecord/{recorded-artifacts,recorded-build}` for
  F1-stock-visibility (the complete design set + its story code trees), plus F6 where an
  assess/superseded reference needs the contract-drop feature. A `PROVENANCE.md` records the source
  corpus + the commit/tag it was copied at (durably reproducible; the corpus can move without
  breaking the pin).
- The `reference.ts` resolver's corpus root becomes `consort/evaluation/reference-assets/<pin>/`
  (default), with the live `examples/replay/corpora/` corpus as an OPTIONAL override (env) for
  someone re-recording. So regression reads the PIN by default; the sweep can point at a fresh
  corpus when re-recording.
- Retire/redirect `consort/optimize/evaluation/fixtures/` , either move its F6 build fixtures under
  the new common area (one reference home) or re-point `BUILD_CORPUS_REL` at it. One reference home,
  no second copy.
- `corpusForStep` collapses: with ONE pinned reference set that has the full F1 design artifacts,
  every design step resolves from the SAME pin (today dba->rerecord vs others->canonical is only
  because canonical lacked db-design.json; the rerecord pin has all of them). Simpler + one truth.

## What this UNLOCKS (the regression comparison A-full lacked)
With the shared judges + shared references in place, the A-full executor-dispatch outputs can be
compared to the corpus , the gap identified after #650:
- DESIGN roles: executor-produced artifact vs the pinned reference via `evaluateSemanticGate`
  (>=0.85). Covers spec-author (feature-spec + ACs), architect, dba, test-strategist, ux-designer,
  propose, estimate , all have an F1 reference in the pin.
- CODE (driver GREEN/refactor/repair): executor-produced code tree vs the pinned recorded turn code
  via `makeBuildDiscriminatorJudge` + `evaluateBuildFunctionalGate` (>=0.75 + classification).
- RED (navigator): executor-produced tests vs test-list+ACs via `buildRedCoverageJudge`.
- ASSESS: navigator marker vs the recorded superseded set via `evaluateNavigatorAssessAlignment`.
This becomes a SHARED regression suite (`tests/integration/live/equivalence-*` or a new
`tests/regression/`) that both paths' outputs run through , the same judges, the same references.

## Staged plan
- **Stage 1 (home, hermetic):** create `consort/evaluation/{judges,gates,reference}.ts`; git mv the
  symbols out of `optimize-semantic-gate.ts`; repoint importers (or transitional re-export); tsc +
  full suite; the 2 optimize judge goldens prove behavior-identical; dist; foliation-guard entry.
- **Stage 2 (reference-asset pin, hermetic):** create `consort/evaluation/reference-assets/
  stockflow-rerecord/` by copying the rerecord `recorded-artifacts` (F1 complete + F6) +
  the needed `recorded-build` code trees; add `PROVENANCE.md`; repoint `reference.ts` at the pin
  (live corpus as env override); fold in / redirect `optimize/evaluation/fixtures`; a guard test
  asserts every A-full role has a resolvable reference in the pin (or an explicit documented skip).
- **Stage 3 (the shared regression comparison suite, GATED LIVE):** a suite that drives each agent
  turn through the executor (as #650 did) and runs the MATCHING judge against the pin. Design +
  RED + assess are lean (model-API); CODE is cloud-gated. This is the "compare executor outputs to
  the corpus" proof the A-full effort still owes , now on shared substrate.

## Hard constraints
- One source of truth: ONE judges home, ONE reference-asset home; no second copy of either.
- Reference assets are COPIED bytes + PROVENANCE (preserve-artifacts discipline), sourced from the
  MOST RECENT re-record (`stockflow-rerecord`), not resolved live off the moving corpus.
- Byte-safe move: the optimize judge goldens must stay green across Move 1 (behavior unchanged).
- LOCAL commits only; kit ships committed dist; never push without explicit ok.
- Stage 3's live run is the SAME tier discipline as #650 (never interrupt pre-teardown for cloud).

## Key files
- FROM: `consort/optimize/optimize-semantic-gate.ts` (the judges) + `consort/optimize/evaluation/
  fixtures/` (the F6 pin) + `corpusForStep`/`resolveStepReference`/`resolveBuildReference` (live
  corpus roots).
- TO: `consort/evaluation/{judges,gates,reference}.ts` + `consort/evaluation/reference-assets/
  stockflow-rerecord/{recorded-artifacts,recorded-build}` + `PROVENANCE.md`.
- Consumers to repoint: `consort/optimize/{build-role-chains,optimize-live}.ts`,
  `bin/consort/optimize.cli.ts`, `tests/optimization/*`, `tests/bdd/optimize-*`,
  `tests/integration/live/build-support.ts`.
- Guards: foliation single-home guard (extend for `consort/evaluation`); a reference-coverage guard
  (every A-full role has a pin reference).
