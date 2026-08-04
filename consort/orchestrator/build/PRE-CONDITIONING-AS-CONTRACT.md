# Design follow-up: pre-conditioning as a declared part of the step contract

Status: PROPOSAL (not built). Written after the build-turn chain work surfaced that the context
pack is a CONVENTION, not a CONTRACT.

## The problem this fixes

A build turn is only as good as what it is pre-conditioned with. The orchestrator injects a
**context pack** (RUBRIC = layers + required NFRs + design-token groups; LAYOUT = the role→module
map; TEST LOCATIONS; and, for assess, the deterministic pre-localization in `green-failure.json`)
so a fresh-session heavy role does not re-read the whole design tree or find/grep/ls to relocate
context (the recorded worst GREEN spent ~37 of 93 tool round-trips just relocating context already
on disk).

But **nothing in the step contract declares that a step needs this.** Today:

- `StepContract` (`contract/step-contract.ts`) has exactly three faces: `inputs()` (logical
  descriptors the orchestrator resolves + provides), `outputs()` (logical + validator), `route()`.
  It deliberately knows *what* it needs, never *how it is prepared*.
- The `StepExecutor` runs a fixed 7-phase Template Method: resolve-inputs → provision-workspace →
  **build-instructions (`instructionsFor`)** → dispatch-agent → capture → validate-outputs → route.
- The context pack is assembled IMPERATIVELY inside the build-instructions phase: the real drive's
  `roleTaskBody` calls `buildContextPack(sftddDir, feature, story, ac)` by hand in its build-turn
  branch. The orchestrator "knows" to prepare it only because that call is hardcoded there.

So the pack is wired in by convention at every prompt-assembly site. That caused a real defect:
the lean per-role build chains re-implemented prompt assembly and OMITTED the pack (RED) or
hand-wrote a prose approximation of the LAYOUT (assess), making the isolated turn UNFAITHFUL to the
dispatched turn until we retrofitted the real `buildContextPack` call into their `instructionsFor`.
Any future caller that assembles a build prompt can make the same omission, because the requirement
lives in prose + a hardcoded call, not in the contract the executor enforces.

## The proposal: a declared PRE-CONDITION face on the contract

Add a fourth face to `StepContract` (and its manifest surface): a step DECLARES the pre-conditions
it needs, and the executor PREPARES them in a dedicated phase before dispatch , exactly as it
already resolves `inputs`. The step stays dumb + contained; the orchestrator owns preparation.

```ts
interface StepPrecondition {
  /** Stable id (e.g. "context-pack", "green-failure-advisory"). */
  id: string;
  /** What kind of pre-conditioning to prepare , the orchestrator maps this to a preparer. */
  kind: "context-pack" | "green-failure-advisory" | /* extensible */ string;
  /** Human description (diagnostics). */
  description: string;
}

interface StepContract {
  inputs(action): StepInputSpec[];
  preconditions(action): StepPrecondition[];   // NEW , declared, orchestrator-honored
  outputs(action): StepOutputSpec[];
  route(completed, ctx): RouteProposal;
}
```

Executor phase change (a new phase 2.5, between provision-workspace and build-instructions):

```
resolve-inputs → provision-workspace → PREPARE-PRECONDITIONS → build-instructions → dispatch → …
```

`PREPARE-PRECONDITIONS` runs a registered PREPARER per declared kind. A preparer is a pure
projection of on-disk artifacts (the same discipline as `buildContextPack` today): given the
workspace `.sftdd` + the action's feature/story/ac, it returns a text block the build-instructions
phase appends to the prompt. `context-pack` maps to `buildContextPack`; `green-failure-advisory`
reads the pre-localized `supersededTestRefs`/`contractRefs`. This makes pre-conditioning:

- **Declared, not hardcoded** , the manifest/contract states the need; the executor honors it;
  every dispatch site (real drive, lean chain, future replay) gets it identically, for free.
- **One source of truth** , preparers live in `consort/orchestrator/build/` (where
  `buildContextPack` was already extracted), invoked by the executor, never re-implemented.
- **Testable in isolation** , a step's declared preconditions are unit-assertable (like inputs),
  and a preparer is a pure fn with a hermetic test.

## The "always something, never empty" principle (debated, ADOPTED)

Question raised: if a step declares no pre-condition, the pack is empty , is that acceptable?

**Adopt the stronger philosophy: there should ALWAYS be a non-empty pre-condition.** Rationale:

1. A build/design turn ALWAYS has *some* deterministic context worth projecting , at minimum the
   module LAYOUT (role→path) and the story's required NFR ids. A turn that receives an empty pack
   is a turn we have chosen to make rediscover context by hand , which the recorded data shows is
   the single largest avoidable latency. "Empty is allowed" silently re-opens exactly the defect
   this proposal closes.
2. An empty pack is almost always a BUG (a missing conventions.json, an unseeded artifact), not a
   legitimate "this step needs nothing." Treating empty as normal hides that bug; treating empty as
   a WARNING surfaces it.

Concretely: `buildContextPack` (and every preparer) currently returns `""` when its source
artifacts are absent (best-effort degrade). The proposal keeps the degrade (a preparer error must
never fail the turn) BUT: the `PREPARE-PRECONDITIONS` phase EMITS A WARNING to the agent-log when a
declared precondition prepares to empty ("declared context-pack prepared empty , conventions.json
absent?"), so an empty pack is visible + auditable, never silent. A step that genuinely needs no
pre-condition declares `preconditions() = []` explicitly (an affirmative "nothing", distinct from a
declared-but-empty preparer). The floor is: if you DECLARE a precondition, it should produce
content; a declared-but-empty result is a logged anomaly, not the happy path.

## Scope / sequencing

- Slice 1: add `preconditions()` to `StepContract` + `StepPrecondition` type + the manifest schema
  field; default `[]` (byte-identical , no step declares any yet).
- Slice 2: the `PREPARE-PRECONDITIONS` executor phase + a preparer registry (`context-pack` →
  buildContextPack, `green-failure-advisory` → the pre-localization reader), with the empty-warning.
- Slice 3: declare `context-pack` on the build-turn manifests (RED/GREEN/review/refactor) +
  `green-failure-advisory` on assess; DELETE the hardcoded `buildContextPack` call from
  `roleTaskBody` + the lean chains' `instructionsFor` (both now get it from the phase). Prove
  byte-identical drive output (the roleTaskBody prompt suites are the characterization gate).
- Slice 4: the lean build chains declare the same preconditions , so an isolated turn is
  pre-conditioned by the SAME phase as the dispatched turn, with zero per-chain prompt assembly.

## Why this matters beyond build turns

The same gap exists latent for design turns (the rubric/design-guide context). Making
pre-conditioning a declared contract face generalizes: a dba turn could declare it needs the
architect's persistence_invariants pre-projected; a test-strategist turn could declare the AC+
architecture summary. Today each is hand-assembled in `roleTaskBody`. One declared-and-prepared
mechanism replaces N hardcoded prompt-assembly branches , the same win the manifest/StepContract
refactor already delivered for inputs/outputs/routing, extended to pre-conditioning.
