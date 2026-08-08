# Plan: one optimize launcher , remove the second (`optimize-live-run.sh`)

## Context
Two launchers exist for the optimize sweep, and running by hand off a STALE dist bit us twice today.
The user's directive: ONE launcher; the launcher must guarantee freshness so a hand-run can't go stale;
remove the separate launcher (fold anything unique, delete the rest). This plan records exactly what the
second launcher calls and what is safe to remove.

## The two launchers
- **`scripts/optimize-role.sh`** , THE door. Runs the built CLI (`dist/tests/optimization/optimize-role.cli.js`).
  Sources the test-env home; now ALWAYS rebuilds dist first (freshness gap fixed this session, was
  build-if-absent). Keep. Sole launcher.
- **`examples/replay/optimize-live-run.sh`** , the SECOND launcher. Two paths:
  1. `--chains` (the "default door") , a pure PASS-THROUGH: `exec bash scripts/optimize-role.sh --chains … --concurrency …`
     (line 136). 100% redundant with the real door.
  2. scaffolded-drive `--scenario/--sweep-lane/--candidates` , the OLD concurrency-hostile substrate we
     moved OFF with the shared-scaffold refactor. It composes three scripts (Steps 1-3):
       - `capture-scenario.sh --no-drive` (scaffold + stage + claim)
       - `optimize-scenario.sh --sweep-lane <lane> --propose-only` (the champion walk)
       - `archive-optimize-results.sh` (copy experiments/ -> optimize-results/)
  Referenced by DOCS only (examples/replay/README.md, optimize-results/README.md) , no test, no code.

## What is NOT removable (independently live , do NOT delete)
The three composed scripts are used well beyond optimize-live-run.sh:
- **`capture-scenario.sh`** , referenced by `bin/consort/drive.cli.ts`, `bin/consort/scenario-conditions.cli.ts`,
  `tests/bdd/replay-layout-guard.test.ts`, `tests/bdd/consort-scenarios.test.ts`, the skill docs, and the
  capture runbook. It is the general capture tool. KEEP.
- **`optimize-scenario.sh`** , the single-handoff champion-walk door. `scripts/optimize-role.sh` only
  NAMES it in a comment (line 25), not a call. **UPDATE (2026-08-07): the champion-walk stack is now
  DEPRECATED** (see the follow-up section below); this script has been moved to
  `examples/replay/deprecated/optimize-scenario.sh`. It is no longer a live door , the judged
  `scripts/optimize-role.sh` is the only sanctioned launcher.
- **`archive-optimize-results.sh`** , referenced by OPTIMIZE-INDEX.md + optimize-results/README.md. KEEP.

## Removal (safe)
Delete ONLY `examples/replay/optimize-live-run.sh`:
- Its `--chains` path is a redundant pass-through to `scripts/optimize-role.sh` , callers use the real door directly.
- Its scaffolded-drive path is the retired substrate; anyone needing it calls
  `capture-scenario.sh` + `optimize-scenario.sh` + `archive-optimize-results.sh` directly (all still present).
- No test/code imports it; only docs mention it.

Then fix the doc references so the one door is unambiguous:
- `examples/replay/README.md` , replace optimize-live-run.sh usage with `scripts/optimize-role.sh --chains …`.
- `examples/replay/optimize-results/README.md` , same.
- Grep for any other `optimize-live-run.sh` mention and repoint to `scripts/optimize-role.sh`.

## Freshness fix (DONE this session)
`scripts/optimize-role.sh` changed from `[ -f "$BIN" ] || npm run build` (build-if-absent) to an
UNCONDITIONAL `npm run build` before `exec node`. tsup is incremental; a stale dist can no longer run.
This is why the door is now safe to be the only one.

## Verification
- `grep -rn optimize-live-run.sh` returns only this plan (all doc refs repointed).
- `scripts/optimize-role.sh --chains design --dry-run`-equivalent still works (the real door unchanged
  except the always-rebuild line).
- Full `npx vitest run` green (no test referenced optimize-live-run.sh, so nothing should break).

## NOT in this plan (mid-run hygiene note)
The live driver-green sweep's shared scaffold lands as `dg-live-<ts>/` in the repo root and is torn down
by `teardownDriverGreenProject` at run end. Do not touch it while a sweep is live. Separate concern.

## Follow-up (2026-08-07): the champion-walk stack is now DEPRECATED
The launcher consolidation above left the champion-walk door (`optimize-scenario.sh` → `consort-optimize`
→ `optimize-live`/`optimize-autocontinue`) standing as "a different tool from the chain-sweep door." It
is no longer sanctioned: it ranks on the fastest gate-passing turn and does NOT run a mandatory LLM judge
on every candidate (build handoffs bypass any judge), violating the standing invariant that EVERY
evaluation judges every candidate vs the recorded reference + preserves the output. Actions taken:
- deprecation banners on `consort/optimize/optimize-live.ts`, `consort/optimize/optimize-autocontinue.ts`,
  and `bin/consort/optimize.cli.ts` (+ a stderr warning when the bin runs);
- `optimize-scenario.sh` moved to `examples/replay/deprecated/` (depth-compensated) with a banner;
- `consort/optimize/OPTIMIZE-INDEX.md` topped with a deprecation notice pointing at the judged engine.
NOT deleted: the `consort-optimize`/`consort-optimize-apply` bins stay published (back-compat) and ~20
tests still exercise the pure exports. Removal is deferred until `optimize-apply`'s winner-persist path
is re-homed onto the judged engine (`runRoleSweep`). The ONE sanctioned launcher is
`scripts/optimize-role.sh`.
