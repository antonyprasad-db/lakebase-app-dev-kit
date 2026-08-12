# Kit resolution — EXACTLY ONE way

Status: IMPLEMENTED (all 6 stages). Kit guard 13/13 green; kit work adds zero tsc errors / zero test
failures (the 3 pre-existing tree failures are unrelated WIP — see below). NOT committed / dist not rebuilt.

## What shipped
- `pin-local-kit.sh`: `resolve_kit_single_source <start_dir> [published_ref] [local_ref]` (git-toplevel
  KIT_ROOT one way; refuses LAKEBASE_KIT_DIR; pins local ref + cache symlink; exports KIT_SINGLE_ROOT/REF)
  + promoted `assert_kit_single_source` (hint + drift-assert). Published `--kit-ref` escape hatch preserved.
- Repointed `_replay-smoke.sh` (fixes the live launcher), both `run-smoke.sh`, `capture-scenario.sh`
  (now a thin caller). No launcher exports LAKEBASE_KIT_DIR.
- `tests/integration/live/kit-resolution.ts`: TS twin (default ref `sftdd-livetest-local`, DISTINCT from
  the shell's `sftdd-capture-local`). Routed all 7 `LAKEBASE_KIT_DIR = KIT` sites through it; real-scaffold
  supports call resolve + assert at scaffold and clear in teardown.
- `tests/bdd/kit-single-source-guard.test.ts`: launchers source+call the resolver & never export
  LAKEBASE_KIT_DIR; live tests import+call the TS twin & never assign LAKEBASE_KIT_DIR; exactly ONE decl
  of each resolver. 13/13 green.

## Pre-existing tree failures (NOT this workstream — proven via stash)
Whole-project tsc + full vitest show 12 tsc errors + 3 failing test files that exist WITH AND WITHOUT the
kit changes: `optimize-role.cli.ts` → missing `./driver-sweep.js` (tracked #749); navigator-reflect
haiku/sonnet resolver-parity mismatch; #595 host-hardcode in `OPTIMIZE-RUN-LOG.md`. All from the parked
massive-update WIP. Not kit, not route-contract.

## NOT YET DONE
Commit (source-only, by explicit path); dist rebuild.

---

(original design follows)

## Context
Chasing repeated live-capture failures surfaced that "the kit" is resolved by TWO incompatible
policies. This is the "more than one way to resolve the kit" we are collapsing.

## Problem
- **`LAKEBASE_KIT_DIR` policy** (`examples/replay/_replay-smoke.sh`, both `run-smoke.sh`): `export
  LAKEBASE_KIT_DIR=$KIT_ROOT` redirects ONLY the orchestrator process. The `claude -p` role agents do
  NOT inherit env → they resolve a DIFFERENT kit (the ref-keyed cache) → **split-brain** on live runs.
  This is the path the live capture launcher rode.
- **`pin-local-kit` policy** (`examples/replay/capture-scenario.sh`): the CORRECT one. Refuses
  `LAKEBASE_KIT_DIR`, pins a local ref + cache symlink + writes `.lakebase/kit-ref` + `kit-local-dir`
  hints into the scaffolded project, so orchestrator AND env-less agents resolve identical bits.
- KIT_ROOT is derived 4 different ways: `git rev-parse --show-toplevel`, `cd ../..`, `cd ../../..`,
  `process.cwd()` (TS).

## Decisions (user)
- The ONE policy is **pin-local-kit** (split-brain-safe).
- TypeScript live-test harnesses ARE in scope.

## Shared names
- Shell: `resolve_kit_single_source` + `assert_kit_single_source` promoted into
  `examples/replay/lib/pin-local-kit.sh` (keep its 3 existing primitives `local_kit_cache_link`,
  `pin_local_kit_cache`, `record_local_kit_hint`).
- TS: new `tests/integration/live/kit-resolution.ts` — `resolveKitSingleSource()` / `assertKitSingleSource()`.
- TS default ref `sftdd-livetest-local` — **deliberately DISTINCT from `sftdd-capture-local`** so a TS
  suite run can never repoint the live capture's cache symlink slot. Most important correctness call.
- Guard: `tests/bdd/kit-single-source-guard.test.ts`.

## Stages (smallest-first; tsc + targeted test between each)
1. Add `resolve_kit_single_source` + promote `assert_kit_single_source` into `pin-local-kit.sh` (inert;
   no caller wired). Preserve the published `--kit-ref` escape hatch: pin-local ONLY when no published ref.
2. Repoint `_replay-smoke.sh` (this fixes the live launcher): delete its KIT_ROOT block (~lines 84–98),
   call `resolve_kit_single_source "$REPLAY_DIR" "$KIT_REF"`, add `assert_kit_single_source "$PROJECT_DIR"`
   after scaffold + `cd`.
3. Repoint both `run-smoke.sh` (replay + recipe-app): delete their `cd ../..`/`../../..` KIT_ROOT + the
   `export LAKEBASE_KIT_DIR` blocks; call the shared resolver. (Recipe-app reaching into
   `examples/replay/lib` couples two examples — flag for user if a neutral shared home is preferred.)
4. Make `capture-scenario.sh` a thin caller (delete inline lines 166–194; behavior identical — it becomes
   a caller of the function it currently owns).
5. New `tests/integration/live/kit-resolution.ts` mirroring the shell policy; route all 7 TS sites that set
   `LAKEBASE_KIT_DIR = process.cwd()` through it (ref + cache symlink + project hint, NOT `LAKEBASE_KIT_DIR`,
   because spawned `claude -p` doesn't inherit env). Clear `LAKEBASE_KIT_REF` in teardown. The 7 sites:
   `executor-dispatch-live-support.ts:158`, `design-equivalence-support.ts:145`,
   `driver-build-support.ts:297`, `drive-executor-dispatch-live.test.ts:57`,
   `navigator-red-executor-dispatch-live.test.ts:118`, `spec-author-breakdown-live.test.ts:89`,
   `tests/live/spec-author-step-live.test.ts:61`.
6. Guard test: no launcher contains `export\s+LAKEBASE_KIT_DIR`; no `tests/integration/live/*.ts` or
   `tests/live/*.test.ts` contains `LAKEBASE_KIT_DIR\s*=`; exactly ONE decl each of
   `resolve_kit_single_source` / `resolveKitSingleSource` in the tree. Scope the guard to launcher + live
   files so the legitimate `LAKEBASE_KIT_DIR` usages (lk shim dev-door, `config/kit-ref.ts`,
   `npx-tax-guard` comments, `.env.example`, `CAPTURE-RUNBOOK.md`, `deprecated/`) are out by construction.

## Verification
- Hermetic: `npx vitest run tests/bdd/kit-single-source-guard.test.ts tests/bdd/npx-tax-guard.test.ts
  tests/bdd/consort-kit-ref.test.ts` green; then full suite.
- Shell dry-proof (no cloud): source the lib, call `resolve_kit_single_source "$PWD/examples/replay" ""`
  → assert `LAKEBASE_KIT_DIR` unset, `LAKEBASE_KIT_REF` set, cache symlink → repo root; published-ref mode
  exports REF, no local symlink.
- DEFINITIVE live proof: run `examples/replay/launch-stockflow-instrumented.sh`; confirm the
  scaffolded project carries `.lakebase/kit-ref` + `kit-local-dir` pointing at THIS tree, the pin/verify
  log lines print, and every `claude -p` agent's `lk` resolved the pinned ref (not `main`) — proving
  orchestrator AND agents on the same kit.

## Risks
- No hermetic test asserts the OLD `export LAKEBASE_KIT_DIR="$KIT_ROOT"` launcher block (verified) — low
  rebaseline. `npx-tax-guard.test.ts` + `consort-kit-ref.test.ts` unaffected.
- recipe-app importing `examples/replay/lib` couples two examples — acceptable under reuse-first; flag.
- Parallel worktrees (design-equivalence/driver-green) write per-worktree `.lakebase` + share a
  constant-target idempotent symlink — safe.

## Critical files
`examples/replay/lib/pin-local-kit.sh`, `examples/replay/_replay-smoke.sh`,
`examples/replay/capture-scenario.sh`, `examples/replay/run-smoke.sh`,
new `tests/integration/live/kit-resolution.ts`,
new `tests/bdd/kit-single-source-guard.test.ts`.
