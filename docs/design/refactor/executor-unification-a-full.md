# Plan: A-full , ONE dispatch path for every agent turn (executor), preconditions load-bearing

## Goal (user directive)
"One way through that is universally applied." Every AGENT turn (design + all build) dispatches
through the StepExecutor's Template Method; the context "pack" moves from inline `roleTaskBody`
string-concatenation to a DECLARED `preconditions` block the executor's PREPARE-PRECONDITIONS phase
injects. `commandsForAction`'s per-agent-turn branches are deleted as each turn is subsumed. The
non-agent substrate CLIs (approve-gate, dispatch, cut-experiment, sync-backlog, surface-gate,
project-architect-notes, deploy-verify-heal) STAY a separate, simpler mechanism , they spawn no agent,
so the executor's dispatch/validate spine does not apply (confirmed boundary with the user).

## Why this exists (the two-path problem A-full closes)
Today context reaches a live turn TWO ways, kept identical only by both calling the same preparers:
- **inline**: `roleTaskBody` (in orchestrator-effects.ts) string-concatenates `buildContextPack(...)`
  / `buildGreenFailureAdvisory(...)` into the prompt. This feeds BOTH dispatch paths because it is
  baked into `buildClaudeCommand` before either runs. It is the REAL injector on the live path.
- **formal**: the executor's PREPARE-PRECONDITIONS phase (step-executor.ts phase 2.5) runs the
  preparer for each declared `preconditions[]` entry and appends the block to `instructions.prompt`.
  BUT `LiveDriveStepAgent.invoke()` IGNORES `invocation.instructions` , it rebuilds
  `buildClaudeCommand(action,cfg)` itself , so on the LIVE path the formal face is DECORATIVE today
  (it feeds only the contained test agent). That is why "why isn't it this way everywhere?" , it
  literally isn't load-bearing on production yet.

A-full makes the formal face the ONE mechanism on the live path, then deletes the inline calls.

