# Capture flow: /sprint-driven recording + orchestrated intake interviews + full correspondence (#750)

Status: PLAN (approved to build, full scope). Sequenced BEFORE #736 (a fresh /sprint recording also
exercises the forward-delta chain #736 needs).

## Context / intent (user, 2026-08-08)
The recorded capture must MIMIC an interactive session, not a headless side-channel:
- **Step 0 = a real `/sprint`** issued by the human proxy (`consort-drive --sprint --gates proxy`).
- The **orchestrator RESPONDS by asking** for project-specific details — the intake files
  (product-overview / nfrs / design-brief) — via the already-designed HIL intake INTERVIEW, and the
  proxy answers. No out-of-band file pre-seeding.
- **Record ALL correspondence** between the human proxy and the orchestrator: every orchestrator
  QUESTION/request AND every proxy ANSWER/SUBMISSION (the actual content it supplies — interview
  answers, artifacts) AND the outcome (validated/approved). A faithful interactive transcript.

## What's already true (from the 3-agent review)
- `/sprint` → `consort-drive --sprint --gates interactive|proxy`; proxy mode auto-answers, interactive
  stops at HITL gates + author-requests. (bin/consort/drive.cli.ts runSprintMode ~362)
- The proxy is ALREADY request→response + synchronous: the orchestrator calls `consort-human-proxy`
  on-demand (supply / supply-requests / gate approve), the proxy validates + places + logs to
  `.consort/agent-log.jsonl`. (consort/gates/human-proxy.ts; bin/consort/human-proxy.cli.ts)
- The intake INTERVIEW flow is designed + PARTIALLY built: `docs/design/refactor/hil-intake-interview.md`
  steps 1,2,4,5 + Decision-1 `brief_ref` landed; **steps 3, 6, 7 remain** (the interviews themselves,
  the launcher rebuild, tests).
- The recorder captures agent turns fully + routing-decisions.jsonl + gates/human actions as turns —
  but only the RESULT, never the orchestrator's request, the gate presentation, the /sprint kickoff, or
  the proxy's submitted content/answers. No run-level correspondence log exists (net-new).

## Locked decisions (user)
- **Intake:** finish the HIL intake-interview flow (steps 3/6/7).
- **Correspondence home:** new `correspondence.jsonl` (paired request→answer→outcome).
- **Correspondence content:** record BOTH sides — orchestrator questions AND proxy answers/submissions
  (interview answer text + supplied artifact refs), plus outcome.
- **Uncovered `## Required` NFR:** HARD-BLOCK immediately (fail loud, like a missing input).
- **nfrs scope:** project-level + per-feature override.
- **Build scope:** FULL — interviews + correspondence + launcher, staged commits.

## Design

### D1. Correspondence surface (net-new) — `correspondence.jsonl`
A run-level JSONL the recorder writes at `<recordDir>/correspondence.jsonl`, one entry per exchange:
```
{ seq, iteration, at, phase, step,
  request:  { kind: "kickoff"|"intake-interview"|"gate"|"author-requests", prompt, questions?[] },
  response: { by: "human-proxy"|"human", answers?[], submitted?: { artifact, from, contentRef }, decision? },
  outcome:  { validated: bool, approved?: bool, violations?[] } }
```
- **kickoff** entry (seq 0): the `/sprint <name> --gates proxy` command + args (step 0 in the timeline).
- **intake-interview** entry: the orchestrator's question set (from hil-intake-interview.md §68-118) as
  `request.questions`, and the proxy's `response.answers` (the per-question answers it supplied) +
  `submitted` (the resulting product-overview/nfrs/design-brief, with a contentRef into files/).
