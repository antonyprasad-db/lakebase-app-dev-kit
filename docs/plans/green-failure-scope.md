# navigator-assess green-failure scope mismatch (#735)

Status: DIAGNOSED (approved). To land AS the first demonstration of the route→contract interface
(`route-contract-interface.md`), not a standalone one-off patch.

## Context
The live stockflow capture (`stockflow-instrumented-20260808-120333`) died at turn 21: driver-green's
GREEN verify failed against the running app, correctly routed to navigator-assess (supersession vs
regression), but dispatch aborted with `missing input "green-failure"` for
`{navigator, buildMode:assess, ac:AC1-...}`. This blocks the #727 re-record.

## Root cause (verified — a SCOPE MISMATCH, not "never produced")
- `green-failure.json` is WRITTEN at **AC/cycle scope**: `cycleDir(tdd, f, s, ac)/green-failure.json`
  (`consort/smells/supersession.ts:163`; `cycleDir` includes the AC, `consort/config/consort-paths.ts:203`).
- `navigator-assess.json` declares the input `source: "story:green-failure.json"`, which the executor
  resolves via `storyResolved(consortDir, f, story)` = the STORY dir, NO AC
  (`consort-paths.ts:174` / `executor-dispatch.ts` `inputPath`).
- Routing fires correctly (the probe reads AC-scoped via `readGreenFailure(..., ac)` /
  `needsGreenAssess`), so the file genuinely EXISTS — but `resolveInputs` presence-checks the STORY path
  (`<story>/green-failure.json`) instead of `<story>/<ac>/green-failure.json` → `MissingInputError`
  (`step-executor.ts:155`).
- Input sources today have only `feature:`/`story:` prefixes — there is NO `ac:`/`cycle:` scope.

Same CLASS as the breakdown (`feature-request` path) and reflect (`design` path) bugs.

## Fix (as a demonstration of the interface)
The route→contract work (`route-contract-interface.md`, Stage 2) adds an `ac:`/`cycle:` input scope and
(Stage 5) rewrites `navigator-assess.json`'s `green-failure` source to that scope + declares it as a
`requiresEvents: ["green-failure"]` contract, with `driver-green` declaring `raises: ["green-failure"]`.
The pre-dispatch seam (Stage 4) then blames the ROUTE if the event is absent, instead of the late
"missing input". So #735 is fixed by the mechanism that prevents its whole family — not patched alone.

If a standalone unblock of #727 is needed BEFORE the interface lands: minimally add the `cycle:` source
scope + repoint `navigator-assess.json`'s `green-failure` input to it. But prefer landing it through the
interface so it isn't redone.

## Verification
Hermetic: an assess step with an AC-scoped `green-failure.json` present resolves its input (no
MissingInputError); absent → the route-named `RouteContractError`. Live: the re-record (#727) proceeds
past turn 21 through the assess turn.

## Critical files
`consort/orchestrator/steps/manifests/navigator-assess.json`,
`consort/orchestrator/drive/executor-dispatch.ts` (inputPath scope), `consort/config/consort-paths.ts`
(cycleDir), `consort/smells/supersession.ts`.
