# Integration chains: per-role isolation harness

This directory is the **per-role isolation substrate**: a way to run ONE orchestrator role's
turn — the real `claude --agent <role>` spawn — in a throwaway `.sftdd` workspace, with the
turn's inputs *replayed in* from recorded artifacts, **no cloud project**. It exists so a single
role can be **instrumented, gated, and lever-swept** in isolation (wall-clock, cost, tokens,
conformance, quality), which is impractical inside a full scaffolded drive.

Two consumers share the same manifests + runner:
- **Hermetic tests** (`hermetic/`, run under `npm test`) — prove each chain is well-formed WITHOUT
  spawning a model.
- **Live tests** (`live/`, gated on `RUN_LIVE_STEP=1`) + the **per-role sweep**
  (`lakebase-sftdd-optimize-role --role <r>`) — spawn the real agent.

## Experiment reproducibility: preserve BOTH halves

The per-role sweep is an EXPERIMENT, and an experiment must be reproducible + re-judgeable from
preserved source, not from telemetry alone. That means preserving both halves:

1. **Inputs (the fixtures).** The chain manifests + recorded artifacts these tests replay are
   deliberate SELF-CONTAINED COPIES — elements cherry-picked out of the canonical regression corpora
   (`examples/sftdd-scenarios/*`) and copied into what the isolated tests need. They are copies BY
   DESIGN: an experiment that reached into the live corpus would break the instant the corpus was
   re-recorded, and old results couldn't be replayed. So the fixtures are pinned + owned by the
   harness, never a live link to the corpus (no drift guard — a copy is the correct end state).
2. **Outputs (per run).** Every sweep run persists each candidate's ACTUAL produced artifacts
   (`.role-telemetry/sweep-<role>/<candidate>/artifacts/…`) + `telemetry.json` + `replay.json`
   (levers + seed corpus ref), so any trial can be re-judged from its real output, not just its
   score. (This is what the snapshot-root fix restored — before it, outputs were silently dropped.)

## Layout

```
tests/integration/
  intake/                      recorded design artifacts the chains replay in (the F1 corpus)
  manifests/<role>-chain/      one dir per chain: a seed (replay) + the live-role manifest(s)
  hermetic/                    no-model guards (schema, chain-holds, seed-produces-inputs)
  live/                        RUN_LIVE_STEP-gated real-spawn tests + shared support.ts
  route-scenarios/             manifest set for the routing (revise/escalate) scenario suite
```

A chain is a **2+-turn manifest set** in `manifests/<role>-chain/`:
1. a **seed** (a `replay` agent) that materializes the recorded PRE-turn state (the role's input
   pack — ACs / architecture / db-design / a code tree / markers) into the workspace, then routes
   to
2. the **live role** (a `claude` agent) that authors its output from that pack.

The seed exists so the live turn is **pre-conditioned exactly as the dispatched turn is** — the
whole point is fidelity: an isolated turn given LESS than production would measure an artificially
harder (or thinner) turn. See `../../consort/orchestrator/build/PRE-CONDITIONING-AS-CONTRACT.md`.

## The chains

### Design lane (sweepable via `optimize-role`; `ROLE_CHAINS` in `optimize/role-chains.ts`)
| Chain (dir) | Live role | Output scored | Seeded pack |
|---|---|---|---|
| `spec-author-propose-chain` | spec-author (propose) | `planning/feature-proposals.md` | product-overview + nfrs |
| `spec-author-story-chain` | spec-author (story ACs) | `.../S1/acs/AC1-…json` | product-overview + story stub |
| `architect-reviewer-chain` | architect-reviewer | `architecture.json` | nfrs + AC1 |
| `architect-estimator-chain` | architect-reviewer (estimate) | `planning/estimates.json` | feature-proposals |
| `dba-chain` | dba | `db-design.json` | architecture.json |
| `test-strategist-chain` | test-strategist | `test-list.json` (scored vs S1 slice) | S1 AC1+AC2+AC3 + architecture + db-design |
| `ux-designer-chain` | ux-designer | `design/design-guide.json` | design-brief + product-overview |

### Build lane (navigator; run live via `live/navigator-*-live.test.ts`, not in `ROLE_CHAINS`)
| Chain (dir) | Live role | Output | Pre-condition (declared) |
|---|---|---|---|
| `navigator-red-chain` | navigator (RED, S3) | `tests/` tree | `context-pack` |
| `navigator-assess-chain` | navigator (ASSESS, S1) | assess marker | `green-failure-advisory` |

### Not a role chain
| Dir | Purpose |
|---|---|
| `route-scenarios` | manifest set for the revise/escalate routing scenario suite |