- **gate** entry: the gate presentation (what was shown) + the proxy's approve/reject decision + violations.
- **author-requests** entry: the request + the feature-request.md files the proxy submitted (refs).
Writer: a new `recordCorrespondence(recordDir, entry)` in turn-recorder.ts; emitted from a new OPTIONAL
DriveEffects hook `onCorrespondence?(entry)` (mirrors onRoutingDecision), implemented in
orchestrator-effects where the proxy CLI is invoked (so both the request it builds AND the proxy's
logged response are paired). The proxy CLI additionally emits its answers/submission content so the
response side is faithful (extend human-proxy to write its per-question answers, not just the artifact).

### D2. Intake interviews — ALREADY BUILT in the command templates (CF Stage 4 finding)
FINDING (code review): the intake interviews the design doc called "step 3 remains" are ALREADY
documented + wired end-to-end:
- `/design` Step 0.5 (design.md:44-71): the full Product / NFR / UX interview question sets, the
  interactive-vs-headless split, the Human Proxy `supply` path from `$LAKEBASE_SFTDD_RECORDED_INTAKE_DIR`,
  and the `consort-intake` precondition (exit 5, un-skippable) that REFUSES phase 1 until intake conforms.
- `/plan` Step 0 (plan.md:17-25): the SAME project intake facilitated at planning , and `/plan` is what
  `/sprint` runs FIRST, so a sprint-first run hits intake at planning. Headless, the Human Proxy supplies
  from the recorded intake dir; interactive, the orchestrator runs the interviews.
So the orchestrator ALREADY asks for intake (interview or proxy-supply) at the start of a /sprint-driven
run. CF Stage 4 does NOT need to build the interviews. The remaining gap folds into Stage 5 (launcher):
drive from /sprint with the proxy supplying intake IN-RUN (not smoke-preseeded) + the correspondence
emitter (CF Stage 2) captures the supply exchange (intake.supplied) as a recorded entry. The interview
Q/A answers[] on the response side (D1) require the proxy to surface per-question answers , a small
proxy enhancement folded into Stage 5's proxy-material prep (only if we want the answer text, not just
the artifact; the artifact submission + validation are already captured).

### D3. NFR coverage — hard-block (REVISED after code review; user re-confirmed)
FINDING: NFR Required-coverage is ALREADY built + wired. `checkNfrCoverage` (artifact-conformance.ts:327)
runs both in the aggregate conformance (`:945`) and as the SPEC-GATE condition `nfrCoverageReason`
(gate-conformance-guard.ts:225) , so a feature CANNOT pass the design/spec gate with an uncovered
`## Required` NFR. That gate block IS the hard block. The design doc's "step 5 remains" was stale.
DECISION (user): KEEP the spec-gate block. Do NOT add an immediate architect-turn fail-loud , the
existing gate timing is deliberate: coverage is only judgeable once architecture.json exists AND
sibling-feature coverage + nfr_out_of_scope are considered (a project NFR may be owned by a sibling
feature), which a "fail the moment architecture.json misses X" would wrongly trip. Stage 3 = CONFIRM
the wiring + add regression tests + strengthen the failure message. No behavior change to the check.

### D4. nfrs scope — project + per-feature override (ALREADY built)
FINDING: both path builders exist (`nfrsMd` project, `featureNfrsMd` per-feature, consort-paths.ts:99/150)
and BOTH consumers already resolve the pair: the aggregate conformance iterates
`[nfrs.md, features/<F>/nfrs.md]` (`:943`), and the gate reason prefers feature-else-project
(`gate-conformance-guard.ts:230`). D4 is DONE. Stage 3 = add a regression test pinning the precedence.

### D5. Launcher — drive from /sprint, TWO sprints, proxy says yes to the whole lifecycle (step 6)
- Rebuild the capture launcher (examples/replay/captures/launch-stockflow-instrumented.sh +
  _replay-smoke.sh) to START at `/sprint` with `--gates proxy`, the proxy wired as HIL, and the intake
  interviews driving intake IN-RUN (no pre-seed cp). Pre-record the interview answers + intake artifacts
  as the proxy's material. Correspondence + kickoff recorded from seq 0.
