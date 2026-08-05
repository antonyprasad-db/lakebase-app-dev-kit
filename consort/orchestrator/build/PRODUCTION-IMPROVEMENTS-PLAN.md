# Production improvements plan (build-turn optimization findings) + test-strategist supervisor split

Status: LIVING PLAN. #1 is DONE + committed; #2-#4 + the test-strategist split are DESIGNED, not
built. This file is the durable record (in git, survives session compaction). Branch
`fix/headless-permission-mode-acceptedits`, LOCAL commits only, kit ships committed dist (rebuild +
`git checkout -- dist` between releases; source-only local commits). TDD every slice; keep the real
drive BYTE-IDENTICAL where behavior isn't changing (the roleTaskBody/cycle-record prompt suites are
the characterization gate).

## Context , how we got here

Built lean, no-cloud per-role LIVE isolation chains for the BUILD lane (navigator RED + ASSESS),
mirroring the design-role chains, to instrument + lever-sweep the build turns (84% of run time).
Along the way, a chain of findings about what the orchestrator pre-conditions a turn with:

- The context pack (RUBRIC + LAYOUT + test-locations) was CONVENTION (a hardcoded `buildContextPack`
  call in `roleTaskBody`'s build branch), not a declared contract , so the lean chains omitted it.
  Fixed by extracting `buildContextPack` to `consort/orchestrator/build/build-context.ts` (one source
  of truth; drive byte-identical) and injecting it into the chains.
- The ASSESS turn was slow (corpus: 8-13 min; lean: 20-min timeout) because the honest-GREEN verify
  CAPTURED the failure pinpoint then DISCARDED it , the navigator re-scanned the tree to rediscover
  it. See #1 (DONE).
- The alignment gate wrongly made a cold oracle the arbiter of a better-grounded navigator; reworked
  to judge the DELTA between the navigator's set and the RECORDED GROUND TRUTH (committed, in the
  optimize/eval layer).

Live-proven: navigator RED (S3) green; navigator ASSESS (S1, the pure-supersession case) green in
35s / 2 turns. S3 assess stays RED-only (its failure is a non-pre-localizable client regression;
#1 is what makes that class fast).

Design docs already committed alongside this one:
`PRE-CONDITIONING-AS-CONTRACT.md`, `ASSESS-ALIGNMENT-GATE-RETHINK.md`, `RESET-EXPERIMENT-DB-DESIGN.md`,
`../optimize/evaluation/README.md`.

---

## #1 , thread the verify failure output into green-failure.json -> ASSESS prompt  [DONE, commit a85aa115]

The honest-GREEN verify already captures its own output (failing node-ids + top error, e.g.
"Cannot find module ../../src/pages/StockViewPage") but dropped it. Threaded end-to-end IN THE REAL
DRIVE:
- `deploy.ts` `ensureDeployedAndVerify` captures the FAILING pass's combined output + returns it as
  `CycleVerifyResult.failureOutput` (tail-bounded 4000 chars). Passed runs unchanged.
- `cycle-record.ts` `GreenVerifier` returns `failureOutput`; `defaultGreenVerifier` surfaces it;
  `greenOpenCycle` writes it into `green-failure.json`.
- `supersession.ts` `GreenFailure` gains `failureOutput` , the GENERAL pre-localization for failures
  the deterministic column-drop gates can't localize (missing client component, broken import); the
  symmetric counterpart to `supersededTestRefs`/`contractRefs`.
- `orchestrator-effects.ts` ASSESS prompt injects it FIRST ("start HERE, do NOT re-scan").
Tests: `sftdd-honest-green.test.ts` (marker carries it), `orchestrator-effects.test.ts` (prompt
injects it). Byte-identical on pass. 2817 green.
REMAINING for #1: the advisory ASSEMBLY still lives inline in `greenOpenCycle` (gathers contractRefs
+ supersededTestRefs + failureOutput). Its migration to an orchestrator/build preparer folds into #2.

---

## #2 , pre-conditioning as a declared StepContract face  [DONE, full suite 2831 green]

Full spec + what-shipped ADDENDUM: `PRE-CONDITIONING-AS-CONTRACT.md`. All four slices below landed:
`preconditions()` on the contract + manifest + schema; the preparer registry
(`orchestrator/build/preconditions.ts`, `buildGreenFailureAdvisory` migrated out of
`greenOpenCycle`/`roleTaskBody`); the executor's `PREPARE-PRECONDITIONS` phase (via a `prepare` dep,
so the executor stays generic); roleTaskBody's assess advisory sourced from the preparer
(byte-identical , the 85 golden-prompt tests pass unchanged); the lean build chains declare
`context-pack` (RED) / `green-failure-advisory` (assess) and drop their per-chain pack injection.
The "always something, never silently empty" warning fires via `deps.onWarn`. Original plan below.