(`ux-designer-chain` was a 3-turn demo — PO seed → mock spec-author → LIVE ux-designer — and is now
a uniform 2-turn `seed → live` role chain in `ROLE_CHAINS`; see the design-lane table + the run log.)

## The gates a live sweep applies (per candidate)

1. **Conformance** (`gatePassed`): the output validator passes + the turn terminated clean. This is
   *structural* — it does NOT judge coverage/quality.
2. **Quality / discriminator** (`qualityPassed`, opus judge vs the recorded baseline): the produced
   artifact is functionally equivalent to (not thinner than) the recorded reference. Skipped when no
   reference is on disk — so a missing reference silently degrades to conformance-only. **A sweep
   whose quality gate is OFF (or whose reference is a different scope than the produced artifact) is
   measuring the wrong thing** (see the pack-fidelity audit).

## ⚠ Pack-fidelity audit (2026-08-04) — READ BEFORE SWEEPING

A sweep is only valid if (a) the chain pre-conditions the turn like production, and (b) the
quality-gate reference is the SAME SCOPE as what the turn is given the inputs to produce. Findings:

| Chain | Real-drive read-set | Chain pack | Verdict |
|---|---|---|---|
| spec-author-propose | product-overview + nfrs | ✓ both | **faithful** |
| architect-estimator | the candidate proposals | ✓ feature-proposals | **faithful** |
| spec-author-story | product-overview + this story's stub | ✓ both | **faithful** |
| architect-reviewer | nfrs + **ALL** the story's AC ids + conventions | nfrs + **AC1 only** | ⚠ under-scoped ACs (annotates 1 of 3) |
| dba | architecture + **ALL** the story's AC ids + the architect contract | architecture, **0 ACs** | ⚠ no ACs (works mostly off architecture.json) |
| test-strategist | **all** story AC ids inline + persistence-invariant list | S1 AC1+AC2+AC3 + arch + db-design | **FIXED** (was: 1 AC scored vs the 32-item/3-story master). Per-story: seeds all S1 ACs, scored vs the S1 slice. |
| ux-designer | design-brief + product-overview | ✓ both | **faithful** (2-turn chain; scored vs `intake/design/design-guide.json`) |
| navigator-red / navigator-assess | (build lane, pre-conditions declared) | context-pack / gf-advisory | **faithful** (live-proven) |

**test-strategist is a hard blocker for #556.** The recorded reference `intake/.../test-list.json`
is the whole feature master (32 test items, 10 ACs, 3 stories); the chain seeds one story's one AC.
Every candidate would score "thin" for a *scope* reason, not a model-quality reason — repeating the
#554 mistake in a new form. Decision (user): fix **per-story** — seed all of S1's ACs (AC1+AC2+AC3),
score against the **S1 slice** of the master (the ~17 test items whose `ac_id` ∈ S1's ACs), matching the real
drive's per-story invocation unit. The under-scoped architect-reviewer / dba chains are noted for a
follow-up; they are not the #556 blocker.

## Run log

_Results of live runs are appended here as we perform them (date, chain, candidates, gate outcomes,
wall-clock, winner). Telemetry + preserved artifacts land under `.role-telemetry/sweep-<role>/`._

### 2026-08-04 — test-strategist sweep (#556): PRE-FLIGHT HALTED (scope)
Pack-fidelity audit (above) found the test-strategist chain scored against a wrong-scope reference.
Sweep NOT run; fixing the per-story scope first. (The earlier #554 sweep — 626s→190s on m-haiku — is
INVALID as a decision gate: conformance-only, `semanticScore: null` on every candidate, artifacts not
preserved; see `../../consort/orchestrator/build/PRODUCTION-IMPROVEMENTS-PLAN.md`.)

### 2026-08-04 — test-strategist sweep (#556, attempt 2): HALTED MID-RUN + HARNESS BUG FOUND
Launched with the per-story scope fix. First two candidates completed (baseline 778.5s, m-haiku
118.3s) BUT both logged "gate PASSED" with NO quality suffix, and their persisted trials had
`semanticScore: null`, `qualityPassed` absent, `artifacts: []`. Root cause (a harness bug, not a
scope issue): the quality gate keys on `producedArtifacts[chain.outputFile]`, but `producedArtifacts`
is the **`.sftdd`-only snapshot** — a design role writes its output at the WORKSPACE ROOT
(`features/…`, `planning/…`, `design/…`), so the produced file was NEVER captured, the gate SILENTLY
SKIPPED, and nothing was preserved. **This means the quality gate had never fired for ANY design-role
sweep** (it landed in #555 but was never reachable), so #554's result was doubly invalid.
Fix: `runRoleChainLive` now passes `extraSnapshotRoots = SNAPSHOT_ROOTS` (`features`/`planning`/`design`)
so the produced artifact lands in `producedArtifacts` keyed by its `outputFile`; a hermetic guard
asserts every chain's `outputFile` is under a snapshot root (so this can't regress). Sweep will be
re-launched after the dist rebuild.

### 2026-08-04 — test-strategist sweep (#556, attempt 3): COMPLETE — WINNER e-low (sonnet, effort=low)
Re-launched after the snapshot-root fix. Quality gate confirmed FIRING (contrast attempts 1-2):
each candidate carries a real `semanticScore` + its produced `test-list.json` is preserved under
`.role-telemetry/sweep-test-strategist-20260805015529/<candidate>/artifacts/`.

ALL 8 candidates COMPLETE, enumerated from persisted telemetry (score + test-item count + wall-clock
+ cost). Evidence per candidate under `.role-telemetry/sweep-test-strategist-20260805015529/<c>/`.

Each row's "test items" = the number of entries the strategist PLANNED in its test-list (a test item
is a PLAN for a test, not an executable test: id, description, the ac_id it covers, kind ∈
behavior|fitness|client, + invariant_id for the DB-real ones). More test items ⇒ more of the required
AC + persistence-invariant coverage planned.

