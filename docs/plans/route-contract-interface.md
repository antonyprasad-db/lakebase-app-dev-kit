# Route → contract interface — the systemic fix

Status: IMPLEMENTED (all 6 stages, full suite 3500 green). #735 landed as its first demonstration.

## What shipped (vs the approved design)
- Stage 1 — `consort/orchestrator/steps/turn-events.ts`: `TurnEventKind` + `EventScope` +
  `TurnEventSpec` with an ACTION-AWARE `scopeFor(action)` (review-verdict is dual-scoped: cycle when
  the action carries an `ac`, else story), `TURN_EVENTS satisfies Record<TurnEventKind, TurnEventSpec>`.
- Stage 2 — `step-contract.ts`: added `raises`/`requiresEvents` faces + to `STEP_CONTRACT_MEMBERS`
  (compile-pinned); `Step` sources them from the manifest; schema + `StepManifest` gained the two
  optional fields; `cycle:`/`ac:` input scope added to `executor-dispatch.ts` inputPath (→ cycleDir).
- Stage 3 — SUPERSEDED: no standalone table. Manifests ARE the single contract source (they carry the
  events + already declared the markers as inputs); `manifestForAction` already enforces "every route
  has a contract path". See the change note below.
- Stage 4 — `consort/orchestrator/steps/assert-route-satisfiable.ts`: `RouteContractError` +
  `assertRouteSatisfiable`; wired as an OPTIONAL `DriveEffects` hook, called in `runDriver` before
  dispatch, implemented in `orchestrator-effects.ts` gated on `useManifestSteps` (default no-op).