## THE POSITIONING WRINKLE (why byte-identity needs position-aware preconditions)
The inline pack is POSITIONED per turn (verified in orchestrator-effects.ts):
- **assess** (assess / assess-deploy / assess-refactor): advisory PREPENDS , `advisory + "ASSESS ..."`.
- **RED, review, refactor, repair**: pack APPENDS , `directive + buildContextPack(...)`.
The executor's phase 2.5 currently does `prompt = prompt + preparedSuffix` (APPEND only). So moving
assess to a declared precondition would REORDER its prompt (advisory after the directive) , NOT
byte-identical. Fix (user-chosen): make preconditions POSITION-AWARE.
  - `StepPrecondition.position?: "prepend" | "append"` (default "append" , the majority).
  - phase 2.5: prepend-position blocks go BEFORE instructions.prompt, append-position AFTER, in
    declared order. Byte-identity preserved per turn => the golden proof stays a golden (not "live
    behaves").

## The build turns + their pack (the migration set , agent turns only)
| turn (buildMode) | pack today | position | required output? |
|---|---|---|---|
| navigator RED (none) | context-pack | append | tests/ (product) , already executor |
| navigator review | context-pack | append | verdict , CONDITIONAL |
| navigator reflect | (none , reflect-gate CLI) | , | none |
| navigator assess | green-failure-advisory | PREPEND | marker , CONDITIONAL (escalate=no file) |
| navigator assess-deploy | (deploy-verify-assess marker read) | prepend | deploy-verify-scope , CONDITIONAL |
| navigator assess-refactor | (refactor-verify marker read) | prepend | (flag CLI, no file) , CONDITIONAL |
| driver GREEN (none) | context-pack | append | app/ (product) , already executor |
| driver refactor | context-pack | append | code , CONDITIONAL |
| driver repair | context-pack | append | code , CONDITIONAL |
| driver refactor-deploy | (scope read) | , | code |
| driver refactor-superseded | (superseded read) | , | code |
| driver green-superseded | , | , | code |

## The OPTIONAL-OUTPUT contract (needed by every no-required-output turn)
Self-heal turns legitimately write NO file (assess escalates to a human; review may decide
refactor:false with no artifact). A required executor output would treat that as blocked. So:
  - `StepOutputSpec.optional?: boolean`. Phase 5 validate: an optional output that is ABSENT is a
    PASS (not a violation); if PRESENT it MUST still be conformant (validator runs). A required
    output absent stays a hard reject. This is the ONE contract gap that has kept these turns off
    the executor , build it once, every self-heal turn uses it.

## LiveDriveStepAgent change (the load-bearing switch)
`invoke()` today: `runner.run(buildClaudeCommand(action,cfg))` , ignores instructions. A-full:
build the base command, but the PROMPT is the executor-assembled `invocation.instructions.prompt`
(base directive + prepared precondition blocks in position). To stay byte-identical, the base
directive must equal today's `roleTaskBody` MINUS the inline pack; the prepared precondition RE-ADDS
the pack in the same position => identical bytes. Everything else execRunner owns (session warmth,
context-budget, overflow/retry, replay overlay, set-phase/sync-backlog) is UNCHANGED , the command
envelope is the same; only the task string's assembly source moves.

## STAGED PLAN (incremental under the A-full goal; each stage tsc + hermetic green; live where noted)
Discipline: source-only local commits; kit-ships-dist untouched between releases; NEVER push; each
build turn's `commandsForAction` inline pack deleted ONLY once its executor dispatch is proven
byte-identical. Same destination, provable at each step, no flag day.

- **Stage F (foundation, hermetic) , DONE in source, gating:** position-aware preconditions + optional outputs.
  1. `StepPrecondition.position?` + phase 2.5 prepend/append (default append). Byte-identical for
     existing append-only users (design roles declare none; RED/GREEN get pack inline still).
  2. `StepOutputSpec.optional?` + phase 5 absent-optional=pass. Guard: an optional-absent passes, an
     optional-present-nonconformant fails, a required-absent still blocks.
  (Both threaded through the manifest type + JSON schema + Step.preconditions()/outputs().)
- **Stage F2 (agent unification) , the answer to "why two agents?":** collapse `LiveDriveStepAgent`
  INTO one parameterized `ClaudeStepAgent`. The two classes differ on ONE axis , contained-throwaway
  (raw `spawnClaudeStreaming`, embed-inputs-in-prompt, cwd=temp workspace) vs uncontained-production
  (`execRunner`, read-inputs-from-tree, cwd=project). execRunner carries production-only behavior
  (session warmth, context-budget guard, overflow/blip retry, build-replay overlay, set-phase/sync-
  backlog) the raw spawn lacks , so the unified agent takes a SPAWN SEAM + INPUT MODE + CWD, and the
  seam decides raw-vs-execRunner. This makes the live agent honor the executor-built `AgentInvocation`
  (prompt + positioned preconditions + manifest `agentOptions` levers) BY CONSTRUCTION , dissolving
  BOTH the prompt asymmetry AND the lever-sourcing asymmetry (live reads levers from `cfg`;
  contained from the manifest) in one move, instead of teaching a 2nd class to mimic the 1st.
  PROOF: a golden asserts the unified agent's command == today's `LiveDriveStepAgent.buildClaudeCommand`
  for a build turn AND today's `ClaudeStepAgent.buildCommand` for a contained design turn (byte-
  identical spawn args on both seams); full hermetic suite; then re-run ONE lean live design turn +
  the gated driver-green to confirm the live path is unchanged. CAVEAT: the optimize sweep injects
  cfg-level lever overrides (allowedToolsForRole/contextPackSuffix/taskSuffix) , confirm they still
  compose through the unified agent (route them through the invocation or keep the cfg read on the
  production seam) before trusting the live path.
