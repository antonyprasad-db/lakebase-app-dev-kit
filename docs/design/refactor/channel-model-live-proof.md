# Plan: live-prove the output-channel model across every step manifest

## Goal
Every shipped step manifest now declares its outputs by CHANNEL (product / artifact /
meta) and the orchestrator places each file under the resolved channel root. This is
proven HERMETICALLY (3167 green). It is NOT yet proven LIVE for the design roles: only
3 actions route through the channel-provisioning path, and only navigator-red +
driver-green have ever been live-proven. This plan closes that gap , run a real agent
through each manifest and assert the artifact/meta files land under `.consort` via the
channel model (not a hardcoded path).

## Current state (committed, LOCAL on `fix/headless-permission-mode-acceptedits`)
- HEAD `16ad3e1d` , "adopt the output-channel model across all shipped manifests".
- Channel resolver: `consort/orchestrator/provisioning/channels.ts` , `resolveChannelRoot(channel, {workspaceDir, artifactDir, metaDir})`. product→workspaceDir (always); artifact→artifactDir else workspaceDir; meta→metaDir else workspaceDir.
- Placement in `consort/orchestrator/steps/step.ts:128` , `provided.outputPaths?.[id] ?? spec.filename`, joined under `rootFor(spec.channel)`.
- Canonical doc: `consort/orchestrator/steps/step-contract.ts` ("OUTPUT CHANNELS" note) + `consort/orchestrator/steps/manifests/README.md`.
- Manifest filenames are now CHANNEL-RELATIVE (bare `agent-log.jsonl`, `feature-spec.json`); NO `.consort/` prefix (that double-encodes).

## THE KEY GAP (why "test all" is not just running existing tests)
The channel roots are only provisioned on the **executor-dispatch** path
(`consort/orchestrator/drive/executor-dispatch.ts` , `performTurnViaExecutor`'s
`provisionWorkspace: () => ({ workspaceDir: projectDir, artifactDir: consortDir, metaDir: consortDir, outputPaths: outputPathsForAction(...) })`).
`executorDispatched()` allowlists ONLY 3 actions today:
  1. spec-author breakdown  2. navigator RED  3. driver GREEN
The other design roles (spec-author story/propose, architect reviewer/estimator, dba,
test-strategist, ux-designer) + the build turns (review/reflect/assess/refactor/repair/
superseded/deploy) still take the LEGACY `perform` path, which does NOT provision
artifactDir/metaDir , so their channel tags currently resolve to workspaceDir (the
byte-identical fallback). Their channels are DECLARED but not yet EXERCISED live through
the contained-root path.

The per-role LIVE tests that DO exist (`tests/integration/live/<role>-live.test.ts`, via
`runRoleChain` → `runIntegrationChain`) run LEAN in a throwaway `.consort` temp dir and
also do NOT provision artifactDir/metaDir (see `integration-chain.ts` provisionWorkspace
returns only `{workspaceDir}`). So they prove the agent authors a conformant artifact,
but NOT that the channel model places it under a contained root.

