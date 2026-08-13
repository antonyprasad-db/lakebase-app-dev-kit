#!/usr/bin/env bash
# ⚠️ DEPRECATED (moved to deprecated/ on 2026-08-07) , do NOT use for new sweeps.
# This is the shell wrapper for the CHAMPION-WALK bin (consort-optimize), which ranks candidates on
# the fastest gate-passing turn and does NOT run a mandatory LLM judge on every candidate. That
# violates the standing evaluation invariant (every candidate judged vs the recorded reference +
# output preserved). The sanctioned launcher is `scripts/optimize-role.sh` (the ONE judged sweep
# engine). Kept here for provenance until the champion-walk stack is removed.
#
# Run a per-handoff optimization sweep (the champion walk) against a scenario's
# feature: at the handoff the drive is currently positioned on, try config +
# content/scope candidates, keep the FASTEST gate-passing turn, and emit a
# before/after report. Only the WINNER survives in the recorded corpus; every
# discarded attempt lands under <project>/experiments/.
#
# This is the "optimize" sibling of capture-scenario.sh: same kit-single-source
# pinning (no split-brain), same recorder env, same teardown discipline. It is a
# thin wrapper around the kit optimize bin (consort-optimize), which drives
# the champion walk via optimize-harness + optimize-live.
#
# Usage:
#   # Optimize the handoff the drive is positioned on (advance the drive first with
#   # consort-drive, or --pause-before, to reach the target build turn):
#   optimize-scenario.sh --scenario <name> --project-dir <dir> --feature <id> \
#     --candidates '<sweep-spec>' [--trials N] [--only design|build] [--dry-run] \
#     [--propose-only]
#
# Review + persist flow (recommended): run with --propose-only so the sweep ranks
# every candidate + writes <project>/experiments/<handoff>/ but records NO winner.
# Inspect the printed report + experiments tree, then persist your chosen winner so
# the NEXT invocation of that role uses it:
#   consort-optimize-apply --project-dir <dir> --handoff <id> --candidate <id>
# That applies the winner's agent-.md levers (prompt / tool scope / directive) to
# skills/consort/agents/<role>.md directly, and PRINTS any typed-source default
# edits (model/effort/scope/loop) for a reviewed change. Kit edits are LOCAL;
# pushing them to consumers is a separate gated step.
#
# Sweep spec grammar (see optimize.cli parseSweepSpec), ';'-separated dimensions:
#   driver.green.model=haiku,sonnet         per-turn model tiering
#   navigator.review.effort=low,medium      per-turn effort
#   build.sessionScope=story,cycle          session warmth (scope)
#   build.loopGranularity=story,ac          loop granularity
#   env.CONTEXT_FREE_FRACTION=0.3,0.5        session warmth (fraction)
#
# Env: DATABRICKS_HOST, DATABRICKS_CONFIG_PROFILE (build turns are LIVE CLOUD:
#      real OAuth + self-hosted runner + Lakebase child branches). Design-handoff
#      sweeps are hermetic (no cloud). Do NOT set LAKEBASE_KIT_DIR (split-brain);
#      the script pins ONE dev ref for everyone. NEVER set
#      LAKEBASE_SFTDD_REPLAY_BUILD_DIR (it would fake GREEN).
# Exit: 0 ok; 2 bad args.
#
# SAFETY: the harness only forks/drops throwaway child branches, NEVER pushes,
# merges, or releases. Every build trial runs the REAL honest-GREEN verifier.
# TEAR DOWN every per-candidate Lakebase branch + the standing project when done
# (the drive's own teardown path); the sweep leaves the project standing so the
# winner corpus can be finalized.
set -euo pipefail

# NOTE: this script now lives in deprecated/ (one level below examples/replay/), but its scenario
# dirs, lib/pin-local-kit.sh, and KIT_ROOT (../.. from here) all still live under examples/replay/.
# Resolve SCEN_DIR_ROOT to the PARENT examples/replay/ dir so every downstream path is unchanged.
SCEN_DIR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCENARIO=""
PROJECT_DIR=""
FEATURE=""
CANDIDATES=""
TRIALS="3"
ONLY=""
DRY_RUN=""
PROPOSE_ONLY=""
SWEEP_LANE=""
FROM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario) SCENARIO="$2"; shift 2 ;;
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --feature) FEATURE="$2"; shift 2 ;;
    --candidates) CANDIDATES="$2"; shift 2 ;;
    --trials) TRIALS="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    --sweep-lane) SWEEP_LANE="$2"; shift 2 ;;
    --from) FROM="$2"; shift 2 ;;
    --dry-run) DRY_RUN="1"; shift ;;
    --propose-only) PROPOSE_ONLY="1"; shift ;;
    *) echo "optimize-scenario: unknown arg '$1'" >&2; exit 2 ;;
  esac
done

[[ -n "$SCENARIO" ]] || { echo "optimize-scenario: --scenario is required" >&2; exit 2; }
[[ -n "$PROJECT_DIR" ]] || { echo "optimize-scenario: --project-dir is required" >&2; exit 2; }
[[ -n "$FEATURE" ]] || { echo "optimize-scenario: --feature is required" >&2; exit 2; }

