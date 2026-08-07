# examples/replay/ — replay, capture, and optimize machinery

One home for every script that drives a **real** Consort project (scaffold →
`/plan` → `/design` → `/build` → `/deploy`) against your own Databricks
workspace + GitHub owner. The machinery lives here; the recorded corpora it
replays/records live under [`corpora/<name>/`](corpora/) (each a self-contained
`recorded-artifacts/` design lane + `recorded-build/` build corpus + `turns/`
timeline + a `scenario.json` manifest). See [`SCENARIOS.md`](SCENARIOS.md) for
the corpus format and [`CAPTURE-RUNBOOK.md`](CAPTURE-RUNBOOK.md) for capture
mechanics.

All scripts resolve the kit through the committed `lk` resolver and default to
**THIS checkout's built `dist/`** (offline, deterministic) unless you pass
`--kit-ref <ref>`. All are **full cloud**: they scaffold a real repo + runner +
Lakebase project. Provide `DATABRICKS_HOST` (or a CLI profile) + `GITHUB_OWNER`,
or let a launcher source them from `.env.local.test.config`.

## The scripts, by job

### Replay a recorded corpus (deterministic, no model spawns)

**`replay-scenario.sh`** — the generic playback door. For each feature in the
scenario's `scenario.json`, in order, replays that feature's DESIGN lane +
restores its recorded BUILD, driving one project to the chosen handoff.
Multi-feature scenarios chain in ONE project (later features build on earlier
merged state).