| # | candidate | levers | quality | score | test items | wall-clock | cost |
|---|---|---|---|---|---|---|---|
| 1 | baseline | sonnet, default effort | ✅ PASS | 0.85 | 15 | 679.9s | $0.64 |
| 2 | m-haiku | model=haiku | ❌ FAIL | 0.70 | 12 | 120.9s | $0.09 |
| 3 | m-opus | model=opus | ✅ PASS | 0.85 | 16 | 115.9s | $0.29 |
| 4 | **e-low** ⭐ | effort=low (sonnet) | ✅ PASS | **0.90** | 16 | **71.5s** | **$0.22** |
| 5 | e-medium | effort=medium (sonnet) | ✅ PASS | 0.80 | 15 | 346.5s | $0.42 |
| 6 | m-haiku-e-low | haiku + low | ✅ PASS | 0.75 | 12 | 106.1s | $0.09 |
| 7 | m-opus-e-low | opus + low | ❌ FAIL | 0.72 | 13 | 41.9s | $0.26 |
| 8 | scan-tight | deny Grep/Glob | ✅ PASS | 0.82 | 15 | 547.0s | $0.67 |

**WINNER: e-low** (sonnet, `effort=low`) — the sweep ranks by wall-clock AMONG QUALITY-HOLDERS only,
and rejects sub-baseline candidates. e-low: **−89% wall (71.5s vs 679.9s), −$0.42, quality 0.90
(above baseline 0.85)**. Rejected: m-haiku (0.70), m-opus-e-low (0.72) — quality below baseline.

Gate threshold = 0.75 (functional). Reading (**single sample each**):
- **Same-model variance baseline:** the recorded REFERENCE (sonnet) has 17 test items; this run's
  fresh baseline (also sonnet, default effort) produced 15 and scored 0.85. So a fresh sonnet run
  does NOT reproduce the reference exactly — the same-model noise floor is ≈±2 test items, and
  "sonnet-equivalent quality" is ≈0.85-0.90, NOT 1.0. Read every score against that floor.
- **e-low is the robust winner**: 0.90 / 16 test items / 71.5s — at-or-above sonnet-baseline coverage
  AND ~9.5× faster. It sits CLEAR of the noise band, so this is a real signal: effort=low on sonnet
  is the load-bearing lever.
- **The two FAILs are borderline-thin, and the pass/fail line is WITHIN judge noise.** m-haiku (0.70,
  12 items) and m-opus-e-low (0.72, 13 items) planned fewer items than the reference's 17 (thinner
  AC coverage) — that thinness is real. BUT the pass/fail boundary at 0.72-0.75 is a coin-flip:
  m-haiku (FAIL 0.70) and m-haiku-e-low (PASS 0.75) produced STRUCTURALLY IDENTICAL 12-item lists
  (same kinds 3+9, same AC split 8/1/3, same 5 invariants) — only the DESCRIPTIONS are re-worded, and
  they describe the SAME 12 tests. So that 0.70-vs-0.75 split is opus-judge NON-DETERMINISM on
  equivalent artifacts, not a coverage difference. Do NOT over-read a single borderline score.
- **Methodological note:** with n=1 per candidate and a ±0.05 judge swing at the boundary, the top of
  the ranking (e-low) is trustworthy but the borderline pass/fails are not. Borderline candidates
  (0.70-0.75) need 2-3 repeats to average out judge noise before any verdict; the preserved
  artifacts + replay.json make that cheap. Count is a coarse proxy anyway — the opus judge scores
  coverage/faithfulness vs the reference, not the count.
