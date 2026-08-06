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

## Decisions to lock before building (ASK the user)
1. **Scope of "all".** Two readings:
   (a) Prove the channel PLACEMENT for every design manifest = widen `executorDispatched()`
       to the remaining design roles + provision artifact/meta, then live-run each. This is
       task #592 ("widen executorDispatched allowlist to the remaining design turns") and is
       the honest "test all through the new definitions".
   (b) Just confirm every existing live test still passes on the new (bare-filename) manifests
       , cheaper, but does NOT exercise the contained-root path for the 8 legacy-path roles.
   RECOMMEND (a) , that is what "each can run using the new definitions" means.
2. **Contained-root assertion.** Add a hermetic executor test that provisions artifactDir≠metaDir≠workspaceDir (distinct temp dirs) and asserts each output lands under the RIGHT root (product→ws, artifact→artDir, meta→metaDir). step-executor.test.ts:370 already has a 3-root fixture , extend/mirror it per channel so a regression (double-encoding, wrong root) fails hermetically WITHOUT a live run.
3. **Live env.** Design-role live turns are LEAN (no cloud): `RUN_LIVE_STEP=1 npx vitest run tests/integration/live/<role>-live.test.ts`. Build-turn GREEN needs a real Lakebase branch (cloud-gated, `LAKEBASE_TEST_E2E=1` + `.env.local.test.config` via `run-live-tests.sh`). Confirm we run the lean design set first (fast, no teardown), then the gated build proof.

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