Slices (TDD, drive byte-identical):
1. `contract/step-contract.ts`: add `preconditions(action): StepPrecondition[]` (4th face) +
   `StepPrecondition {id, kind, description}`; add the manifest-schema field; default `[]`.
2. `execution/step-executor.ts`: add a `PREPARE-PRECONDITIONS` phase (2.5, between provision-workspace
   and build-instructions) + a PREPARER REGISTRY. Preparers are pure projections of on-disk `.sftdd`:
   - `context-pack` -> `buildContextPack` (already extracted to `orchestrator/build/build-context.ts`).
   - `green-failure-advisory` -> NEW: the advisory-assembly MIGRATED out of `greenOpenCycle`'s inline
     block into `orchestrator/build/` (contractRefs + supersededTestRefs + failureOutput). THIS is the
     "migrate to the orchestrator directory" instruction , the assembly is orchestrator logic, not
     cycle-record's.
3. Migrate `roleTaskBody`'s hardcoded `buildContextPack` call + the ASSESS branch's green-failure
   advisory injection onto the declared preconditions (roleTaskBody reads the prepared blocks instead
   of assembling them). Prove byte-identical via the prompt suites.
4. "Always something, never silently empty": a declared-but-empty preparer LOGS a warning to the
   agent-log ("declared context-pack prepared empty , conventions.json absent?"), never the happy
   path. A step needing nothing declares `preconditions() = []` affirmatively.
5. The lean build chains (`optimize/build-role-chains.ts`) DECLARE the same preconditions , so an
   isolated turn is pre-conditioned by the SAME phase as the dispatched turn, dropping the chains'
   per-`instructionsFor` `buildContextPack` call.
Risk: touches the executor Template Method + every build manifest; the roleTaskBody golden suites
must stay green (they assert exact prompt bytes).

---

## #3 , alignment-rethink in the real drive  [DONE, source-checked: correctly optimize-only, NO drive change]

The delta-vs-ground-truth alignment gate lives ONLY in the optimize/eval + live-test layer
(`optimize-semantic-gate.ts` `evaluateNavigatorAssessAlignment` + `makeSupersessionDeltaJudge`).
Source-check DONE (grep of `scripts/` + `consort/` for the gate symbols; trace of the assess->route
path in `orchestrator-drive.ts` `nextBuildAction`):

The REAL drive TRUSTS the navigator's assess verdict , it routes DIRECTLY off the marker with NO
verdict-alignment check:
- `assessGreenAc` -> a Navigator `assess` turn writes `superseded-tests.json` and/or
  `regression-assessment.json`.
- The marker's shape alone then routes the next move (all in `nextBuildAction`, orchestrator-drive.ts
  ~447-474): `repairRegressionAc` (a `fixDirective` present) -> a bounded Driver `repair`;
  `greenSupersededAc` (superseded flagged, no regression) -> a Driver `green-superseded` re-green;
  `refactorVerifyRefactorPending` -> `refactor-superseded`. No code re-judges whether the navigator
  flagged the RIGHT tests or diagnosed correctly.
- The FUNCTIONAL BACKSTOP is the honest-GREEN re-verify, not a verdict gate: a wrong supersede-flag or
  wrong fix-directive still fails the re-verify (`greenOpenCycle`), which RE-ARMS a fresh assess for a
  bounded number of self-heal rounds and then ESCALATES to the HIL (see #1 +
  `sftdd-honest-green.test.ts`). The teeth are behavioral (does the suite pass), not judgmental (did
  the navigator agree with an oracle).

So the alignment gate is CORRECTLY optimize-only: it is an EVALUATION INSTRUMENT (does the navigator
JUDGE correctly, scored against the RECORDED GROUND TRUTH set) , and recorded ground truth only exists
in the corpus, never at runtime. Wiring it into the drive would be (a) impossible in general (no
ground-truth reference at drive time) and (b) redundant (the honest-GREEN re-verify already gates the
functional outcome the verdict is a means to). NO drive change , documented, closed. The alignment
model's coverage-equivalence framing is realized in the optimize layer (the delta judge); the runtime
equivalent is the honest re-verify, which is already in place.

---