- **Stage G (assess first , the exemplar):** move the 3 assess turns to the formal face.
  - shipped navigator-assess(/-deploy/-refactor): declare `preconditions:[{kind:"green-failure-advisory",
    position:"prepend"}]` (assess-deploy/-refactor get their marker reads modeled as preparers , add
    the 2 missing preparer kinds), declare the marker `outputs[]` as `optional:true` + the 2 missing
    validators (deploy-verify-scope, refactor-verify). Strip the inline advisory from roleTaskBody's
    assess branch. Add to executorDispatched + outputPathsForAction (cycle-dir meta channel).
  - Golden: commandsFromManifest still == commandsForAction (command layer unchanged); the executor
    prompt for assess === today's inline. Hermetic executor test: optional marker absent => produced
    (escalation route intact), present => validated. Then LIVE-prove one assess turn (needs a seeded
    failed-GREEN precondition; lean, no cloud).
- **Stage H (context-pack turns):** review, refactor, repair (+ re-confirm RED/GREEN) declare
  `preconditions:[{kind:"context-pack", position:"append", options:{skipTestLoop:...}}]`; strip their
  inline buildContextPack; add to executorDispatched; optional verdict/code outputs where conditional.
  Golden prompt-parity per turn; live-prove one (review, lean).
- **Stage I (the tail):** reflect + the deploy/superseded driver variants (no pack / marker-read) ,
  executor-dispatch with their @build-cycle postTurn + optional/absent outputs. Golden + one live.
- **Stage J (delete the legacy branches):** once every agent turn is executor-proven, DELETE the
  per-agent-turn arms of `commandsForAction` (the retirement the whole effort was for). The non-agent
  kinds' branches REMAIN. Guard: a test asserts commandsForAction has no invoke-role agent branch.
  Full hermetic + a final live smoke.

## Proof obligations (per stage)
- Command-layer parity: `commandsFromManifest ≡ commandsForAction` stays green (unchanged; it's the
  command envelope, which A-full does not alter , only the task-string assembly source moves).
- Prompt parity (NEW, the A-full core): executor-assembled prompt (base + positioned preconditions)
  === the pre-A-full inline `buildClaudeCommand` task, asserted per turn (append + prepend cases).
- Optional-output: absent-optional=produced, present-nonconformant=blocked, required-absent=blocked.
- LIVE: one representative turn per stage runs through the production drive
  (buildDriveEffects→runDriver→performViaExecutor→execute) with the real agent, artifact/marker under
  its channel, route intact. assess+review lean (no cloud); a driver code turn is cloud-gated.

## Hard constraints (carry through a compact)
- Agent turns ONLY; substrate CLIs stay separate (confirmed boundary).
- Position-aware preconditions REQUIRED (byte-identity); default append.
- LOCAL commits only; NEVER push/release without explicit current-turn ok.
- Kit ships committed dist; between releases source-only (`git checkout -- dist`).
- Per-turn incremental: delete a turn's inline pack + commandsForAction arm ONLY after its executor
  dispatch is proven byte-identical. No flag day on the just-proven live path.

## Key files
- `consort/orchestrator/steps/step-contract.ts` , StepPrecondition (+position), StepOutputSpec (+optional).
- `consort/orchestrator/turns/step-executor.ts` , phase 2.5 (prepend/append), phase 5 (optional).
- `consort/orchestrator/build/preconditions.ts` , add assess-deploy / assess-refactor preparer kinds.
- `consort/orchestrator/agents/live-drive-step-agent.ts` , honor invocation.instructions.prompt.
- `consort/orchestrator/drive/orchestrator-effects.ts` , roleTaskBody (strip inline packs per turn),
  executorDispatched, outputPathsForAction, and (Stage J) delete the invoke-role commandsForAction arms.
- `consort/orchestrator/validators/conformance/validator-registry.ts` , deploy-verify-scope + refactor-verify validators.
- `consort/orchestrator/steps/manifests/{navigator,driver}-*.json` , declare preconditions + optional outputs.
- Goldens: `tests/bdd/perform-via-executor.test.ts`, `commands-from-manifest.test.ts`, a NEW prompt-parity test.