| Option | Meaning |
|--------|---------|
| `--scenario <name>` | **Required.** The corpus under `corpora/<name>/` to replay. |
| `--to navigator\|release-engineer` | Handoff to pause before (default `release-engineer`, or the scenario's `pauseBefore`). |
| `--sprint <name>` | Replay the PLANNING lane once, on the first feature, before its design/build. |
| `--plan-only` | With `--sprint`: replay ONLY the planning lane, then STOP at planning-complete (no feature drive). For a planning-only corpus. |
| `--kit-ref <ref>` | Resolve the kit from a branch/tag/sha instead of this checkout's dist. |
| `--project-dir <dir>` | Override the scaffold target directory. |

**`replay-stockflow-rerecord.sh`** — one-line launcher for the standing
`stockflow-rerecord` mechanics regression: rebuilds dist if stale, sources
`.env.local.test.config`, turns on the manifest-driven executor, delegates to
`replay-scenario.sh`.

| Option | Meaning |
|--------|---------|
| `--to navigator\|release-engineer` | Handoff to pause before (default `release-engineer`). |
| `--sprint <name>` | Planning-lane sprint to replay (default `stockflow-rerecord-s1`). |
| `--no-sprint` | Skip the planning lane; drive features only. |

Replayed agent turns dispatch through the shipped **StepExecutor** (the
step-aware replay agent materializes each turn's recorded slice — no model
spawn). Each executor-dispatched turn logs `[executor] dispatch <manifest>
(<role>[/<mode>], <lane>)`, so a run's log shows exactly which turns went
through the executor (e.g. the planning `spec-author/propose` +
`architect-reviewer/estimate` turns under `--sprint`).

### The bug-tracker smoke (live, nothing replayed)

The default corpus is [`corpora/bug-tracker/`](corpora/bug-tracker/) — a small
FastAPI + SQLAlchemy + Alembic + Playwright app that evolves across two
browser-facing iterations (v1 file-a-bug, v2 transition-status), grouped into
two sprints. The engine (`_replay-smoke.sh`, sourced) resolves its intake docs
+ feature-requests from there.

| Script | What it does |
|--------|--------------|
| `run-smoke.sh --tiers 2` | Full end-to-end, live, nothing replayed: scaffold → plan → design → build → deploy across both sprints. Headless (Human Proxy stands in for every HITL gate). |
| `run-to-navigator.sh --tiers 2` | Replays the design lane, then PAUSES just before the Navigator build handoff (`[Y/n]`). Answer Y to resume into the live build. |
| `run-to-release-engineer.sh --tiers 2` | Replays design + restores the recorded build, then PAUSES just before the Release Engineer deploy handoff (`[Y/n]`). Answer Y to resume into deploy + verify. |

`run-to-*` PAUSE at the handoff and RESUME the same run on Y (they never bail
out of the state machine). Set `LAKEBASE_CONSORT_AUTO_CONTINUE=1` to auto-confirm
in CI. The smoke is **2-tier** (prod + staging; features fork from staging);
`run-smoke.sh` enforces `--tiers 2`.

### Capture a new corpus (record every turn)

**`capture-scenario.sh`** is the ONE door to author a corpus. It drives a real
project live with the per-turn recorder on, recording straight into
`corpora/<name>/` (`turns/` + `recorded-artifacts/` + `recorded-build/`), so the
result is immediately a committable, replayable corpus. Every other capture
script (below) is a thin preset over it or the engine.

| Option | Meaning |
|--------|---------|
| `--scenario <name>` | **Required.** Records into `corpora/<name>/`. |
| `--create` | Scaffold a FRESH project first (needs `--project-name`, `--databricks-host`, `--github-owner`, `--tiers`). Without it, drives an existing `--project-dir`. |
| `--project-name <n>` / `--project-dir <dir>` | Scaffold name (with `--create`) / existing project to drive. |
| `--databricks-host <url>` / `--github-owner <o>` / `--tiers <n>` / `--ui` | Scaffold conditions (with `--create`). |
| `--inputs-from <corpus-dir>` | Read intake (`intake/*.md`) + per-feature `feature-request.md` from another corpus, recording into THIS one (re-record from the same inputs). |
| `--sprint <name>` | Drive the whole-sprint orchestrator (PLANNING lane → plan gate → per-feature), backlog scoped to the `--feature` ids after it. Repeatable. |
| `--feature <id>` | A feature to drive; after a `--sprint`, joins that sprint's backlog. Repeatable. |
| `--plan-only` | With `--sprint`: capture ONLY the planning lane, then STOP at planning-complete (no feature drive). Produces a planning-only corpus. |
| `--only design\|build\|deploy` | Bound each per-feature drive to one lane. |
| `--pause-before navigator\|release-engineer` | Pause the drive at that handoff. |
| `--no-drive` | Scaffold + stage inputs only; don't drive (set up for a manual run). |

Env: `DATABRICKS_HOST`, `DATABRICKS_CONFIG_PROFILE`, `GITHUB_OWNER`;
`LAKEBASE_CONSORT_AUTO_CONTINUE=1` for headless (required with `--create`). Do
NOT set `LAKEBASE_KIT_DIR` (the script refuses it — it would split-brain the
orchestrator vs the `claude -p` agents; it pins one dev ref for both). See
[`CAPTURE-RUNBOOK.md`](CAPTURE-RUNBOOK.md).

Recording is gated on `LAKEBASE_CONSORT_RECORD_DIR` (+
`LAKEBASE_CONSORT_RECORD_BUILD_DIR` for the build corpus), which
`capture-scenario.sh` points at the scenario dir for you.

**Presets over the engine** (`_replay-smoke.sh`, sourced — they set
`REPLAY_DESIGN=0` so design runs live + records, and forward `--sprint` /
`--feature` / `--plan-only` to it):

| Script | What it does |
|--------|--------------|
| `run-capture.sh [--sprint <name>] [--plan-only] [--feature <id>]` | FULL LIVE CAPTURE — real design AND real build — recording every turn, paused just before the Navigator handoff. With `--sprint --plan-only`, captures the planning lane and stops. |

#### Deprecated (`deprecated/`)

Superseded stockflow-specific capturers on the OLD `LAKEBASE_KIT_DIR` kit
mechanism (split-brains the orchestrator vs the `claude -p` agents). Use
`capture-scenario.sh --create --inputs-from corpora/stockflow ... --sprint ...`
instead. Kept for reference / a resume-in-flight only; not a supported path.

| Script | Was |
|--------|-----|
| `deprecated/run-stockflow-capture.sh` | Stockflow F1+F6 reference capture (design REPLAYED, build LIVE + recorded). |
| `deprecated/resume-stockflow-capture.sh` | RESUME the stockflow F1+F6 capture after a mid-run halt. |
| `deprecated/resume-stockflow-f6.sh` | RESUME just F6-split-tracking-code after its driver GREEN turn overflowed. |

### Optimize (per-handoff champion-walk sweep)

| Script | What it does |
|--------|--------------|
| `optimize-scenario.sh` | Run a per-handoff optimization sweep against a scenario's feature: at the handoff the drive sits on, try config + content/scope candidates, keep the FASTEST gate-passing turn, emit a report. Only the winner records into the corpus. |
| `optimize-live-run.sh` | One-command live optimization first pass (P1+P3+P4): scaffold a fresh project, drive the DESIGN lane live to the build boundary, then run the champion-walk sweep (propose-only). |
| `archive-optimize-results.sh` | Archive one role's champion-walk results out of the throwaway project (destroyed at teardown) into the committable `optimize-results/<handoff>/` so the full lever sweep accumulates across roles. |

See [`../../consort/optimize/OPTIMIZE-INDEX.md`](../../consort/optimize/OPTIMIZE-INDEX.md)
for the sweep model and lever catalogue.

### Shared infrastructure

| Script | What it does |
|--------|--------------|
| `_replay-smoke.sh` | The shared replay/capture engine (SOURCED, not run directly). Scaffolds a real project, stages intake, claims the feature branch, replays/records the lanes, drives to a handoff. The `run-to-*` / `run-capture` / `replay-scenario` entry scripts source it and set `PAUSE_BEFORE` / `REPLAY_BUILD` / `REPLAY_DESIGN`. |
| `rebuild-push-warm.sh` | The shared WARMING + infra-readiness preflight: publish the current kit branch, warm the shared `lk` cache, free the deploy port. Run it when you want the pushed/published bits; the offline smokes don't need it. |
| `watch-artifacts.sh` | Monitor-friendly watcher: stream ONE line per newly-produced (or grown) run artifact — a live run is "healthy" only when artifacts land on disk. |

## Common flags (entry scripts)

| Flag | Meaning |
|------|---------|
| `--kit-ref <ref>` | Resolve the kit from a branch / tag / sha (validate an unreleased build) instead of this checkout's dist. |
| `--project-dir <dir>` | Override the scaffold target directory. |
| `--to <handoff>` | (replay) Pause before `navigator` or `release-engineer`. |
| `--sprint <name>` / `--no-sprint` | (replay) Replay the PLANNING lane once on the first feature, or skip it. |

## Guards

- `tests/bdd/consort-workflow-smoke.test.ts` — the bug-tracker smoke's shape +
  authored-doc conventions.
- `tests/bdd/consort-scenarios.test.ts` + `scenario-corpus-integrity.test.ts` —
  every committed corpus under `corpora/` is well-formed + replay-ready.
- `tests/bdd/replay-layout-guard.test.ts` — the canonical layout (this
  machinery dir + `corpora/`) can't silently re-scatter.

## Scope

These scripts validate the state-machine + TDD workflow end to end. The SCM
workflow CLIs (`lakebase-scm-prepare-pr` / `wait-ci` / `merge --wait-migrate`)
are tested separately by `tests/integration/scm-workflow-e2e-live.test.ts`.
They do NOT prove `/design` + `/build` output quality (the agent-eval pyramid),
remote deploy targets, or multi-user / auth flows.