## #4 , session-warmth lever for build turns  [DONE, gated on the multi-turn substrate]

Two halves:
1. **Real drive already warms per-story , CONFIRMED + test-covered.** `buildClaudeCommand`
   (orchestrator-effects.ts) sets `resumeKey = role:story` for the build roles (navigator/driver)
   when `buildSessionScope === "story"` (the DEFAULT), warming context + prompt cache across a
   story's RED/GREEN/REVIEW cycles and starting FRESH at each new story; `cycle` is the cold
   safety valve for a story that overflows the window. Pinned by orchestrator-effects.test.ts
   ("resumes Navigator/Driver PER STORY", "buildSessionScope=cycle cold-spawns", "non-build roles
   resume across the whole feature").
2. **Warmth as a MEASURED sweep lever , DECLARED + gated.** Added a `session` axis to
   `RoleLeverPatch` + a `session-warm` candidate to `roleCandidates(baseModel, {multiTurn})`. But
   warm-vs-cold is a CROSS-TURN effect (a later cycle resuming the earlier turn's session): the
   default per-role chain substrate runs ONE isolated turn on a `fresh` session, so there is no
   prior turn to resume , it cannot measure warmth by construction. So the candidate is gated
   behind a `multiTurn` capability (default FALSE = excluded on the single-turn chain; ready for
   the multi-turn DRIVER phase, gated cloud, unbuilt). role-sweep threads the `session` patch onto
   the ClaudeStepAgent. role-levers.test.ts pins the gate (excluded by default; included +
   `session:"resume"` when multiTurn; otherwise a strict superset). Honest bound: I did NOT bolt a
   lever the substrate can't fire , it's declared + ready, not fake-measured. Per the data, #1
   (the failureOutput pre-localization) dwarfs this; it's the completeness item.

---

## test-strategist -> SUPERVISOR + test-ANALYST subagents

Full analysis: memory `project_test_strategist_supervisor_split`. Decompose the single (slowest,
output-bound) test-strategist turn into a SUPERVISOR (owns ordering + cross-slice coverage) + N
test-ANALYSTS (each authors one slice of `test-list.json`).

### Why decomposable (from the real artifact)
`test-list.json` = `{feature_id, ordered_for, items[]}`, each item flat + independent (id T<n>,
description, ac_id, kind, scenario_file?, invariant_id?). No cross-item refs -> slices concatenate
losslessly; merge = array concat + one re-order pass. Recorded F1: 32 items, kinds
{behavior:9, fitness:14, client:9}, 5 persistence invariants , that heterogeneity + volume (~40k
output tokens, 626-856s on sonnet) is why the single turn is the design lane's slowest.

### The gates any split MUST still satisfy (all on the feature-level master, from gate-conformance-guard)
- `checkFitnessCoverage`: >=1 kind:"fitness" item for a service-backed feature.
- `checkPersistenceCoverage`: EVERY architecture.json persistence_invariant referenced by >=1 item's
  invariant_id.
- `distinct-invariant-coverage` (cross-story): no invariant covered by >1 slice (no duplication).
- schema conformance + every ac_id maps to a real AC.
These bind on the WHOLE master -> a split NEEDS a supervisor/merge that re-checks them; analysts alone
cannot guarantee cross-slice properties.

### Two viable shapes
- **(A) LIGHT , reframe, don't rebuild.** The strategist is ALREADY invoked per-story (action
  {role:test-strategist, story}), appends its story's items to the master, and TEST_LIST_BIN
  regenerates per-story/per-AC views. So the per-story turns ARE the analysts; the "supervisor" is the
  orchestrator's per-story loop + the existing feature-complete coverage gate. Near-zero new machinery.
- **(B) DEEP , per-KIND analysts within a story (what actually cuts the output-bound cost).** Split a
  story's items by `kind`: behavior analyst (AC scenarios via the API), fitness analyst (persistence
  invariants + architectural constraints, the DB-real tests , owns invariant_id coverage), client
  analyst (SPA component/e2e). Three parallel SMALLER homogeneous slices + a supervisor merge/order/
  gate turn. Each analyst has DISTINCT inputs (genuine specialization, not just fan-out):
  - behavior: story acs/*.json + the API boundary from architecture.json layers.
  - fitness: architecture.json persistence_invariants + db-design.json (concrete tables/constraints).
  - client: story UI ACs + design-guide.json + ia.md (only when uiTrack + client-kind ACs).
  - supervisor: all slices + architecture.json (coverage checks) + ordering rationale (ordered_for).

### Open questions to resolve before building
- Ordering (`ordered_for`) is a WHOLE-LIST property -> supervisor's, applied post-merge; analysts emit
  UNORDERED slices.
- invariant coverage merge conflict: distinct-invariant-coverage HARD-BLOCKS if two slices cover one
  invariant. Supervisor ASSIGNS each invariant to exactly one analyst up front (fitness analyst owns
  them per story) , a dispatch decision, not a merge fix-up.
- T<n> id space is feature-flat (^T[0-9]+); parallel analysts must not collide , supervisor assigns id
  ranges OR analysts use kind/story-prefixed ids the supervisor renumbers on merge.
- **Is the split worth it vs. the model lever? UNRESOLVED , the m-haiku number is NOT a decision
  gate.** The #554 sweep showed m-haiku cut the SINGLE test-strategist turn 626s->190s (70%), but
  it ran CONFORMANCE-ONLY , no discriminator/quality gate touched what m-haiku produced (verified:
  every `.role-telemetry/sweep-test-strategist/*.telemetry.json` has `semanticScore: null`; the
  quality gate landed in #555, AFTER #554). Worse, the produced test-lists were NOT preserved
  (artifact capture also arrived in #555), so they cannot be retro-judged , the trial is not
  reproducible (preserve-experiment-artifacts). And the output-token trend is a coverage-loss RED
  FLAG, not a clean win: baseline(sonnet)=37,145 out-tok -> m-haiku=22,762 (-39%) -> m-haiku-e-low=
  14,408 (-61%); for an OUTPUT-BOUND artifact like test-list.json, "much faster" is likely partly
  "wrote fewer/thinner test items", exactly what a discriminator exists to catch. So "cheap model
  is fast enough -> split premature" is UNPROVEN. The real gate is TASK #556: RE-RUN the sweep with
  the #555 quality gate ON (discriminator vs the recorded test-list baseline: coverage + fitness +
  persistence-invariant faithfulness) + artifact capture ON, then rank by wall-clock ONLY AMONG
  candidates that HOLD quality. If a cheap fast candidate holds coverage, the split is premature; if
  the fast ones are all thinner, the split (or a richer cheap model) earns its keep. Needs a LIVE
  spawn (the #554 artifacts are gone). DECIDE the split against #556's result, NOT #554's.

### How to prototype (when ready) , this IS pre-conditioning-as-contract applied
Build a `test-strategist-supervised-chain` on the per-role chain substrate: seed (replay
ACs+architecture+db-design) -> behavior/fitness/client analyst manifests (each a claude step scoped +
PRE-CONDITIONED to its slice's distinct inputs via #2's `preconditions()` face) -> supervisor manifest
(merge+order+coverage gate). Measure vs the recorded single-turn baseline with the SAME telemetry
(role-telemetry.ts: wall-clock + cost + conformance) to prove the split wins BEFORE touching the
shipped role. Note the synergy: the per-kind analysts are the clearest use case for #2's declared
preconditions (each analyst declares exactly its slice's inputs), so #2 should land first.

---

## Sequencing recommendation
1. #1 DONE.
2. #2 pre-conditioning-as-contract , DONE (commit 3da57ea8; subsumed the advisory-assembly
   migration to orchestrator/build; also the enabler for the test-strategist per-kind analysts).
3. #3 source-check , DONE (documented optimize-only, no drive change).
4. #4 session-warmth lever , DONE (real drive warms per-story + confirmed; warm candidate declared +
   gated on the multi-turn substrate).
5. test-strategist split , GATED on TASK #556 first (re-run the sweep with the #555 QUALITY gate +
   artifact capture ON; rank by wall-clock only among quality-holders). The #554 m-haiku number is
   NOT a valid decision gate (conformance-only, artifacts not preserved, output-token coverage red
   flag , see the "Is the split worth it" open question). Only after #556 gives a quality-holding
   speed result: DECIDE. If pursued, shape (B) on the chain substrate, measured before shipping.

## Guardrails (carry forward)
- LOCAL commits only; never push. Kit ships committed dist , rebuild + `git checkout -- dist` between
  releases; local commits are SOURCE-ONLY.
- TDD; drive byte-identical proven by the roleTaskBody/cycle-record prompt suites.
- New shared logic MIGRATES to the orchestrator family (`consort/orchestrator/...`), not left in
  scripts/sftdd , the buildContextPack extraction + the green-failure-advisory preparer are the model.
- Experiments read self-contained fixtures (`optimize/evaluation/fixtures/`), never the live corpus.