## Coverage matrix (manifest → live proof today)
- executor-dispatch live (provisions .consort roots): spec-author-breakdown, navigator-red, driver-green  ✅ proven
- per-role lean live (workspaceDir only, channel = fallback): spec-author-story/propose, architect-reviewer/estimator, dba, test-strategist, ux-designer, navigator-assess  ⚠ agent proven, channel NOT
- build turns (empty outputs , nothing to channel-tag): navigator review/reflect/assess-*, driver refactor/repair/*-superseded/*-deploy  , n/a (verified by @build-cycle cycle records)

## Decisions (LOCKED by the user 2026-08-05)
1. **Scope of "all" = reading (a): widen + live-prove.** Widen `executorDispatched()` to every
   design manifest + provision artifact/meta, then live-run each. Plus the user's clarifier:
   **"confirm all manifest steps and routes"** , not only the artifact-producing design roles but
   the dispatch + route of every shipped manifest. (Command-level parity for all steps is ALREADY
   green , see "What's already proven" below , so the widen is about the executor-dispatch path.)
2. **Contained-root assertion = DONE (Stage 0, commit `2a2c5de6`).** The 3-distinct-root suite
   already existed; Stage 0 added the LIVE `.consort` shape (artifactDir === metaDir ===
   `<ws>/.consort`) + a decoy proving a `.consort/`-prefixed filename double-encodes. Suite 3169.
3. **Live env = BOTH authorized.** (a) Lean design live turns: `RUN_LIVE_STEP=1 npx vitest run
   tests/integration/live/<role>-live.test.ts` (model-API cost only, no cloud, no teardown). (b)
   Cloud-gated build proof: driver-green via `scripts/run-live-tests.sh` on a real Lakebase branch
   (ecparr). Run the lean design set first, then the gated build proof. NEVER interrupt a cloud run
   pre-teardown; tear down after.

## What's already proven (so Stage 1 is smaller than it looks)
- **Command-level parity for EVERY manifest step + route is already green:**
  `tests/bdd/commands-from-manifest.test.ts` asserts `commandsFromManifest(action) ≡
  commandsForAction(action)` (byte-identical) for spec-author breakdown/propose/per-story-ACs,
  architect reviewer/estimator, dba, test-strategist, ux-designer, AND all 14 build turns. So "all
  manifest steps and routes" at the command-derivation layer is DONE. Stage 1 is only about routing
  those same turns through the *executor-dispatch* path (`performTurnViaExecutor`) + channel placement.
- **Per-role LIVE agent turns are already green** (`tests/integration/live/<role>-live.test.ts` via
  `runRoleChain` → `runIntegrationChain`), but they run in a throwaway `.sftdd` temp dir and provision
  ONLY `{workspaceDir}` (no artifactDir/metaDir), so they prove the agent authors a conformant
  artifact but NOT that the channel model places it under a contained `.consort` root.

## Architecture (what makes Stage 1 mechanical , and the ONE subtlety)
`performTurnViaExecutor` (`consort/orchestrator/drive/executor-dispatch.ts`) is ALREADY
ROLE-AGNOSTIC: it resolves `manifest.inputs` off the live tree, runs the manifest's `before`/`after`
CLIs (+ the `@build-cycle` marker), materializes the agent-log via reconcile, and validates the
declared outputs in their channel roots. The ONLY role-specific knobs are:
  - `executorDispatched(action)` , the gate (which actions take the executor path).
  - `outputPathsForAction(action, consortDir, featureId)` , the per-output CHANNEL-RELATIVE path.

**The per-role artifact placement map** (each is the path RELATIVE TO `.consort` , derived from the
SAME `consort-paths.ts` helpers `designArtifactExpectation` uses, so it's slug-dir-safe + byte-
identical to legacy). `agent-log` (meta) is always bare `agent-log.jsonl` (reconcile writes it at
`<consortDir>/agent-log.jsonl`):
  | action | primary output id | channel-relative path (under .consort) | helper |
  |---|---|---|---|
  | spec-author breakdown | feature-spec | `features/<F>/feature-spec.json` | featureSpecJson |
  | spec-author propose | feature-proposals | `planning/feature-proposals.md` | featureProposalsMd |
  | spec-author per-story | acs (a DIRECTORY) | `features/<F>/stories/<S>/acs` | acsDir |
  | architect-reviewer | architecture | `features/<F>/architecture.json` | architectureJson |
  | architect estimate | estimates | `planning/estimates.json` | planningEstimatesJson |
  | dba | db-design | `features/<F>/db-design.json` | dbDesignJson |
  | test-strategist | test-list | `features/<F>/test-list.json` | featureTestListJson |
  | ux-designer | design-guide | `design/design-guide.json` | designGuideJson |
  | navigator RED | tests (product) | `tests` (at project ROOT, product channel) | , |
  | driver GREEN | code (product) | `app` (at project ROOT, product channel) | , |

**THE ONE SUBTLETY , spec-author per-story `acs` is a DIRECTORY primary.** The shipped
`spec-author-story.json` manifest declares `filename: "acs/AC1.json"` + validator `nonEmptyFile`.
But the agent writes a DYNAMICALLY-named AC file (e.g. `AC1-file-stock-record.json`), and
`nonEmptyFile` cannot validate a directory (it `readFileSync`s the path). The legacy
`designArtifactExpectation` for this action returns `acsDir(...)` (the DIRECTORY) as its `anyOf`, and
the `verify-artifact` command checks the DIR exists. So the executor's `outputPathsForAction` arm for
spec-author-story must point at the `acs` DIRECTORY, and the existence check (Step.run's
`this.exists(p)`) is satisfied by the dir , but `nonEmptyFile` would then fail on a dir. This role is
therefore NOT a drop-in: its executor dispatch needs either (a) a directory-aware validator
(`acsDirHasConformantAc`) or (b) exclusion from the executor allowlist with a documented reason.
Decide when the code lands; the other 7 design roles are single-file, drop-in. (This is the ONE
place where "widen every design role" is not purely mechanical.)
RESOLVED: added `acsDirConformant` (validator-registry.ts) , dir exists + every acs/*.json conforms
to ac.json (the deterministic floor legacy verify-artifact + the design gate enforced); the shipped
`spec-author-story.json` output now declares `filename: "acs"` + `acsDirConformant`.

## BLOCKER FOUND (Stage 1, must fix on the real path before the FULL executor-dispatch + live proof)
Widening surfaced a REAL latent bug in the shipped design manifests' INPUT `source` model , found by
running these manifests' inputs through the executor for the first time, and cross-checked against the
REAL recorded tree (`examples/sftdd-scenarios/stockflow-rerecord/recorded-artifacts/`):

- The executor's `inputPath` (executor-dispatch.ts) resolves `feature:<rel>` → `<consortDir>/<rel>`
  (FLAT, consort-root-relative) and `story:<rel>` → `storyResolved(...)`. The manifest-runner +
  integration chains resolve `feature:` the SAME flat way.
- But on a REAL `.consort` tree the design artifacts live at MIXED scopes:
    - ROOT: `product-overview.md`, `nfrs.md`, `design/design-brief.md`  (raw intake)
    - `planning/`: `feature-proposals.md`, `estimates.json`
    - FEATURE-SCOPED (`features/<F>/`): `architecture.json`, `db-design.json`, `test-list.json`
- So the shipped manifests' sources are INCONSISTENT with the real tree: `dba` declares
  `feature:architecture.json` (resolves flat to `<consort>/architecture.json`) but the architect
  actually WRITES it to `features/<F>/architecture.json` (my outputPathsForAction, matching legacy
  designArtifactExpectation + the recorded corpus). In a full chain, architect writes feature-scoped,
  dba reads flat → MISS. The `feature:` prefix is misnamed: it means "consort-relative", not
  "under features/<F>/". The integration chains only pass because their SEED manifests write inputs
  flat to match the flat read (a self-consistent fixture, not the real tree).

**This is why the full performViaExecutor for these roles is NOT yet wired/proven.** It is the exact
"executor cannot subsume perform until inputs resolve correctly" gap the retirement map predicts.

### The fix (options; pick before wiring the full dispatch)
- (A) Make the manifest input `source` carry the REAL relative scope: change the feature-scoped ones
  to `feature:features/{feature}/architecture.json` (a `{feature}` placeholder the resolver expands),
  matching where the artifact truly lives + the dba-chain seed already does this. Then the executor's
  `inputPath` + the manifest-runner both resolve correctly on the real tree AND the fixtures. Most
  honest (source names the real path); touches 3 sources (dba, test-strategist ×1, architect-estimator
  reads planning/ which is already correct).
- (B) Teach the executor's `inputPath` a feature-scope rule (resolve a bare `feature:X.json` under
  `featureResolved(consortDir, f)` when X is a known feature artifact). Rejected , re-introduces a
  hardcoded scope guess, the opposite of the single-source discipline.
RECOMMEND (A): the source string is the single source of truth for WHERE an input lives; make it
correct. Re-record understanding: the real tree is the corpus above , the source must match it.

### What IS proven now (Stage 1 + 1b, committed)
- `executorDispatched()` widened to all 7 design roles + navigator RED + driver GREEN (gate test).
- `outputPathsForAction()` places each design artifact feature/story-scoped under `.consort`, derived
  from the path helpers (placement test), never re-encoding the root.
- `acsDirConformant` validator + the shipped `spec-author-story.json` output updated.
- The command-level parity (`commandsFromManifest ≡ commandsForAction`) stays green for every step.
- **BLOCKER RESOLVED (Stage 1b, option A):** the mis-scoped manifest input `source` strings now carry
  the REAL relative path with a `{feature}` placeholder , dba + test-strategist:
  `feature:features/{feature}/architecture.json` (+ db-design), ux-designer:
  `feature:design/design-brief.md`. Both input resolvers (executor `inputPath` + manifest-runner
  `resolveInputsFromWorkspace`) expand `{feature}`/`{story}` (no-op on the literal-id integration
  fixtures, so those stay green).
- **FULL performViaExecutor now runs end-to-end HERMETICALLY for all 7 design roles** (retirement-map
  step (2) proven): seed inputs at true scope → dispatched → artifact lands under `.consort`
  single-level → CLI stream matches structural commands. Two further real parity gaps found + fixed:
  planning modes (propose/estimate) SKIP reconcile in `materializeOutputs` (matching the legacy
  `!isPlanningMode` guard); the executor runs reconcile (phase 4.5) BEFORE `after`-CLIs (phase 6.5),
  same reconcile-then-after order as the breakdown golden. Suite 3197 green.

### Stage 2 DONE , all 7 design roles LIVE-proven through the shipped executor
`tests/integration/live/<role>-executor-dispatch-live.test.ts` (+ shared
`executor-dispatch-live-support.ts`): each seeds its inputs at their REAL feature/story scope, runs a
REAL `claude -p` turn through `buildDriveEffects(cfg).performViaExecutor`, and asserts the artifact
lands under the provisioned `.consort` (single-level, no double-encode) + the reconciled agent-log
under `.consort` (meta; planning modes skip it). All 7 green (RUN_LIVE_STEP=1, model-API, NO cloud):
dba 37s, architect-estimate 18s, test-strategist 29s, spec-author-propose 38s, spec-author-story 46s
(acs DIRECTORY primary), architect-reviewer 53s, ux-designer 85s. This is the honest LIVE half of
retirement-map step (2)+(3) for the DESIGN lane , the design-role `commandsForAction` branches are now
provably subsumed by the executor path.

NOT yet (Stage 3): the cloud-gated driver-green LIVE proof (product channel on a real Lakebase branch)
, authorized by the user; run per the RUNBOOK (`scripts/run-live-tests.sh`), never interrupt
pre-teardown. navigator-red + driver-green executor dispatch were already live-proven earlier (#593/
#594); Stage 3 re-confirms driver-green's product+meta channels hold after the bare-filename change.

## RUNBOOK , how a future reader runs this proof
All commands run from the kit root (`~/code/databricks-solutions/consort`).

**Hermetic (no external effects , always run these first):**
```
npx tsc --noEmit
npx vitest run                                   # full suite (~3169), or:
npx vitest run tests/bdd/step-executor.test.ts   # channel placement + double-encode guard
npx vitest run tests/bdd/commands-from-manifest.test.ts     # command-level parity, all steps
npx vitest run tests/bdd/perform-via-executor.test.ts       # executor-dispatch parity per role
```

**Lean design LIVE turns (model-API cost only, NO cloud, ~30-90s each, serial , do NOT interrupt):**
```
RUN_LIVE_STEP=1 npx vitest run tests/integration/live/spec-author-breakdown-live.test.ts
RUN_LIVE_STEP=1 npx vitest run tests/integration/live/spec-author-propose-live.test.ts
RUN_LIVE_STEP=1 npx vitest run tests/integration/live/spec-author-story-live.test.ts
RUN_LIVE_STEP=1 npx vitest run tests/integration/live/architect-reviewer-live.test.ts
RUN_LIVE_STEP=1 npx vitest run tests/integration/live/architect-estimator-live.test.ts
RUN_LIVE_STEP=1 npx vitest run tests/integration/live/dba-live.test.ts
RUN_LIVE_STEP=1 npx vitest run tests/integration/live/test-strategist-live.test.ts
RUN_LIVE_STEP=1 npx vitest run tests/integration/live/ux-designer-chain-live.test.ts
```
Telemetry survives teardown under `.role-telemetry/` (override dir: `LAKEBASE_ROLE_TELEMETRY_DIR`).
These assert the AGENT authors a conformant artifact; the executor-dispatch-live variants (added in
this plan) additionally assert the artifact lands under the provisioned `.consort` (artifact) + the
reconciled agent-log under `.consort` (meta).

**Cloud-gated build proof (creates + tears down a real Lakebase branch on ecparr):**
```
# env door , sources .env.local.test.config + sets the gates (never hand-build the env):
scripts/run-live-tests.sh   # driver-green executor-dispatch live on a real Lakebase branch
```
Requires `.env.local.test.config` (gitignored; ecparr can create Lakebase for kevin.hartman , see
[[reference_test_env_single_home]]). NEVER interrupt a cloud run before teardown (orphan risk); tear
down after (repo + Lakebase project + dir) per the standard sequence.

## LEGACY-PATH RETIREMENT MAP (the real destination)
Widening the executor is not an end in itself , it is how the LEGACY dispatch path is eventually
DELETED. There are TWO legacy layers, retired in order:

**The dispatch seam** (`orchestrator-run.ts:326`): every agent turn tries `effects.performViaExecutor`
FIRST; on `undefined` it falls to `effects.perform`. So `executorDispatched(action)` is the retirement
frontier , an action returns from the executor (new path) or falls through (legacy path). Widening the
allowlist MOVES an action across that frontier.

**Two legacy command layers under `effects.perform`** (`orchestrator-effects.ts`):
  - `commandsForAction` , the original per-role/per-kind switch (the TRUE legacy; ~450 lines).
  - `commandsFromManifest` , the manifest-driven assembler, GATED byte-identical to `commandsForAction`
    by `tests/bdd/commands-from-manifest.test.ts`. It is the BRIDGE: `perform` prefers it when
    `useManifestSteps` is on, else falls to `commandsForAction`.

**Retirement is a poset, not a flip.** An action can be retired from a layer ONLY once the layer ABOVE
it is proven to subsume it:
  1. `commandsFromManifest ≡ commandsForAction` (DONE , golden green for every design role + all 14
     build turns). This is what lets the manifest assembler REPLACE the switch under `perform`.
  2. `performViaExecutor` subsumes `perform` for an action (the executor-dispatch parity golden ,
     `perform-via-executor.test.ts` , asserts the SAME CLI stream funnels through the runner, plus the
     one declared delta: the executor's validate-outputs gate). PROVEN for: spec-author breakdown,
     navigator RED, driver GREEN. Stage 1 EXTENDS this golden to the 7 widened design roles.
  3. LIVE proof that the executor path produces the right artifact in the right channel root (Stages
     2-3). Only after (2)+(3) for an action is its `commandsForAction` branch dead code.

**What CANNOT retire (stays legacy , by design, document the reason):**
  - `product-owner author-requests` (human-input step, no agent , Human Proxy supplies + sync-backlog).
  - `spec-author propose` DETERMINISTIC branch (recordedRequests && !livePropose , supply-proposals, no
    LLM). The LIVE propose IS executor-dispatched; the recorded-replay branch is not an agent turn.
  - `architect-reviewer estimate-committed` (re-syncs the sprint backlog; no shipped manifest).
  - the non-invoke-role kinds: `deploy-verify-heal`, `project-architect-notes`, `surface-gate`,
    `approve-gate`, `dispatch`, `cut-experiment`, `sync-backlog`, ... , pure substrate CLIs, never
    agent turns, so never executor-dispatched. `commandsForAction` KEEPS these branches permanently.

**Retirement frontier as of this plan (Stage 1):** executorDispatched now returns true for , spec-author
breakdown|propose|per-story-ACs, architect reviewer|estimate, dba, test-strategist, ux-designer,
navigator RED, driver GREEN. Everything else (the build self-heal turns review/reflect/assess/refactor/
repair/superseded/deploy + the non-agent kinds above) stays on `perform`. The build self-heal turns have
NO declared manifest outputs, so there is nothing for the executor's validate/channel phases to do ,
they are correctly left on `perform`→`commandsFromManifest` (still manifest-driven, just not executor-
dispatched). **The `commandsForAction` per-agent-turn branches become deletable once every dispatched
action has (2)+(3); the non-agent + deterministic branches remain.** That deletion is a FUTURE stage
(not this plan) , this plan proves the executor path is correct, which is the precondition for it.

## Plan (staged; each stage tsc + hermetic green before the live step)
### Stage 0 , hermetic contained-root guard (no live)
- Extend `tests/bdd/step-executor.test.ts` (or a new `channel-placement.test.ts`): provision 3 DISTINCT roots, a manifest with one output per channel, assert `producedPaths` land under the correct distinct root + a leading-`.consort/` filename would double-encode (regression guard for the bug fixed this session). Verify it BITES via a decoy.
- Gate: tsc + full hermetic suite green.

### Stage 1 , widen the executor to the remaining DESIGN roles (task #592)
- In `executor-dispatch.ts`: add each remaining design action to `executorDispatched()` + an `outputPathsForAction` arm (channel-relative filenames only). Roles: spec-author story + propose, architect reviewer + estimator, dba, test-strategist, ux-designer.
- Keep the parity golden (`perform-via-executor.test.ts`) byte-identical for the CLI sequence per role.
- Gate: tsc + hermetic suite green (the design-role-chains + executor tests cover the wiring).

### Stage 2 , LIVE design proof (lean, no cloud), ONE role at a time
- For each widened role: `RUN_LIVE_STEP=1 ... vitest run tests/integration/live/<role>-live.test.ts` (or a new executor-dispatch-live per role) and assert the produced artifact path is under the provisioned `.consort` (artifact) + the reconciled agent-log under `.consort` (meta).
- Run serially; capture telemetry to `.role-telemetry`. A lean turn is ~30-90s; do NOT interrupt mid-turn.

### Stage 3 , LIVE build proof (cloud-gated)
- navigator-red + driver-green executor-dispatch already proven; re-run the gated
  `driver-green-executor-dispatch-live` on a real Lakebase branch to confirm product(app/)
  + meta(agent-log under .consort) still hold after the bare-filename change.
- Uses `run-live-tests.sh` env (`.env.local.test.config`, `LAKEBASE_TEST_E2E=1`, ecparr can
  create Lakebase for kevin.hartman). NEVER interrupt a cloud run pre-teardown (orphan risk);
  tear down after (repo + Lakebase project + dir) per the standard sequence.

### Stage 4 , gate + commit
- tsc + full hermetic suite; rebuild dist; source-only + dist commit (LOCAL, never push
  without explicit ok). Kit ships committed dist.

## Hard constraints (carry through the compact)
- LOCAL commits only; push/tag/release/publish need explicit current-turn ok.
- NEVER `--no-verify`; `git commit -F <tmpfile>`, message ends `Co-authored-by: Isaac`.
- Kit ships COMMITTED dist , path/value-changing edits rebuild + commit dist; pure-source
  rebuild then `git checkout -- dist`.
- Live cloud runs: never interrupt pre-teardown; tear down after; the env door is
  `scripts/run-live-tests.sh` (sources config + sets gates), not hand-built.
- Design-lane live turns are LEAN (no cloud). scm-utils external API (SftddSetupHooks alias)
  stays; env prefix now LAKEBASE_CONSORT_* (legacy LAKEBASE_SFTDD_/TDD_ read).

## Key files
- `consort/orchestrator/drive/executor-dispatch.ts` , allowlist + outputPathsForAction + provisionWorkspace (the widen point).
- `consort/orchestrator/provisioning/channels.ts` , resolveChannelRoot.
- `consort/orchestrator/steps/step.ts:119-138` , placement.
- `consort/orchestrator/steps/manifests/*.json` , the 20 shipped manifests (channels tagged).
- `tests/bdd/step-executor.test.ts` , 3-root fixture (line ~370) to extend.
- `tests/bdd/perform-via-executor.test.ts` , parity golden per executor-dispatched role.
- `tests/integration/live/<role>-live.test.ts` + `support.ts` + `consort/optimize/role-chains.ts` , lean per-role live chains.
- `scripts/run-live-tests.sh` , the live door (modes: migrate / read-only / scenarios / orchestration / all).
