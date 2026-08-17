# Driver-GREEN optimization levers — design + test plan

> Companion to `OPTIMIZE-INDEX.md` (the `# CURRENT` section). This file is the design for the
> driver-green–specific levers the run-17 analysis surfaced. Nothing here changes the default drive
> until a lever is SWEPT + judged + applied; the shipped code paths default the levers OFF.

## Why (the evidence, run-17 `stockflow-full`)

`driver/green` is **46% of the whole run's wall-clock** (23 turns, 329 min, avg 859s, 1.06M output
tokens). Per-turn anatomy (parsed from the recorded transcripts):

- **~100 tool calls/turn**, of which only **~3 are Write/Edit** (the actual code).
- Bash breakdown: **~20 `ls`/turn (31%)**, **~16 full test-suite runs/turn (25%)**, **~7 `alembic`/turn
  (11%, incl. `alembic current` ×5 in a row)**, plus `cat/head` re-reads.
- **duration correlates +0.61 with tool-call count and −0.18 with code written** — the long turns are
  churning on orientation + self-verification, not producing more code.

The guidance to stop this **already ships in the prompt** ("do NOT find/grep/ls", "the honest-GREEN
verify is the authoritative full run", "be terse") and the driver **ignores it**. So the levers are
**enforcement** and **pre-computed context**, not more prose.

## Safety invariant (why enforcing "no full suite" is not a hole)

The authoritative full suite runs **deterministically in the orchestrator**, not the driver or
navigator. `driver-green.json` declares `postTurn: [{ "bin": "@build-cycle", "when": "after" }]` →
`buildCycleCommand` → `consort-cycle green` → `greenOpenCycle` → `ensureDeployedAndVerify` → the full
`run-tests.sh` (alembic upgrade + pytest + client Vitest) on a fresh ephemeral child branch. The
driver's own test runs are private iteration ("this floor just proves the driver produced code");
`navigator-review` is a code critique that runs no tests. So denying the driver the full suite removes
redundant work only — the deterministic post-turn verify is unchanged.

A single branch-integration test does NOT need the full-suite runner: the tests hit the real branch via
runtime token-minting from `.env` metadata (`LAKEBASE_BRANCH_ID`), so `uv run --env-file .env pytest
<path>` against a pre-migrated branch is the driver's legitimate inner loop.

## The levers

| id | class | mechanism | targets |
|---|---|---|---|
| **`single-test-guard`** (E1) | enforce | per-candidate **PreToolUse hook** (`.claude/settings.json` + script) that denies a no-arg `run-tests.sh` / `make test` / `npm test`, allows `pytest <path>` / `run-tests.sh <path>` | ~16 full-suite runs/turn |
| **`deny-scan`** (E2) | enforce | `permissions.deny` globs for `Bash(ls:*)`,`Bash(find:*)`,`Bash(grep:*)`,`Bash(rg:*)` (no arg-discrimination needed → globs are reliable here) | ~20 `ls` + find/grep/turn |
| **`ctx-db`** (C1) | context | option-gated section in `buildContextPack`: probe `alembic current` + `heads` ONCE at context-build time, inject `DB STATE :: current=… head=… (do NOT re-probe)` | ~7 alembic/turn |
| **`ctx-test`** (C2) | context | option-gated section: inject the story's failing RED test body + the exact files under test, so the driver does not Read-discover them | ~40 Read + `cat/head`/turn |
| **`migrate-once`** | guidance | ctx note that the branch is pre-migrated; iterate with `--env-file .env pytest <path>` (skip re-migrate), reserve `run-tests.sh` for a final check | the per-run `alembic upgrade head` cost |

### Verified platform facts (claude-code-guide)

- PreToolUse hooks **fire in headless `claude -p`** (the drive passes `--setting-sources project`, no
  `--bare`). Deny contract: exit 2, or exit 0 with
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}`;
  the hook reads `tool_input.command` from stdin.
- `permissions.deny` rules enforce headless and **override `--permission-mode acceptEdits`** (order:
  deny → ask → allow; deny is absolute). Good enough for E2's coarse globs.
- **Argument-level deny-globs are officially fragile** (env vars, spaces, wrappers) — so E1's
  "no-arg vs with-path" distinction MUST be a hook, not a glob.

## Implementation (files + shapes)

1. **`tests/optimization/role-levers.ts`** (sweep-only) — extend `RoleLeverPatch`:
   ```ts
   denyBash?: string[];   // permissions.deny globs (E2)
   guardSuite?: boolean;  // install the single-test-guard PreToolUse hook (E1)
   ctxPack?: ("db-state" | "failing-test")[];  // context sections to enable (C1/C2)
   ```
   Add `driverGreenCandidates()`: `baseline`, `single-test-guard`, `deny-scan`, `ctx-db`, `ctx-test`,
   `migrate-once`, `enforce-all`. Pure enumeration; ids stable + filesystem-safe.

2. **`consort/orchestrator/build/build-context.ts`** (SHIPPED runtime) — extend
   `buildContextPack(…, opts)` with `{ dbState?, failingTest? }` (default off). Each is a pure
   projection with an INJECTABLE reader so tests are hermetic:
   - `dbState`: `(consortDir|projectDir) => { current, heads }` (default: shell `alembic current/heads`
     once); emits `DB STATE :: …`.
   - `failingTest`: read the story's failing test file(s) (derived from the story slug +
     `green-failure.json`/test-list `scenario_file`); emit a bounded `FAILING TEST (make THIS pass) ::`.
   Toggle read from env via `consortEnv("CTX_DBSTATE")` / `consortEnv("CTX_FAILINGTEST")`, so a sweep
   candidate flips it without threading through the whole drive config (mirrors the existing
   `skipTestLoop` opt + `consortEnv` style).

3. **`tests/optimization/driver-green-enforcement.ts`** (new, sweep-only) — pure helpers:
   - `SINGLE_TEST_GUARD_HOOK` (the bash/jq hook script text) + `singleTestGuardSettings()` (the
     `.claude/settings.json` PreToolUse registration).
   - `denySettings(patterns)` → the `permissions.deny` block.
   - `applyDriverLevers(workspaceDir, levers)` → writes/merges `.claude/settings.json` (+ the hook
     script) and returns the env patch (`LAKEBASE_CONSORT_CTX_*`) for `ctxPack`. Pure over an injected
     fs so it is unit-testable.

4. **`tests/optimization/driver-sweep.ts`** — in `runOneCandidate`, call `applyDriverLevers(workspace,
   candidate.levers)` before the driver turn and merge the returned env patch into the run.

## Tests (how we prove they work — hermetic, no cloud)

1. **`build-context.test.ts`** — `dbState` on (injected probe) ⇒ pack contains `DB STATE ::` with the
   probed values; off ⇒ absent. `failingTest` on (injected reader) ⇒ pack contains the test body; off
   ⇒ absent. Both are pure projections (no real alembic / no real fs shell).
2. **`role-levers.test.ts`** — `driverGreenCandidates()` is well-formed: baseline first; each candidate
   carries exactly its intended patch; ids unique + filesystem-safe.
3. **`driver-green-enforcement.test.ts`** — `applyDriverLevers` writes the expected
   `.claude/settings.json` (deny globs for `deny-scan`; PreToolUse hook for `single-test-guard`) and
   returns the right env patch for `ctxPack`. **Execute the hook script directly** with sample stdin
   JSON and assert: no-arg `run-tests.sh` → deny; `run-tests.sh tests/x.py` → allow; `make test` →
   deny; `pytest tests/x.py::s` → allow. (This is the guard's real logic, exercised as a subprocess.)
4. **`driver-green-lever-dispatch.test.ts` — the "live" mock-step-executor test.** Construct a `Step`
   for the `driver-green` manifest with an injected **mock `StepAgent`**; apply a candidate's levers to
   a temp workspace + assemble the driver instructions WITH the context pack; run the step. Assert:
   (a) the mock agent received an `instructions.prompt` containing the enabled `ctx-*` sections (and
   NOT the disabled ones); (b) the workspace carries the enforcement files the candidate declared;
   (c) the step completed (the mock materialized the output artifact, capture+validate passed). This
   exercises the full lever→dispatch path through the real Step executor with zero cloud/model.

The mock `StepAgent` is the same seam `ClaudeStepAgent` implements (`agent-types.ts` `StepAgent.invoke`),
so what the mock captures is exactly what the real headless turn would receive.

## Concurrency (`--concurrency 2` / `4`)

The parallel pool + per-candidate isolation (own worktree, own Lakebase experiment branch, own
`.claude/` + ctx marker) are concurrency-safe. The one shared resource was the honest-GREEN verify's
**fixed `:8000`** (`make run` = uvicorn, and the free-port helper is only wired into `run-dev.sh`/CI,
not the deploy path) , concurrent candidates would collide and the loser false-negatives
("app not reachable"). Fixed by a **deterministic per-candidate deploy port**: `deployPortForIndex(i)`
= `BASE_DEPLOY_PORT + i` (no OS-allocation race/TOCTOU), and `assignWorktreePort(projectDir, port)`
rewrites that worktree's `deploy-targets.yaml` `local` target so `base_url` AND the uvicorn `run` bind
the SAME port. Per-worktree file → no shared state, no shipped-deploy change. The CLI's driver runChain
computes the index from the candidate's position and threads `port` into `runDriverGreenOnScaffold`.
So `--concurrency 2` and `4` are now safe (bounded also by Lakebase branch quota + host resources).

## Run (after landing; live/cloud, user-kicked)

```
scripts/optimize-role.sh --chains driver-green \
  --candidates baseline,single-test-guard,deny-scan,ctx-db,ctx-test,migrate-once,enforce-all \
  --telemetry-dir examples/replay/optimize-results/runs/<stamp> --concurrency 2
```
Judged against `next-step/driver-green`; each candidate must still hold the deterministic honest-GREEN
verify. A winner is promoted by baking its context sections ON by default in `build-context.ts` and its
enforcement into the scaffold `.claude/settings.json` (a follow-up, once measured).
