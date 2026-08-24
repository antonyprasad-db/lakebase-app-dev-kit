# Orchestrator operating contract

How the agent that runs `/sprint`, `/design`, `/build`, `/deploy` must behave. It
is the orchestrator's counterpart to the role agents' `agent-operating-rules.md`:
those govern each role's turn; this governs the agent DRIVING the workflow. The
promise the kit makes to a consumer is **requirements in, working software out,
with human decisions only where they belong** - not a running commentary.

The deterministic driver (`consort-drive`) already sequences the work and
spawns the roles; your job is to run it to completion, **relay what it's doing as
it happens**, and involve the human only at the decisions that are genuinely
theirs. The failure mode to avoid is BOTH extremes: a per-CLI play-by-play, AND
silence , a multi-minute run where the human has no idea what's happening. Relay
the phase/role/gate transitions; don't narrate the tooling.

## Rules

1. **Relay live progress , never go silent.** The drive emits a per-turn progress
   line to stderr (`[drive] NNN <what it's doing>`), on by default (silence it only
   for captures/CI with `LAKEBASE_CONSORT_QUIET=1`), and the drive SELF-WRITES
   `.consort/drive-live.log` (it owns that file, so visibility does not depend on how
   you launch it). Run the drive so you can surface that stream live, with TWO hard
   rules. **(a) Launch with `--detach`, never `nohup`/`&`.** `./scripts/lk
   consort-drive … --detach` re-launches the drive in its OWN session (setsid) and
   returns at once, printing the child pid + the watch command. This is the only
   launch that survives your turn ending: a `nohup … &` leaves the drive in your tool
   call's process group, which the harness SIGTERMs on turn-end (the "drive reaped
   between turns" failure); `--detach` escapes that group. Do NOT redirect stderr to
   `drive-live.log` (the drive owns it , a redirect double-writes). **(b) Relay with
   poll-once `./scripts/lk consort-watch --since <cursor> --pid <drive-pid>` in a
   LOOP, not a blocking watch.** A long-blocking call is not streamed to the human
   (they see only a spinner); each `--since` call prints the new lines + a
   `[consort-watch] cursor=<N> status=<running|gate|pause|escalation|done|waiting>`
   trailer and EXITS , narrate that batch, then call again with the printed cursor
   until `status` is a stop. The same poll-once relay follows create + refresh (their
   `[stage]` / `lk:` lines classify too). Do NOT hand-roll a `tail -f … | while
   read; case …` loop (brittle; the kit owns the formats). `consort-watch` relays each
   transition as it lands ,
   e.g. "Planning: Spec Author proposing the backlog… → Architect estimating… → Plan
   gate reached." , and STOPS at a gate / pause / escalation / run-end (then run
   `consort-next` for the exact command that clears it). When it stops at a gate,
   `consort-watch` also OPENS the artifacts under review (feature-spec, architecture,
   db-design, test-list, story + ACs) in your editor when you are inside Cursor/Code,
   so you review them directly instead of hunting , run `./scripts/lk consort-open`
   yourself to (re)open them for the current feature/story at any time. Translate the terse markers
   to human phrasing (`dispatch spec-author for design` → "Spec Author: starting
   design"). This is the phase/role/gate story, NOT a play-by-play of CLIs or state reads.

2. **Drive to completion.** On every stop, read `consort-next` (or the
   auto-emitted `.consort/next.json`), enact its `primary_action`, and continue. Do
   NOT stop or ask unless `next` surfaces a HITL decision (a gate) or a blocker.
   Re-running the drive after a gate is part of driving, not a question to pose.

2. **At a HITL stop, present the decision, not the mechanics.** Show the `next`
   option titles + their `hil_prompt`(s) and enact the one chosen. Do not narrate
   the CLIs you ran, the state you read, or how the tooling performed.

3. **Report outcomes, not process.** "S2 accepted." "F1 shipped to staging."
   "Blocked: <reason>; clear it with <action>." Not per-command play-by-play and
   not commentary on the tooling.

4. **Show working software at the acceptance and deploy gates.** At the gates the
   PO signs off on, present the demonstrable behavior (the reachable endpoint /
   screen / passing acceptance check), not an internal artifact or state dump.

5. **Handle blockers, then continue.** On an escalation or error, apply the
   resolver that `next` (or the escalation) names, or state the single human
   action needed, then resume. Do not turn a blocker into a narrated
   investigation. On a **raise-to-HIL escalation**, run **`./scripts/lk
   consort-diagnose`** , it ANALYZES the failure (class + real reason/assertion +
   a suggested remediation) and bundles the forensics into `.consort/diagnostics/<ts>/`
   (the content telemetry never carries). Then: (1) **TROUBLESHOOT** , attempt the
   suggested remediation, and (2) **ASK the human whether to share the failure
   condition with the maintainers** (this is their call , the bundle is local
   content; if they consent, attach it to a consort issue). Once the root cause is
   fixed, clear the halt with **`./scripts/lk consort-resolve-escalation`** (it
   stamps `resolved_at` and KEEPS the record , never `rm` the escalation file) and
   re-run so the driver retries the failed action fresh.

6. **Only the human's DECISIONS go to the human.** Spec/plan/test-list/deploy/
   promote gates and per-story acceptance are theirs to decide. Everything else
   (routing, role turns, retries, migrations, waits) is yours to carry out WITHOUT
   pausing for input , but not without telling them: keep the progress relay
   (rule 1) running so they always see which phase/role is active. Carry it out
   autonomously, not secretly.

## What NOT to relay (the play-by-play line)

The relay is phase/role/gate transitions in plain language , the story of the run.
It is NOT: the exact CLIs you invoked, state you read, retry mechanics, or
tooling commentary. That finding-hunting, every-command play-by-play is EXPLICIT
opt-in (`LAKEBASE_CONSORT_VERBOSE_AGENT=1`, or when the human asks for it), for
debugging the kit itself , not the normal consumer path. Default = live
phase/role/gate relay (rule 1) + decisions at gates; never silence, never
per-command noise.

**One exception , the `[consort]` telemetry notice is NOT tooling noise; surface it.**
On the first run, `consort-drive` prints a one-time `[consort] … usage telemetry is on …`
notice to stderr. That is a **disclosure** (what's collected + how to opt out + the
Level-2 opt-in that helps the maintainers), and in an agent-driven run the human only
sees it if you relay it. Surface that `[consort]` notice to the human verbatim, once ,
do NOT filter it as tooling. It fires only once (state is persisted), so it is not noise.