- So #554's "m-haiku 70% faster, gate-passed" was doubly wrong: m-haiku actually FAILS quality here
  (0.70, thin), and the real speed-without-quality-loss win is **effort=low on sonnet**, invisible to
  a conformance-only sweep.

DECISION (test-strategist supervisor/analyst split): **PREMATURE — do not build it (on this
evidence).** The gating question (per PRODUCTION-IMPROVEMENTS-PLAN.md) was "is the split worth it vs
the model lever?" The quality-gated sweep answers it: a single cheap lever — **sonnet `effort=low`**
— already collapses the output-bound test-strategist turn **~9.5× (679.9s → 71.5s, −$0.42) while
IMPROVING quality (0.90 vs baseline 0.85, 16 vs 15 test items)**, with zero new machinery. The
supervisor/analyst decomposition would add real complexity (per-kind analysts, a merge/coverage
supervisor, id-space coordination) to chase a speedup the effort lever already delivers without it.
So: apply `effort=low` to the shipped test-strategist turn; shelve the split unless a future need
(e.g. a feature far larger than F1's 17-item master, where even a fast single turn overflows) revives
it. Caveat: n=1 per candidate; the WINNER (e-low) is clear of the noise floor, but the exact
speedup would firm up with a 2-3× repeat of e-low + baseline.

### 2026-08-04 — relocated the per-role optimize harness under tests/optimization/ (#575, DONE)
Ownership model (settled with the user):
- **The recorded corpora are REGRESSION fixtures first.** The canonical, complete copies live in
  `examples/sftdd-scenarios/*` (stockflow-rerecord etc.). Their primary job: a full **agents-off
  replay** that confirms scaffolding, PR/merge, and the orchestrator's replay path are not broken
  (no agent doing real work). That standing regression test does not exist yet (only hermetic
  integrity guards + the manual `replay-scenario.sh`) — filed as **#574**. `examples/sftdd-scenarios/`
  is the source of truth and stays put.
- **The optimize harness is a secondary consumer that CHERRY-PICKS COPIES.** Its fixtures are
  elements picked out of the corpora and COPIED into what the isolated single-turn perf-tuning tests
  need — self-contained copies by design (so the isolated tests don't depend on the moving corpus).
  A copy is the correct end state: NO drift guard, NO provenance link back to source.
- **The per-role optimize machinery is INTERNAL agent perf-tuning tooling**, not shipped product
  (the shipped drive-optimize bins `lakebase-sftdd-optimize`/`-apply` are separate and do NOT import
  it). Note: `consort/` source isn't in the npm package at all (`files:` ships dist/scripts/skills/
  templates), so the real "unship" lever was the CLI **bin**, not the source location.

What actually moved (a code trace corrected the original blanket plan):
- **Moved to `tests/optimization/`** (the harness-ONLY files): `role-levers.ts`, `role-sweep.ts`,
  `role-sweep-report.ts` (from `consort/optimize/`), `optimize-role.cli.ts` (from
  `scripts/sftdd/`), and this README.
- **UNSHIPPED** `lakebase-sftdd-optimize-role` from `package.json` bin. It is still built to
  `dist/tests/optimization/optimize-role.cli.js` (a tsup entry, NOT a bin) purely so
  `scripts/optimize-role.sh` can run the CJS build (the shared schema-loader needs `__dirname`).
- **LEFT IN PLACE** (shared or production, NOT harness-only):
  - `consort/optimize/role-chains.ts` + `role-telemetry.ts` — imported by the
    per-role LIVE + hermetic **integration** tests (`tests/integration/{live,hermetic}`), not just
    the sweep.
  - `consort/optimize/build-role-chains.ts` — **production**: `build-context.ts`
    (→ `orchestrator-effects.ts`, the live drive) imports it to inject the SAME context pack.
  - `consort/optimize/evaluation/fixtures/` + `tests/integration/{intake,manifests}` —
    the fixture-path constants (`INTAKE_REL`, `BUILD_MANIFESTS_REL`, `BUILD_CORPUS_REL`) live in the
    STAYING files and serve the integration tests too; moving them would make a staying/production
    file reach into `tests/optimization/`. They stay where every consumer already points.
- `examples/sftdd-scenarios/` (the regression corpus) is untouched.

### 2026-08-04 — ux-designer added as a role chain
Restructured `ux-designer-chain` from a 3-turn demo (PO → mock spec-author → live ux-designer) to the
uniform 2-turn `seed → live` shape, and added it to `ROLE_CHAINS`. Its real-drive read-set is the
design-brief + product-overview (dropped the demo's `feature-spec` input). Quality-gate reference:
`intake/design/design-guide.json`, copied from the byte-identical stockflow scenario's recorded
`design-guide.json` (the intake brief/overview/nfrs all come from stockflow). Passes
`designGuideConformant`. Full suite 2849 green.