SCEN="${SCEN_DIR_ROOT}/${SCENARIO}"

# ── Single-source kit resolution (identical discipline to capture-scenario.sh) ──
source "${SCEN_DIR_ROOT}/lib/pin-local-kit.sh"
KIT_ROOT="$(cd "${SCEN_DIR_ROOT}/../.." && pwd)"
CAPTURE_KIT_REF="${CAPTURE_KIT_REF:-$LOCAL_KIT_REF_DEFAULT}"

if [[ -n "${LAKEBASE_KIT_DIR:-}" ]]; then
  echo "optimize-scenario: refuse to run with LAKEBASE_KIT_DIR set (split-brain: it redirects only the orchestrator, not the claude -p agents). Unset it; this script pins ref '${CAPTURE_KIT_REF}' for everyone." >&2
  exit 2
fi
if [[ -n "${LAKEBASE_SFTDD_REPLAY_BUILD_DIR:-}" ]]; then
  echo "optimize-scenario: refuse to run with LAKEBASE_SFTDD_REPLAY_BUILD_DIR set , it swaps in the trust-verifier and would FAKE a GREEN. Every trial must run the real honest-GREEN verifier." >&2
  exit 2
fi

pin_local_kit_cache "$KIT_ROOT" "$CAPTURE_KIT_REF" || exit 2
export LAKEBASE_KIT_REF="$CAPTURE_KIT_REF"
echo "[optimize-scenario] kit pinned , ref '${CAPTURE_KIT_REF}' -> ${KIT_ROOT}" >&2

PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"
record_local_kit_hint "$PROJECT_DIR" "$KIT_ROOT" "$CAPTURE_KIT_REF"
want="$(cd "$KIT_ROOT" && pwd -P)"
got="$("$PROJECT_DIR/scripts/lk" lakebase-resolve-consort-dir --project-dir "$PROJECT_DIR" >/dev/null 2>&1 && cd "$KIT_ROOT" && pwd -P || true)"
[[ "$want" == "$got" || -z "$got" ]] || { echo "optimize-scenario: kit resolution drift; aborting." >&2; exit 2; }

# The surviving WINNER turns record into the scenario corpus, exactly like a
# capture (turns/ + recorded-artifacts/ + recorded-build/); discarded attempts go
# to <project>/experiments/ (written by optimize-live, never into the corpus).
# RECORD_DIR is passed to the optimize CLI, which reads it ONCE, CLEARS it from the
# ambient env, and re-sets it ONLY for the winner capture (makeLiveSpawnTurn's
# record flag). This is why a losing candidate's trial never records into the
# shippable corpus even though the same corpus dir is the record target: trials run
# with the recorder env unset. (Design-lane sweeps produce no recorded-build/.)
mkdir -p "$SCEN"
export LAKEBASE_CONSORT_RECORD_DIR="$SCEN"
export LAKEBASE_CONSORT_RECORD_BUILD_DIR="${SCEN}/recorded-build"

cd "$PROJECT_DIR"
lk() { "$PROJECT_DIR/scripts/lk" "$@"; }

dry_args=(); [[ -n "$DRY_RUN" ]] && dry_args=( --dry-run )
only_args=(); [[ -n "$ONLY" ]] && only_args=( --only "$ONLY" )
propose_args=(); [[ -n "$PROPOSE_ONLY" ]] && propose_args=( --propose-only )
# --sweep-lane uses per-role default candidates, so --candidates is optional there.
lane_args=(); [[ -n "$SWEEP_LANE" ]] && lane_args=( --sweep-lane "$SWEEP_LANE" )
from_args=(); [[ -n "$FROM" ]] && from_args=( --from "$FROM" )
cand_args=(); [[ -n "$CANDIDATES" ]] && cand_args=( --candidates "$CANDIDATES" )

if [[ -n "$SWEEP_LANE" ]]; then
  echo "[optimize-scenario] sweeping the ENTIRE '${SWEEP_LANE}' lane of ${FEATURE} (trials=${TRIALS}, per-role default candidates)" >&2
else
  echo "[optimize-scenario] sweeping the next handoff of ${FEATURE} (trials=${TRIALS}) with candidates: ${CANDIDATES}" >&2
fi
lk consort-optimize \
  --scenario "$SCENARIO" \
  --feature "$FEATURE" \
  --project-dir "$PROJECT_DIR" \
  --trials "$TRIALS" \
  ${cand_args[@]+"${cand_args[@]}"} \
  ${lane_args[@]+"${lane_args[@]}"} \
  ${from_args[@]+"${from_args[@]}"} \
  ${only_args[@]+"${only_args[@]}"} \
  ${propose_args[@]+"${propose_args[@]}"} \
  ${dry_args[@]+"${dry_args[@]}"}

echo "[optimize-scenario] done. Winner recorded into ${SCEN}; discarded attempts under ${PROJECT_DIR}/experiments/." >&2
echo "[optimize-scenario] REMEMBER to tear down the standing project + any per-candidate Lakebase branches when the corpus is finalized." >&2
