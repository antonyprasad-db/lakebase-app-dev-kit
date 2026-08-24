# /sprint : the top-level orchestrator (the whole sprint, plan -> design -> build -> deploy)

`/sprint` is the Tier-1 entry point. It runs an entire sprint as one continuous
flow: plan the backlog (to the plan gate), then for each feature claim its branch
and drive it `design` -> `build` -> `deploy` to done. Control returns to the human
only at the gates, the human answers them live; headless, the Human Proxy does.

## Operating contract (drive + relay progress)

Follow `@consort/references/orchestrator-contract.md`: drive to completion via
`consort-next` (enact its `primary_action`, then continue), and stop for the human
ONLY at a HITL gate or a blocker. **Never go silent while it runs** , relay the
drive's live phase/role/gate transitions in plain language (see "How it runs"
below) so a multi-minute run always shows what's happening. At a stop, present the
decision (the `next` option titles + their `hil_prompt`s), not the CLIs you ran;
report outcomes ("S2 accepted", "F1 shipped to staging"). Show working software at
the acceptance + deploy gates. The relay is the phase/role/gate story, NOT a
per-command play-by-play (that finding-hunting mode stays opt-in via
`LAKEBASE_CONSORT_VERBOSE_AGENT=1`).

This is the autonomous path. The Tier-2 commands (`/plan`, `/design`, `/build`,
`/deploy`) are for running ONE phase at a time when you want hands-on control;
`/sprint` chains them. `/spike` is throwaway exploration outside the loop.

## Usage

```
/sprint [<sprint-name>]
```

Requires `.consort/` + project intake (the same precondition `/plan` enforces). The
sprint backlog (which features are in the sprint) is the PO's call, recorded at
`.consort/sprints/<name>/backlog.json`, produced by `/plan`'s authoring (headless,
from the recorded backlog).

## How it runs: the deterministic driver

`/sprint` IS the deterministic orchestrator driver run at sprint scope:

```bash
GATES=interactive; [ "${LAKEBASE_CONSORT_HUMAN_PROXY:-}" = "1" ] && GATES=proxy
./scripts/lk \
  consort-drive --sprint "<sprint-name>" --gates "$GATES" --project-dir "$PWD"
```

**Run it so you can relay progress live (don't run it as a silent blocking call).**
The drive narrates each turn to stderr AND self-writes `.consort/drive-live.log` (it
owns that file, so visibility does NOT depend on how you launch it). Launch it
**detached** so a watcher timeout can never kill it, then **watch it with the kit's
own `consort-watch`** , do NOT hand-roll a `tail -f … | while read; case …` loop
(brittle) and do NOT redirect stderr to `drive-live.log` (the drive already writes
it , a redirect double-writes):
```bash
nohup ./scripts/lk consort-drive --sprint "<sprint-name>" --gates "$GATES" --project-dir "$PWD" \
  >/dev/null 2>&1 &                            # detached; the drive self-writes .consort/drive-live.log
DRIVE_PID=$!
./scripts/lk consort-watch --pid "$DRIVE_PID"  # follows .consort/drive-live.log (bounded ~90s; re-run to keep watching)
```
`consort-watch` relays each phase/role/gate transition as it lands and STOPS at a
gate / pause / escalation / run-end (exit 0 clean, 3 on escalation). It also **bounds
its own wait (~90s) so a foreground call stays under the harness timeout** , if it
prints "still running", just re-run it; the detached drive keeps going. When it
stops, surface the decision to the human and run `consort-next` for the exact command
that clears it.
Translate the transitions into the phase/role/gate story (Spec Author → Architect →
Test Strategist → gates); do NOT relay the raw CLIs or state reads.
When the drive prints a `GATE`/`PAUSED` marker (or exits), present that decision,
then re-run to continue past it.

It FLOWS: plan -> **[PLAN GATE]** -> for each backlog feature: claim its branch
(via `lakebase-scm-claim-feature-branch`, the SCM entry-tier fork the driver does
not own) -> design (per-story **spec gates**) -> build (per-story **acceptance**)
-> deploy (**deploy gate**) -> next feature. Routing is code (not an LLM
orchestrator); each role is spawned as a subagent at its resolved per-role model;
the per-story pipeline streams within each feature. The phase/handoff log is
emitted as code to `.consort/agent-log.jsonl`.

**Gates + resume (interactive).** The run never skips a gate. It stops at the
next HITL gate, prints a `GATE` marker, and exits so YOU surface it to the human.
On the human's approval, record it (the same approve CLI the Tier-2 commands use
for that gate), then re-run `/sprint <name>` to RESUME: planning and already-done
features are idempotent no-ops, and the in-progress feature continues past the
now-approved gate. Headless (`--gates proxy`, `LAKEBASE_CONSORT_HUMAN_PROXY=1`): the
Human Proxy answers every gate and the whole sprint runs end to end (what the
TDD-workflow smoke exercises).

## Re-invoking each cycle

`/sprint` is re-run per sprint cycle. After a cycle ships, re-running it re-plans
(the PO folds in what the last cycle's working software revealed) and drives the
next features. A sprint is never deployed as a unit; each feature ships through
its own deploy gate.

## Kit version

Pinned to: `${KIT_VERSION_AT_SCAFFOLD}`

The `lakebase-update-commands` bin re-pulls this command's canonical template while preserving any project hooks.
