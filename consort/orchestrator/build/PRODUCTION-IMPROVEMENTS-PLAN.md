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

## #2 , pre-conditioning as a declared StepContract face  [NEXT, LARGE]

Full spec: `PRE-CONDITIONING-AS-CONTRACT.md`. The context pack + green-failure advisory are prepared
imperatively in the executor's build-instructions phase; a step cannot DECLARE "I need the pack",
so every prompt-assembly site can omit it. Make it a contract face the executor honors.

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

## #3 , alignment-rethink in the real drive  [source-check FIRST]

The delta-vs-ground-truth alignment gate currently lives in the optimize/eval + live-test layer
(`optimize-semantic-gate.ts` `evaluateNavigatorAssessAlignment` + `makeSupersessionDeltaJudge`).
BEFORE wiring anything into the drive: source-check whether the REAL navigator-assess self-heal
routing has ANY alignment/verification of the navigator's verdict (grep `orchestrator-drive` /
`orchestrator-probe` / the assess routing). Two outcomes:
- If the real drive TRUSTS the assess verdict (no verification , likely), then the alignment gate is
  CORRECTLY optimize-only (it's an evaluation instrument, not a runtime gate). Document that; no drive
  change. This is the probable + honest answer.
- If the drive DOES verify assess, wire the same model (classification hard-gate + coverage-equivalence
  delta vs the recorded reference where one exists).

---

## #4 , session-warmth lever for build turns  [SMALL]

Confirm the real drive already warms heavy-role sessions per-story (`buildClaudeCommand`
`resumeKeyFrom: "story"` in orchestrator-effects). Then make warmth a MEASURED lever in the build
sweep (`optimize/role-levers.ts` + the build chain), so cold-vs-warm is quantified. Per the data #1
dwarfs this; it's the requested completeness item, not the leverage.

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
- **Is the split worth it vs. the model lever?** The live sweep showed m-haiku cut the SINGLE
  test-strategist turn 626s->190s (70%) and still gate-passed. DECIDE against that first , if a
  cheap-model single turn is fast enough, the split is premature. This is the gating question.

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
2. #2 pre-conditioning-as-contract (subsumes the advisory-assembly migration to orchestrator/build;
   also the enabler for the test-strategist per-kind analysts).
3. #3 source-check (likely: document optimize-only, no drive change).
4. #4 session-warmth lever (small).
5. test-strategist split , DECIDE against the model-lever result first; if pursued, shape (B) on the
   chain substrate, measured before shipping.

## Guardrails (carry forward)
- LOCAL commits only; never push. Kit ships committed dist , rebuild + `git checkout -- dist` between
  releases; local commits are SOURCE-ONLY.
- TDD; drive byte-identical proven by the roleTaskBody/cycle-record prompt suites.
- New shared logic MIGRATES to the orchestrator family (`consort/orchestrator/...`), not left in
  scripts/sftdd , the buildContextPack extraction + the green-failure-advisory preparer are the model.
- Experiments read self-contained fixtures (`optimize/evaluation/fixtures/`), never the live corpus.
