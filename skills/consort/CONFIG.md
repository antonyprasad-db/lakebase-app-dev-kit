# Consort configuration: one source of truth per setting

Every knob Consort reads has exactly ONE home and a small, named set of writers.
This is the advertised contract. If you are looking for "where does setting X come
from", this table is authoritative; if a setting ever appears to have a second door,
that is a bug (the `consort-config-single-source-guard` test exists to catch it).

There are three homes, and they do not overlap:

1. **Project settings** live in `.lakebase/consort-config.json`. They describe what the
   project IS (its UX track, gate policy, deploy target, model matrix, build cadence).
   They are read in exactly one place, `resolveConsortSettings(...)`, which resolves
   **file -> code default**. There is NO env or flag override at read time.
2. **Run-mode knobs** are per-invocation and live in `LAKEBASE_CONSORT_*` environment
   variables. They describe how THIS run behaves (record/replay, headless, debug),
   not what the project is. They are read via the `consortEnv(...)` accessor (one door
   each), which also honors the legacy `LAKEBASE_CONSORT_*` and `LAKEBASE_CONSORT_*` prefixes.
3. **Capture-time conditions** live in a scenario's `scenario.json`. They are read
   only by the capture harness and funneled into create-project as flags; they never
   reach the drive directly.

## Why one source

**One way in per setting.** A writer funnels a value into the setting's single home;
every reader reads that home. No parallel readers, no override-at-read. A setting with
two doors can contradict itself: one door set, the other read, and the project runs
mis-configured with nothing to flag it.

## Project settings (home: `.lakebase/consort-config.json`)

Read via `resolveConsortSettings({ projectDir })` in
`consort/orchestrator/settings/project-settings.ts` (file -> code default). Seeded at
create-time from `defaultConsortConfig()`. A project scaffolded before the rename is
still read through the legacy filenames (`.lakebase/consort-config.json` ->
`sftdd-config.json` -> `tdd-config.json`); new writes always target `consort-config.json`.

| Setting | Config path | Writer(s) |
|---|---|---|
| Per-role model / effort / fallbackModel / maxBudgetUsd | `roles.<role>.*` | create-project (seed + `--agent-model` per role); hand-edit |
| Build loop cadence (`story` \| `ac` \| `hybrid-a`) | `build.loopGranularity` | create-project (seed); hand-edit |
| Batch cap | `build.batchCap` | create-project (seed); hand-edit |
| Build session scope (`story` \| `cycle`) | `build.sessionScope` | create-project (seed); hand-edit |
| T-shirt sizing on/off | `plan.sizing` | create-project (seed); drive `--no-sizing` (write-through) |
| UX track on/off | `project.uiTrack` | create-project `--ui-track` (the ONE door for the UX lane) |
| Gate policy (`interactive` \| `proxy`) | `project.gates` | create-project (seed); drive `--gates` (write-through) |
| Deploy target | `project.deployTarget` | create-project (seed); drive `--deploy-target` (write-through) |
| Client framework (`react` \| `none`) | `project.clientFramework` | create-project `--client` (defaults to `react` when `--ui-track`, else `none`) |

**Derived, not stored:** the e2e harness is NOT a `consort-config.json` field. It is
derived at scaffold time: `enableE2e = uiTrack || (explicit --enable-e2e ?? language
is nodejs)`. A UI project always gets e2e; create-project refuses to scaffold a UI
project without it. This makes the old "e2e on / uiTrack off" contradiction
unrepresentable.

**Write-through flags are writers, not readers.** The drive's `--gates`,
`--deploy-target`, and `--no-sizing` do not override the resolved object; they
`applyProjectOverrides(...)` into `consort-config.json` FIRST, then `resolveConsortSettings`
reads the file like any other setting. The file stays the single on-disk truth, and a
plain run (no override flag) never mutates it.

## Run-mode knobs (home: `LAKEBASE_CONSORT_*` env)

Per-invocation, read via `consortEnv("<SUFFIX>")` (canonical `LAKEBASE_CONSORT_<SUFFIX>`,
legacy fallbacks `LAKEBASE_CONSORT_<SUFFIX>` then `LAKEBASE_CONSORT_<SUFFIX>`). These are NOT
project settings and never belong in `consort-config.json`.

| Knob | Env var | Purpose |
|---|---|---|
| Auto-continue | `LAKEBASE_CONSORT_AUTO_CONTINUE` | headless: auto-answer gates |
| Gate answer file | `LAKEBASE_CONSORT_GATE_ANSWER_FILE` | headless: scripted gate answers |
| Sprint requests | `LAKEBASE_CONSORT_SPRINT_REQUESTS` | headless: feature-request feed |
| Run label | `LAKEBASE_CONSORT_RUN_LABEL` | annotate the run-config snapshot |
| Verbose agent | `LAKEBASE_CONSORT_VERBOSE_AGENT` | tee every assistant text delta |
| Trace | `LAKEBASE_CONSORT_TRACE` | append raw action JSON to drive stderr |
| Ephemeral verify | `LAKEBASE_CONSORT_EPHEMERAL_VERIFY` | `0` opts out of the disposable-branch verify |
| Record corpus | `LAKEBASE_CONSORT_RECORD_DIR` / `_RECORD_BUILD_DIR` | per-turn corpus capture |
| Replay corpus | `LAKEBASE_CONSORT_REPLAY_DIR` / `_REPLAY_BUILD_DIR` | no-agent replay |
| Human proxy | `LAKEBASE_CONSORT_HUMAN_PROXY` | consumed agent-side by the command instructions (headless approver) |

**Context tuning** (`CONTEXT_FREE_FRACTION`, `HEAVY_ROLES`) is run-mode tuning with its
own accessor in `consort/session/context-budget.ts` (`LAKEBASE_CONSORT_* ?? CONSORT_*`).
One door each; intentionally not routed through `consortEnv`.

## Capture-time conditions (home: a scenario's `scenario.json`)

Read only by `capture-scenario.sh` via `consort-scenario-conditions`, then funneled
into create-project flags. The manifest is the single declaration of a scenario's
shape; the capture harness never hardcodes these.

| Manifest field | Funnels to | Lands in |
|---|---|---|
| `uiTrack` | create-project `--ui-track` | `project.uiTrack` |
| `tiers` | create-project `--tiers` | tier scaffold |
| `language` | create-project `--language` | project language |
| `runner` | create-project `--runner` | CI runner |
| `pauseBefore` | drive `--pause-before` | run-mode pause point |

## The guard

`tests/bdd/consort-config-single-source-guard.test.ts` is the anti-recurrence teeth:

- **Source guard:** `resolveConsortSettings`'s module must never reference `process.env`
  or import `consortEnv`. This fails even if a FUTURE project setting is given an env
  door, not just today's known settings.
- **Behavioral guard:** with every known project-setting env var set to a value that
  contradicts the file, resolution still returns the file's values.

If you add a project setting, add it to `ConsortConfigFile` + `defaultConsortConfig()` +
`resolveConsortSettings`, seed it in create-project, and add a row here. Do NOT add an
env read for it.