- **TWO SPRINTS (user req):** the launcher must recognize + drive TWO sprints in the replay cycle —
  stockflow-rerecord-s1 (ships F1) THEN stockflow-rerecord-s2 (ships F6 / the expand-contract path).
  Each sprint gets its own `/sprint <name>` kickoff + correspondence stream; the cycle runs s1 to done,
  then s2 to done. (No single "next-sprint" gate exists; it is two `/sprint` invocations — the launcher
  loops the sprint list. Verify the recorder keeps correspondence per-sprint.)
- **Proxy says YES to the FULL lifecycle (user req):** under `--gates proxy` the HIL proxy approves
  EVERY gate to done — spec/plan/test_list, ACCEPT, DEPLOY, PROMOTE — for BOTH sprints, without a human.
  VERIFIED: drainGatesAsHumanProxy iterates all GATE_NAMES incl. deploy+promote (human-proxy.ts:128-165),
  and `--gates proxy` auto-continues (no stopWhen halt), so a single /sprint drives features
  design→build→deploy→promote to done. The "move to the next sprint" is the launcher advancing s1→s2
  (two invocations), NOT a gate. So requirement (2) is satisfied at the gate level today; the launcher
  just must drive both sprints + the proxy must have recorded material (interview answers, feature-
  requests, promote refs) for BOTH.

### D6. Tests + docs (step 7)
- Hermetic: correspondence.jsonl shape + pairing; interview question/answer capture; NFR hard-block
  coverage (uncovered Required → throws); per-feature nfrs override resolution. Update the intake doc
  status + SKILL.

## Stages (smallest-first; tsc + targeted test between each)
1. **Correspondence types + writer (inert):** `CorrespondenceEntry` type + `recordCorrespondence` in
   turn-recorder.ts + `onCorrespondence?` on DriveEffects. No emitter yet. Full suite unchanged.
2. **Kickoff + gate + author-requests emitters:** emit correspondence from orchestrator-effects where
   the proxy CLI is called + a kickoff entry at sprint start. Proxy CLI extended to surface its
   answers/submission content. (Records the CURRENT supply mechanism's exchange.)
3. **NFR coverage hard-block (D3) + per-feature nfrs override (D4):** conformance + resolver + tests.
4. **Intake interviews (D2, step 3):** /design → product-overview, /build → nfrs (+design-brief),
   question sets + draft + HIL-answer, proxy answers recorded via D1.
5. **Launcher rebuild (D5, step 6):** /sprint-driven capture, proxy as HIL, in-run intake, no pre-seed.
6. **Tests + docs (D6, step 7):** hermetic coverage + intake-doc status + SKILL.

## Constraints
LOCAL; source-only (dist rebuilt by launcher). One path for real + proxy (the doc's core principle).
The proxy NEVER invents intent (refuses on missing/non-conformant recorded material). Correspondence
records BOTH sides (question + answer/submission + outcome). Do NOT pre-seed intake via shell cp.

## Critical files
- consort/logging/turn-recorder.ts (recordCorrespondence + CorrespondenceEntry)
- consort/orchestrator/drive/orchestrator-run.ts (onCorrespondence hook on DriveEffects)
- consort/orchestrator/drive/orchestrator-effects.ts (emit correspondence at proxy-CLI call sites + kickoff)
- consort/gates/human-proxy.ts + bin/consort/human-proxy.cli.ts (surface answers/submission content; interview answers)
- consort/gates/artifact-conformance.ts (NFR Required-coverage hard-block)
- consort/config/consort-paths.ts + resolver (per-feature nfrs.md override)
- templates/project/common/.claude/commands/{design,build}.md (orchestrated intake interviews)
- examples/replay/captures/launch-stockflow-instrumented.sh + _replay-smoke.sh (/sprint-driven)
- docs/design/refactor/hil-intake-interview.md (status update)
