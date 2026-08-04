# reset-experiment-db + the driver build-turn phase (DESIGN ONLY — not built)

This is the written contract for the **driver** half of the per-role build-turn optimization work.
The **navigator** half is built and lean (no cloud): see `consort/orchestrator/optimize/build-role-chains.ts`
(`navigator-red`, `navigator-assess`) + `tests/integration/live/navigator-*-live.test.ts`. This file
records the driver seam + the shared-environment reset contract so the cloud phase can be built later
without re-deriving it. **Nothing here is implemented yet.**

## Why the driver phase is different (the hard constraint)

A navigator turn authors tests / a discriminator marker — no app, no DB. A **driver** turn writes
CODE that must pass **honest-GREEN**, which is not stubbable:

- `cycle-record.ts:459` `defaultGreenVerifier` → `deploy.ts` `ensureDeployedAndVerify({ projectDir, lakebaseBranch })`
  runs `alembic upgrade head` + the app's verify suite against a **live Lakebase branch** DB
  (`VERIFY_DATABASE_URL`, a child DSN — `deploy.ts:91,118`).
- `experiment.ts:158` `cutExperiment` **throws** when the paired branch's `.env` `DATABASE_URL` is
  unset (`!paired.envSynced`, ~line 197): "The build's honest-GREEN verify needs DATABASE_URL;
  aborting the cut so this is caught now, not at verify time."

So a driver chain **cannot** run in the lean throwaway `.sftdd` temp dir the navigator chains use.
It needs a scaffolded project + a live branch.

## The decision: ONE shared environment + a reset between experiments

Rather than cut/tear-down a fresh Lakebase branch per candidate (slow, quota-heavy), the driver
phase uses **one shared scaffolded Lakebase environment** for all experiments and a **reset script**
that returns its DB to a known baseline between candidates. The app's own alembic then rebuilds
baseline→head deterministically when each candidate's test suite runs, exactly as a fresh branch would.

### Where the driver chain plugs in

`build-role-chains.ts` `BUILD_ROLE_CHAINS` gains `driver-green` (start `{invoke-role, driver, story:S3}`)
and `driver-repair` (`{...buildMode:"repair", ac}`) entries — additive DATA + manifests, same shape as
the navigator chains. A new `runBuildDriverChainLive` (sibling of `runBuildRoleChainLive`) swaps the
temp-dir workspace for the shared scaffolded project and runs `cutExperiment` before the live driver
turn. The driver-turn quality gate is the **discriminator** already built
(`optimize-semantic-gate.ts` `makeBuildDiscriminatorJudge`, fixed opus) — the same judge the
navigator-assess alignment gate reuses as its independent oracle.

## reset-experiment-db contract

- **Lives:** `scripts/sftdd/reset-experiment-db.ts` + `reset-experiment-db.cli.ts`, shipping in `dist/`
  as `lakebase-sftdd-reset-experiment-db` (beside `lakebase-sftdd-experiment`). It CALLS
  `@databricks-solutions/lakebase-scm-utils/lakebase` for any Lakebase ops (same import surface
  `experiment.ts` + `cycle-record.ts` already use); it does NOT re-implement branch management.
- **Input:** the shared environment's branch `DATABASE_URL` (extracted from the project `.env` the
  same way `deploy.ts:70-73` does — the `DATABASE_URL=` line, quotes stripped) + the baseline alembic
  revision the env was created at.
- **Does (idempotent):** against that DSN —
  1. drop the app's non-baseline tables (everything the migrations created past baseline), and
  2. reset `alembic_version` to EXACTLY ONE baseline row:
     `DELETE FROM alembic_version; INSERT INTO alembic_version (version_num) VALUES ('<baseline_rev>');`
  So the next test suite's `alembic upgrade head` (via `ensureDeployedAndVerify`) rebuilds
  baseline→head cleanly, with no leftover state from the prior candidate.
- **Run:** before each driver experiment (between candidates) in the shared environment.

### Compatibility (verified against the current honest-GREEN path)

- `ensureDeployedAndVerify` / `defaultGreenVerifier` already run `alembic upgrade head` against a child
  DSN — a reset to a valid baseline revision is compatible; the verify upgrades FROM it exactly as a
  fresh branch would.
- `cycle-record.ts:529` notes a local `alembic upgrade` runs `env.py` (which imports the app's models).
  Therefore reset to the **baseline the env was created at** (NOT `alembic base`, unless base is truly
  empty), so `env.py`'s model imports resolve when the upgrade replays.

## Not in scope here

The reset script, the driver `BUILD_ROLE_CHAINS` entries, `runBuildDriverChainLive`, and the driver
live tests are all future work. This file is the contract only. When built, it is a GATED cloud phase
(needs a live Lakebase branch + explicit go-ahead), unlike the navigator chains which run under
`RUN_LIVE_STEP=1` with no cloud.
