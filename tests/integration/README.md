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
| `test-strategist-chain` | test-strategist | `test-list.json` | AC1 + architecture + db-design |

### Build lane (navigator; run live via `live/navigator-*-live.test.ts`, not in `ROLE_CHAINS`)
| Chain (dir) | Live role | Output | Pre-condition (declared) |
|---|---|---|---|
| `navigator-red-chain` | navigator (RED, S3) | `tests/` tree | `context-pack` |
| `navigator-assess-chain` | navigator (ASSESS, S1) | assess marker | `green-failure-advisory` |

### Not a role chain
| Dir | Purpose |
|---|---|
| `ux-designer-chain` | 3-turn chain (PO seed → mock spec-author → LIVE ux-designer); a chain-runner demo, not swept |
| `route-scenarios` | manifest set for the revise/escalate routing scenario suite |

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
| **test-strategist** | **all** story AC ids inline + persistence-invariant list | **1 AC**, 1 story | ❌ **BLOCKER**: scored vs the **32-item, 3-story** feature master it lacks the inputs to produce |
| navigator-red / navigator-assess | (build lane, pre-conditions declared) | context-pack / gf-advisory | **faithful** (live-proven) |

**test-strategist is a hard blocker for #556.** The recorded reference `intake/.../test-list.json`
is the whole feature master (32 items, 10 ACs, 3 stories); the chain seeds one story's one AC. Every
candidate would score "thin" for a *scope* reason, not a model-quality reason — repeating the #554
mistake in a new form. Decision (user): fix **per-story** — seed all of S1's ACs (AC1+AC2+AC3), score
against the **S1 slice** of the master (the ~17 items whose `ac_id` ∈ S1's ACs), matching the real
drive's per-story invocation unit. The under-scoped architect-reviewer / dba chains are noted for a
follow-up; they are not the #556 blocker.

## Run log

_Results of live runs are appended here as we perform them (date, chain, candidates, gate outcomes,
wall-clock, winner). Telemetry + preserved artifacts land under `.role-telemetry/sweep-<role>/`._

### 2026-08-04 — test-strategist sweep (#556): PRE-FLIGHT HALTED
Pack-fidelity audit (above) found the test-strategist chain scored against a wrong-scope reference.
Sweep NOT run; fixing the per-story scope first. (The earlier #554 sweep — 626s→190s on m-haiku — is
INVALID as a decision gate: conformance-only, `semanticScore: null` on every candidate, artifacts not
preserved; see `../../consort/orchestrator/build/PRODUCTION-IMPROVEMENTS-PLAN.md`.)