- Stage 5 — manifests declare the contract: driver-green raises green-failure; navigator-assess
  requires green-failure (source moved to `cycle:` = #735 fix) + raises superseded/regression;
  driver-repair requires regression-assessment (source moved to `cycle:` = latent #735 twin fixed) +;
  navigator-review raises review-verdict; driver-refactor requires review-verdict. The superseded
  turns deliberately declare NO requiresEvents (they carry no `ac`; their marker is injected via the
  deterministic directive path, not a manifest input) — verified, no false-throw.
- Stage 6 — `tests/bdd/turn-contract-coverage.test.ts` (manifest set honesty + producer/consumer
  closure + known pairs) + `tests/bdd/assert-route-satisfiable.test.ts` (loud, route-named, scope-aware).
  Fixed one real fixture break in `every-manifest-executor-dispatch.test.ts` (seed cycle-scoped inputs
  at cycleDir with the action's ac). Full suite 3500 green.

## NOT YET DONE
- Activation is gated on `useManifestSteps`; the live capture path must run with that on for the seam
  to fire. dist NOT yet rebuilt with these changes. Commit pending.

---

(original design follows)

## Context
Repeated live-capture failures — breakdown `missing input "feature-request"`, reflect `missing input
"design"`, assess `missing input "green-failure"` — are ONE structural defect, not three bugs. The user's
directive: "all routes need a path and the orchestrator should expect a defined contract and approach for
all played turns so we're not doing one-off handling measures" + "an interface that defines this and has a
process event for the raised alert."

## Root cause (verified from source)
Route selection and input provision are two independent mechanisms with NO shared contract:
- **Router** `nextTransition` (`consort/orchestrator/drive/orchestrator-drive.ts:195-281`) +
  `nextBuildAction` (`:110-192`) pick the next `WorkflowAction` PURELY from state-bag flags
  (`assessGreenAc`, `greenSupersededAc`, `repairRegressionAc`, `reviewStoryPending`, …). They never
  consult a manifest or `StepContract` (pure, fs-free by design).
- **Input check** ~150 lines later: `runDriver` (`orchestrator-run.ts:350`) → `performViaExecutor` →
  `execute()` (`consort/orchestrator/turns/step-executor.ts:169`) Phase 1 `resolveInputs`
  (`executor-dispatch.ts:455-476`) presence-checks each manifest input `source` on disk and throws
  `MissingInputError` (`step-executor.ts:155-176`) LATE, blaming a "missing input" with no route attribution.
- Nothing guarantees a routed turn's declared inputs were produced on THAT route.

## The alert artifacts = the user's "process events" (today undeclared)
`green-failure.json`, `superseded-tests.json`, `regression-assessment.json`, `review-verdict.json` — each
WRITTEN by one turn (e.g. green-failure by `greenOpenCycle`, `consort/pipeline/cycle-record.ts:592-601`;
`writeGreenFailure`, `consort/smells/supersession.ts:181`) and REQUIRED by a later route (assess reads it
via probe `needsGreenAssess`, `supersession.ts:204-212`). The state-bag flags are DERIVED from these files
by the probe (`consort/orchestrator/state/orchestrator-probe.ts:343-400`) every `readState`. Producer →
event → router → consumer is four disconnected files.

## Existing scaffolding to reuse (do NOT reinvent)
- `StepContract` (`consort/orchestrator/steps/step-contract.ts:251-267`) — 6 faces; `STEP_CONTRACT_MEMBERS`
  (`:277-284`) pins them via `satisfies Record<keyof StepContract, true>`; `assertExactStepContract` runtime
  backstop. Only `MockStepContract` implements it; real routing is `nextTransition`; `route()` is consumed
  only post-turn in `execute()` Phase 7 (`step-executor.ts:289-297`).
- Manifests carry `inputs[].source` with `feature:`/`story:` scopes + `{feature}`/`{story}` expansion
  (`executor-dispatch.ts:439-448`). NO `ac:`/`cycle:` scope yet.
- `turnKeyForAction` (`consort/orchestrator/drive/turn-key.ts:19-65`) is the canonical action→step-identity
  map (collapses buildMode families) — the natural key for a per-turn contract table.
- `WorkflowAction` = ~26-kind union (`consort/orchestrator/workflow/workflow-vocabulary.ts:277-326`), no
  coverage validator.

## Design (staged, non-breaking, adds the contract layer AROUND the state machine)
1. **Event vocabulary (types only).** New `consort/orchestrator/steps/turn-events.ts`: `TurnEventKind =
   "green-failure" | "superseded-tests" | "regression-assessment" | "review-verdict"`; `EventScope =
   "feature"|"story"|"ac"|"cycle"`; `TurnEventSpec {kind,scope,filename,description}`;
   `TURN_EVENTS = {…} satisfies Record<TurnEventKind, TurnEventSpec>` (one spec per kind, compile-pinned).
2. **Extend contract faces + add ac/cycle input scope.** In `step-contract.ts` add `raises(action):
   TurnEventSpec[]` + `requiresEvents(action): TurnEventSpec[]`; add both keys to `STEP_CONTRACT_MEMBERS`
   (the `satisfies Record<keyof StepContract,true>` line FORCES every impl to have them at tsc — interface
   exhaustiveness). Update `MockStepContract` (default `[]`). Add `ac:`/`cycle:` scope: doc in
   `manifest.ts` `StepManifestInput` + `config/schemas/step-manifest.schema.json` + the resolver in
   `executor-dispatch.ts:441-448` `inputPath` (resolve under `cycleDir(consortDir, f, story, ac)`).
   Faces default `[]` → non-breaking.
3. **Route→contract source = the MANIFESTS (REVISED during implementation).** The approved plan called
   for a standalone `turn-contract-table.ts` keyed by `turnKeyForAction` with a `satisfies Record<
   DispatchingTurnKey,…>` compile pin. Implementation revealed this is WRONG: `turnKeyForAction`
   COLLAPSES distinct turns (`green-superseded`→`green`, all `assess*`→`assess`), so a turnKey-keyed
   table cannot distinguish plain-green (requires nothing) from green-superseded (requires
   superseded-tests). The 20 shipped MANIFESTS are the correct granularity (distinct `match` blocks) and
   ALREADY carry the required markers as inputs (`navigator-assess`→green-failure, `driver-repair`→
   regression-assessment). A separate table would be a 2nd source of truth (drift). **DECISION (user):
   manifests are the single contract source.** No `turn-contract-table.ts`. `requiresEvents`/`raises`
   live on each manifest (Stage 5), read via `Step`; the seam (Stage 4) resolves the manifest via
   `manifestForAction` (which ALREADY throws for a routed action with no manifest = "every route has a
   contract path" already enforced); the coverage guard (Stage 6) iterates `SHIPPED_MANIFESTS` at test
   time. Tradeoff: runtime coverage guard instead of a compile-time `satisfies` pin (JSON manifests can't
   be compile-pinned anyway).
4. **Pre-dispatch validation seam (loud, route-naming).** New
   `consort/orchestrator/steps/assert-route-satisfiable.ts` — `RouteContractError` +
   `assertRouteSatisfiable(action, state, probe)`. PLACEMENT: in `runDriver` (`orchestrator-run.ts`) AFTER
   `action` resolved (~line 282) and BEFORE dispatch (~line 350) — NOT inside `nextTransition` (must stay
   pure/fs-free). Resolve `turnKeyForAction` → look up `TURN_CONTRACTS` → for each `requires` event ask an
   injected `EventPresenceProbe` (backed by existing `readGreenFailure`/`needsGreenAssess` + cycleDir
   checks) if the artifact exists at its scope. On absence throw blaming the ROUTE: "route selected turn
   assess (AC1) but its required event green-failure was not produced (expected
   cycles/F1/S1/AC1/green-failure.json)." Wire as OPTIONAL `DriveEffects` dep (mirrors how
   `performViaExecutor`/`onRoutingDecision` were added); default absent = no-op; gate on the same
   `useManifestSteps` flag as the executor path. `MissingInputError` stays as defense-in-depth.
5. **Make real roles' event contract real.** `consort/orchestrator/steps/step.ts` implements
   `raises`/`requiresEvents` from new optional manifest fields; add them to `StepManifest` + schema
   (top-level `additionalProperties:false` requires it). Annotate shipped manifests: `driver-green.json`
   raises green-failure; `navigator-assess.json` requires green-failure (+ FIX its input source to the new
   `cycle:` scope = #735), raises the two markers; `driver-green-superseded.json` requires superseded;
   `driver-repair.json` requires regression; review/refactor pair on review-verdict. Absent keys default
   `[]` → non-breaking.
6. **Exhaustiveness/coverage guard tests.** `tests/bdd/turn-contract-coverage.test.ts`: (a) every
   dispatching action has `turnKeyForAction` + a `TURN_CONTRACTS` entry; (b) producer/consumer closure —
   every `requires` event is `raises`d somewhere; (c) manifest⇄table agreement.
   `tests/bdd/assert-route-satisfiable.test.ts` (hermetic): assess with no green-failure throws
   `RouteContractError` naming route+event; with the artifact present passes; empty-contract turn (red)
   passes; no-op when the dep is absent.

## Non-breaking migration
`nextTransition` is NEVER edited. The contract layer wraps it and takes over validation only once the
table is complete + the flag is on — at which point the scattered late `MissingInputError` becomes an
early, route-named `RouteContractError`.

## Tests asserting the OLD decoupled behavior — flag before touching
- `tests/bdd/step-executor.test.ts:133-140` — the late Phase-1 fail-loud (preserved by keeping the seam
  in the loop, not inside `execute()`).
- `tests/bdd/perform-via-executor.test.ts:119,129,280,373` — `undefined` fall-through for non-allowlisted
  actions (the Stage-4 flag must key off the same `useManifestSteps` gate).
- `tests/bdd/orchestrator-drive.test.ts:309-344` — `nextTransition` routing off flags; MUST stay unchanged
  (the tripwire proving the state machine is untouched).
- `tests/bdd/step-contract.test.ts` — `[]`-default faces keep `MockStepContract` green.
- `tests/bdd/manifest-step.test.ts` — Stage-5 schema change must keep `validateStepManifest` green.

## Open choices (non-blocking — recommended defaults)
- `requiresEvents` as `TurnEventKind[]` (recommended — resolve scope via `TURN_EVENTS`, one scope-truth)
  vs full `TurnEventSpec[]`.
- Fold the two faces onto `StepContract` (recommended — user said "extend what exists") vs a sibling
  `EventContract`.

## Critical files
`consort/orchestrator/steps/step-contract.ts`, `consort/orchestrator/drive/orchestrator-run.ts`,
`consort/orchestrator/steps/manifest.ts`, `consort/orchestrator/drive/executor-dispatch.ts`,
`consort/orchestrator/drive/turn-key.ts`, new `turn-events.ts` + `turn-contract-table.ts` +
`assert-route-satisfiable.ts`.
