# Consort telemetry

Consort emits **pseudonymous** usage telemetry to help maintainers understand how
the deterministic orchestrator (`consort-drive`) is used in practice — which
commands run, how many gates a run traverses, and how runs end. This document is
the contract: what is collected, what is **not**, and how to turn it off.

The default is **Level 1**: `consort-drive` only, one trace per run, resource +
span attributes drawn from a **closed allowlist**. **Level 2** is a separate,
explicit **opt-in** (off by default) that captures *more* — per-role turn timings
and coarse repair/loop counts — still drawn from a closed allowlist. No free-form
data is ever collected at either level. See [Level 2 (opt-in)](#level-2-opt-in).

## Why this is collected

Consort is a deterministic orchestrator with many roles and gates; without telemetry the
maintainers have no visibility into how it behaves outside their own machines. Each field
answers a specific product question — and nothing more:

- **`command`, `gate`, `gates_total`, `ordinal`** — which parts of the workflow are actually
  exercised and how long a typical run is, to guide where to invest and what to simplify.
- **`outcome` (run + per gate), `exit_code`** — where runs *end*: how often they complete vs
  abort vs escalate to a human, and which gates fail most. This is the primary signal for
  finding and fixing failure hotspots.
- **`duration_ms` (run + per gate)** — which steps are slow, to prioritize performance work.
- **`consort_version`, `node_version`, `os`, `arch`, `shell`** — the environment spread, so
  changes are tested against what people actually run and regressions can be tied to a version.
- **`install_id`, `ci`, `tty`** — distinct-install adoption over time, and separating real
  interactive use from automation.

**What it is NOT for:** it is never used to identify a person, never sold or shared, and
carries no work content — no prompts, code, specs, feature text, file paths, or names. It
cannot reconstruct *what* you built, only coarse structural facts about *how* the tool ran.

## Pseudonymous, not anonymous

Each install gets a random **UUIDv4 `install_id`** (created once, stored under
`~/.config/consort/telemetry.json`). It lets maintainers count distinct installs
and correlate a single install's runs over time. It is **pseudonymous**: the id
is a random token that carries nothing about you or your machine, but because it
is stable it is not *anonymous*. Delete the config file to reset your identity.

**No PII, ever.** The emitter ships only the fields on the allowlist below — all
enums, booleans, numbers, or structured identifiers. It never ships file paths,
branch names, spec/feature content, hostnames, usernames, environment values, or
error messages. A build-time reachability test
(`tests/bdd/telemetry-allowlist-reachability.test.ts`) fails CI if any field the
emitter can produce is not on the allowlist, and the emitter drops any
non-allowlisted key at runtime as a second layer of defense.

## Where telemetry goes (armed by default)

Telemetry is **opt-out and always-on**: telemetry is captured **whenever Consort is
used** , the launch method is irrelevant (an interactive terminal, the `consort.sh`
shell launcher, or an agent-driven run where Claude Code spawns `consort-drive` as a
subprocess). It reports to the Consort maintainers' ingest endpoint automatically. The
endpoint is baked into the client (`DEFAULT_ENDPOINT` in `consort/telemetry/emitter.ts`)
and armed by default — no per-machine setup. The only fields sent are the allowlisted,
non-sensitive ones below (no paths, code, spec/feature content, hostnames, usernames, or
errors).

> **Note:** telemetry used to *also* require an interactive TTY (`stdout.isTTY`). That
> gate silently suppressed telemetry for the primary usage pattern , agent-driven runs
> are non-TTY yet fully human-driven , so it is GONE. Capture no longer depends on a
> terminal; disclosure (the first-run notice) is delivered regardless of TTY.

To **opt out**, use either: `consort-telemetry disable` (persisted) or `CONSORT_TELEMETRY=0`
(per invocation). To **point elsewhere**, set `CONSORT_TELEMETRY_ENDPOINT`; to **un-arm
entirely**, set `CONSORT_TELEMETRY_SIGNOFF=0` (returns the emitter to a local no-op sink).

The default endpoint accepts **anonymous** POSTs, so nothing sensitive ships in the
client. If you run your own endpoint that needs a bearer, set `CONSORT_TELEMETRY_TOKEN`
and the emitter adds `Authorization: Bearer <token>` (a soft secret — abuse deterrence,
not real authorization).

The sender is a small hand-rolled NDJSON `POST` (no OpenTelemetry SDK). It is
**fire-and-forget**: bounded in-memory queue (cap 200, drop-oldest), one attempt,
~500 ms timeout, all errors swallowed. It never throws into `consort-drive` and
never blocks it. Telemetry can never change CLI behavior, latency, or exit code.

## Consent

Telemetry is emitted for a run **iff all** of these hold:

| Condition | Why |
|---|---|
| `telemetry_enabled === true` (persisted) | Your recorded opt-out choice. Default: on. |
| Not in CI (`CI` unset / `0` / `false`) | A project's CI pipeline is not a user of Consort. |
| `CONSORT_TELEMETRY !== "0"` | Consort's explicit per-invocation kill. |

There is **no TTY condition** , telemetry is captured whether Consort is driven from an
interactive terminal, the shell launcher, or an agent. The launch method does not affect
capture.

Environment overrides **always win**, and they only ever *disable*. There is no
force-enable env var: you can always silence telemetry, but nothing can turn it on
where these conditions do not already agree.

On the first consenting run, `consort-drive` prints a one-time notice to stderr.

## Turning it off

```bash
consort-telemetry disable      # persist the opt-out (~/.config/consort/telemetry.json)
CONSORT_TELEMETRY=0 consort-drive …  # per-invocation kill switch
```

Inspect the current state (including your install id and whether a run would emit
right now):

```bash
consort-telemetry status          # human-readable
consort-telemetry status --json   # machine-readable
consort-telemetry enable          # re-enable
```

## What is collected (schema `consort/v1`)

**Resource attributes** (shipped once per trace):

| Field | Type | Notes |
|---|---|---|
| `schema` | string | `"consort/v1"` |
| `install_id` | UUIDv4 | pseudonymous per-install id |
| `consort_version` | string | the kit `package.json` version |
| `node_version` | string | `process.versions.node` |
| `os` | enum | `darwin` \| `linux` \| `win32` \| `other` |
| `arch` | enum | `arm64` \| `x64` \| `other` |
| `shell` | enum | `zsh` \| `bash` \| `fish` \| `powershell` \| `unknown` |
| `ci` | bool | in CI? |
| `tty` | bool | interactive terminal? |
| `level` | number | `1` (default) or `2` (opted in) |

**Root span `consort.run`** (one per `consort-drive` run):
`trace_id`, `span_id`, `name` (`"consort.run"`), `start_ts` / `end_ts` (epoch ms),
`duration_ms`, `command` (`plan` \| `design` \| `build` \| `deploy`; a full
feature run reports `build`), `outcome` (`completed` \| `aborted` \| `error`),
`exit_code` (coarse: `0` completed, `3` aborted/escalation, `1` error),
`gates_total` (child span count).

**Child span `consort.gate`** (one per performed action; the terminal `done`
no-op is not a span): `trace_id`, `parent_span_id`, `span_id`, `name`
(`"consort.gate"`), `gate` (the WorkflowAction kind — see below), `ordinal`,
`start_ts` / `end_ts`, `duration_ms`, `outcome` (`pass` \| `fail` \| `skip` \|
`abort`).

### The `gate` enum (frozen WorkflowAction kinds)

Keyed off the real `WorkflowAction` union in
`consort/orchestrator/workflow/workflow-vocabulary.ts`. Frozen at authoring time —
the reachability test fails the build if this drifts from the source:

```
invoke-role, project-architect-notes, surface-gate, approve-gate, design-complete,
approve-plan-gate, planning-complete, dispatch, cut-experiment, deploy-verify-heal,
await-acceptance, accept, complete, feature-complete, deploy, approve-deploy-gate,
deploy-complete, prepare-pr, wait-ci, approve-promote-gate, merge, raise-to-hil,
revise-route, done
```

## Level 2 (opt-in)

**Level 2 is OFF by default and is only ever reached by an explicit opt-in.** Where
Level 1 answers *is it healthy / adopted*, Level 2 answers *why does a run fail and
where is the bottleneck*. It is higher-volume and closer to your work, so it is a
separate, deliberate choice — never on unless you turn it on. Everything it adds is
still **allowlisted enums / counts / durations — never raw content**.

### Turning Level 2 on and off

```bash
consort-telemetry enable --level 2   # opt in (persisted)
CONSORT_TELEMETRY_LEVEL=2 consort-drive …   # opt in for one invocation
consort-telemetry enable --level 1   # back to the Level-1 default
consort-telemetry status             # shows the resolved level
```

`CONSORT_TELEMETRY_LEVEL` wins for that invocation (`2` opts in, `1` forces back to
Level 1); otherwise the persisted level applies. Opting in to Level 2 does **not**
change consent: every Level-1 disabler (`disable`, `CONSORT_TELEMETRY=0`, CI,
`CONSORT_TELEMETRY_SIGNOFF=0`) still applies unchanged. On the first run
after you opt in, `consort-drive` prints a one-time Level-2 notice to stderr.

### What Level 2 adds (schema `consort/v1`, `level = 2`)

On top of everything in Level 1:

**Turn span `consort.turn`** (one per role invocation): `trace_id`,
`parent_span_id`, `span_id`, `name` (`"consort.turn"`), `role` (`spec-author` \|
`architect-reviewer` \| `dba` \| `ux-designer` \| `test-strategist` \| `navigator`
\| `driver` \| `product-owner`), `duration_ms`, plus the OPTIONAL coarse buckets
`model` (`opus` \| `sonnet` \| `haiku` \| `fable` \| `other`), `effort` (`low` \|
`medium` \| `high` \| `unknown`), `token_bucket` (`xs` \| `s` \| `m` \| `l` \|
`xl`), and `retry_count` (a number). The optional buckets are only carried when the
executor surfaces them; they are never the exact model id, and never a raw count.

**Extra `consort.run` fields** (all counts / a boolean — never content):
`red_green_cycles`, `refactor_iterations`, `revise_rounds`, `selfheal_attempts`,
`hil_escalations` (repair / loop dynamics — *is the ensemble thrashing*),
`story_count`, `ui_track`, and (reserved) `feature_count`, `ac_count`,
`test_count` (coarse project shape — *how big is the work*, never *what* the work
is).

**Extra `consort.gate` field:** `fail_class` — a nullable **categorized signature**
of a failure drawn from a closed enum (e.g. `merge-etimedout`, `npm-proxy-hang`,
`deploy-verify-halt`, `review-blocked-protocol`, `ux-adherence-hil`, `other`).
**Never the error text**, path, or any free string — only the category.

**Hard line, even at Level 2:** no prompts, code, spec / feature text, error
*messages*, file paths, branch names, hostnames, or usernames. Level 2 still cannot
reconstruct *what* you built.

> **Note on population.** Level 2 emits `consort.turn` (role + timing) and the coarse
> `consort.run` counts from the deterministic driver seam. The optional turn buckets
> `model` / `effort` / `token_bucket` / `retry_count` are now populated from the
> runner's per-turn meta: `model` and `effort` are the coarse family / lever the turn
> actually ran with, `token_bucket` is the `xs`–`xl` band of the turn's processed
> (input + output) tokens, and `retry_count` is its combined context-overflow +
> transient retry count (`0` on a clean turn). Each is omitted when the runner surfaced
> no value (a null column) , never guessed, never a raw id/count. `gate.fail_class`
> remains part of the closed allowlist and is populated as the failure-classifier
> surfaces it.

## Running the local collector

A thin first-party collector (`tools/telemetry-collector/`) accepts the emitter's
`POST /v1/traces`, appends each span as one NDJSON line, tolerates unknown fields
(returns `202`), and binds `127.0.0.1:4318`.

```bash
npm run collector       # start it (writes ./consort-telemetry.ndjson)

# in another shell, arm the endpoint + drive a synthetic two-action run at it:
CONSORT_TELEMETRY_ENDPOINT=http://127.0.0.1:4318 npm run simulate-run
```

`simulate-run` produces one `consort.run` root + two `consort.gate` children —
three NDJSON lines sharing one trace id.
