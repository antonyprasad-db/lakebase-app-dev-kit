#!/usr/bin/env bash
# ONE door to run an optimize EXPERIMENT across the levers + models, end to end.
#
# Sweeps the legitimate role-turn chains of a feature (the design lane by default:
# spec-author -> architect -> dba -> test-strategist -> ux-designer, per story),
# champion-walking EACH role across `defaultLaneCandidates` , baseline, every other
# model tier (opus/sonnet/haiku), each cheaper effort rung (low/medium), the
# model x effort cross at low, and a hard scan-tighten , keeping the FASTEST
# gate-passing turn, then ARCHIVES every swept handoff's results into the persistent
# optimize-results/ corpus (which survives the throwaway project's teardown).
#
# It composes three audited wrappers (no duplicate door):
#   1. capture-scenario.sh --no-drive   scaffold + stage + CLAIM (the sweep owns the drive)
#   2. optimize-scenario.sh --sweep-lane <lane> --propose-only   the champion walk
#   3. archive-optimize-results.sh      copy each handoff's experiments/ -> optimize-results/
#
# This is an EXPERIMENT run: propose-only (ranks + reports + writes experiments/,
# records NO winner into the kit). Persisting a winner to the kit is the separate,
# deliberate optimize-apply step (hint printed at the end).
#
# Usage:
#   # DEFAULT DOOR , lean chain sweep (NO scaffold, NO cloud): sweep the manifest turn-chains
#   # standalone against their recorded reference examples, candidates in parallel:
#   bash examples/replay/optimize-live-run.sh --chains design [--concurrency 3]
#   bash examples/replay/optimize-live-run.sh --chains spec-author-story,test-strategist
#   bash examples/replay/optimize-live-run.sh --chains design --dry-run   # plan only, no run
#
#   # SCAFFOLDED DRIVE path (back-compat) , fresh scaffold (needs a workspace + a GitHub owner):
#   DATABRICKS_CONFIG_PROFILE=<profile> \
#   bash examples/replay/optimize-live-run.sh \
#     --scenario stockflow-optimize --feature F1-stock-visibility \
#     --databricks-host <url> --github-owner <owner> [--trials 2]
#
#   # SCAFFOLDED DRIVE path , reuse an ALREADY-scaffolded + claimed project:
#   bash examples/replay/optimize-live-run.sh \
#     --scenario stockflow-optimize --feature F1-stock-visibility \
#     --project-dir <dir> [--sweep-lane design] [--trials 2]
#
# Options (lean chain-sweep path):
#   --chains <set|list>      SET ("design" = every design role chain) or comma list of chain handles;
#                            the LEAN default door (no scaffold/cloud). Design + navigator chains run
#                            lean; driver chains need Stage 4 + cloud.
#   --concurrency N          in-flight candidates across the sweep (default 3; each is its own mkdtemp).
#   --dry-run                print the chains + concurrency + command, run nothing (exit 0).
#   --results-dir <dir>      where per-chain evidence lands (default: examples/replay/optimize-results/).
#
# Options (scaffolded drive path):
#   --scenario <name>        (req) scenario dir under examples/replay/ (corpus target)
#   --feature <id>           (req) the feature to sweep
#   --project-dir <dir>      reuse an already-scaffolded + claimed project; omit to scaffold
#   --databricks-host <url>  required only when scaffolding
#   --github-owner <owner>   required only when scaffolding
#   --sweep-lane design|build   which lane's role turns to sweep (default: design).
#                            design is LEAN (no cloud); build is LIVE CLOUD (Lakebase
#                            child branches + honest-GREEN verify) , only when creds are set.
#   --trials N               trials per candidate (default: 2, matching the recorded corpus)
#   --candidates '<spec>'    escape hatch: sweep ONE next handoff with an explicit spec
#                            instead of the lane's per-role defaults (see optimize-scenario.sh
#                            grammar). Mutually exclusive with --sweep-lane.
#   --results-dir <dir>      where archives land (default: examples/replay/optimize-results)
#   --no-archive             sweep + report only; skip the archive step
#
# Env: DATABRICKS_CONFIG_PROFILE valid for the target workspace when scaffolding or
#      sweeping the build lane; port 8000 free; LAKEBASE_SFTDD_AUTO_CONTINUE=1
#      (headless). Do NOT set LAKEBASE_KIT_DIR or LAKEBASE_SFTDD_REPLAY_BUILD_DIR
#      (the inner wrappers refuse them , split-brain / faked-GREEN guards).
# Exit: 0 ok; 2 bad args.
#
# SAFETY: the harness only forks/drops throwaway child branches, NEVER pushes,
# merges, or releases. A fresh scaffold is left STANDING at the end (so the corpus
# can be finalized + a winner reviewed); teardown is a deliberate separate step
# (printed at the end).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_ROOT="$(cd "${ROOT}/../.." && pwd)"
SCENARIO=""
FEATURE=""
HOST=""
OWNER=""
PROJECT_DIR=""
SWEEP_LANE="design"
TRIALS="2"
CANDIDATES=""
RESULTS_DIR=""
NO_ARCHIVE=""
CHAINS=""
CONCURRENCY="3"
DRY_RUN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario) SCENARIO="$2"; shift 2 ;;
    --feature) FEATURE="$2"; shift 2 ;;
    --databricks-host) HOST="$2"; shift 2 ;;
    --github-owner) OWNER="$2"; shift 2 ;;
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --sweep-lane) SWEEP_LANE="$2"; shift 2 ;;
    --trials) TRIALS="$2"; shift 2 ;;
    --candidates) CANDIDATES="$2"; shift 2 ;;
    --results-dir) RESULTS_DIR="$2"; shift 2 ;;
    --no-archive) NO_ARCHIVE="1"; shift ;;
    --chains) CHAINS="$2"; shift 2 ;;
    --concurrency) CONCURRENCY="$2"; shift 2 ;;
    --dry-run) DRY_RUN="1"; shift ;;
    *) echo "optimize-live-run: unknown arg '$1'" >&2; exit 2 ;;
  esac
done

# ── LEAN CHAIN-SWEEP FAST PATH (the DEFAULT door) ───────────────────────────────
# --chains sweeps the manifest turn-chains STANDALONE against their recorded reference
# examples: NO scaffold, NO cloud, NO drive (each candidate is a mkdtemp workspace with
# in-memory levers). This is the whole optimize experiment for the design + navigator
# tiers , candidates fan out in parallel (--concurrency), each seeded + judged against
# its reference, results land directly in the committed corpus (--results-dir). The
# drive --sweep-lane path below is the back-compat scaffolded route (design + build).
if [[ -n "$CHAINS" ]]; then
  # Results land in the VISIBLE, git-tracked corpus examples/replay/optimize-results/runs/<stamp>/
  # (the CLI's own default , do NOT pass --telemetry-dir, so the CLI also picks the newest prior run
  # as the BASELINE and prints a per-chain delta). Runs accumulate under runs/; a summary.json per
  # chain makes them durable + diffable.
  if [[ -n "$DRY_RUN" ]]; then
    echo "[optimize-live-run] DRY RUN , lean chain sweep"
    echo "  chains       : ${CHAINS}"
    echo "  concurrency  : ${CONCURRENCY}"
    echo "  trials/cand  : (per-candidate single run; the chain sweep measures 1 trial per candidate)"
    echo "  results dir  : examples/replay/optimize-results/runs/<timestamp>/ (visible + committed; summary.json per chain)"
    echo "  baseline     : the newest prior run under runs/ (delta printed per chain)"
    echo "  command      : scripts/optimize-role.sh --chains ${CHAINS} --concurrency ${CONCURRENCY}"
    echo "  (design + navigator chains are LEAN , no scaffold, no cloud. driver chains need Stage 4 + cloud.)"
    exit 0
  fi
  echo "[optimize-live-run] lean chain sweep: chains='${CHAINS}' concurrency=${CONCURRENCY} -> examples/replay/optimize-results/runs/<timestamp>/" >&2
  # The ONE chain-sweep door (scripts/optimize-role.sh runs the built dist CLI). Every chain seeds +
  # judges against its recorded reference; the CLI writes per-chain summary.json + evidence + rollup.
  exec bash "${KIT_ROOT}/scripts/optimize-role.sh" --chains "$CHAINS" --concurrency "$CONCURRENCY"
fi

[[ -n "$SCENARIO" ]] || { echo "optimize-live-run: --scenario is required" >&2; exit 2; }
[[ -n "$FEATURE" ]] || { echo "optimize-live-run: --feature is required" >&2; exit 2; }
if [[ -n "$CANDIDATES" ]]; then
  # An explicit --candidates spec sweeps the ONE next handoff, so it cannot be combined
  # with a whole-lane sweep. optimize-scenario.sh drives a single-handoff walk then.
  SWEEP_LANE=""
elif [[ "$SWEEP_LANE" != "design" && "$SWEEP_LANE" != "build" ]]; then
  echo "optimize-live-run: --sweep-lane must be 'design' or 'build' (got '${SWEEP_LANE}')" >&2
  exit 2
fi
RESULTS_DIR="${RESULTS_DIR:-${ROOT}/optimize-results}"

# ── Step 1: reuse-or-scaffold the claimed project (the sweep owns the drive) ─────
# capture-scenario --no-drive creates the project, stages intake, and claims the
# feature, but does NOT drive, so the sweep below owns + experiments on every role
# turn. When --project-dir is given we reuse it as-is (must already be claimed).
if [[ -z "$PROJECT_DIR" ]]; then
  [[ -n "$HOST" ]] || { echo "optimize-live-run: --databricks-host required to scaffold (or pass --project-dir for an already-scaffolded+claimed project)" >&2; exit 2; }
  [[ -n "$OWNER" ]] || { echo "optimize-live-run: --github-owner required to scaffold" >&2; exit 2; }
  PROJECT_NAME="${SCENARIO}-opt-$(date +%Y%m%d-%H%M%S)"
  echo "[optimize-live-run] STEP 1/3: scaffold + stage + CLAIM ${FEATURE} (--no-drive; the sweep owns the drive), project ${PROJECT_NAME}" >&2
  LAKEBASE_SFTDD_AUTO_CONTINUE="${LAKEBASE_SFTDD_AUTO_CONTINUE:-1}" \
  bash "${ROOT}/capture-scenario.sh" \
    --scenario "$SCENARIO" --create --project-name "$PROJECT_NAME" \
    --databricks-host "$HOST" --github-owner "$OWNER" \
    --inputs-from "${ROOT}/${SCENARIO}" \
    --no-drive \
    --feature "$FEATURE"
  PROJECT_DIR="${CAPTURE_PARENT_DIR:-$HOME/code/tdd-workflow-smoke}/${PROJECT_NAME}"
else
  echo "[optimize-live-run] STEP 1/3: reusing already-scaffolded+claimed project ${PROJECT_DIR}" >&2
fi

[[ -d "$PROJECT_DIR/.git" ]] || { echo "optimize-live-run: expected scaffolded project at ${PROJECT_DIR}" >&2; exit 1; }
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"

# ── Step 2: run the champion-walk sweep across the levers + models ──────────────
# --sweep-lane walks every role handoff in the lane sequentially, champion-walking
# each with per-role defaultLaneCandidates (model + effort + model x effort + scan-
# tight), recording each winner locally before positioning the next (the design
# lane's inter-turn dependency). --propose-only ranks + reports + writes experiments/
# but records NO winner into the kit (this is an experiment; apply is separate).
# The full run log is teed so the archive step can lift the report table into report.md.
LOG="${PROJECT_DIR}/optimize-run.log"
sweep_args=( --scenario "$SCENARIO" --project-dir "$PROJECT_DIR" --feature "$FEATURE" --trials "$TRIALS" --propose-only )
if [[ -n "$SWEEP_LANE" ]]; then
  echo "[optimize-live-run] STEP 2/3: propose-only ${SWEEP_LANE}-lane sweep of ${FEATURE} (trials=${TRIALS}, levers+models per role)" >&2
  sweep_args+=( --sweep-lane "$SWEEP_LANE" )
else
  echo "[optimize-live-run] STEP 2/3: propose-only sweep of ${FEATURE}'s next handoff (trials=${TRIALS}) with candidates: ${CANDIDATES}" >&2
  sweep_args+=( --candidates "$CANDIDATES" )
fi
bash "${ROOT}/optimize-scenario.sh" "${sweep_args[@]}" 2>&1 | tee "$LOG"

# ── Step 3: archive every swept handoff's results into the persistent corpus ─────
# Each swept role wrote <project>/experiments/<handoff>/<candidate>/trial-N/. Archive
# copies each handoff (result.json + champion-walk.json if present) into RESULTS_DIR,
# lifts the report table into report.md, and computes summary.json (winner + medians).
# This is the step that survives the throwaway project's teardown.
if [[ -n "$NO_ARCHIVE" ]]; then
  echo "[optimize-live-run] STEP 3/3: --no-archive set , skipping archive (experiments under ${PROJECT_DIR}/experiments/)" >&2
else
  echo "[optimize-live-run] STEP 3/3: archiving swept handoffs -> ${RESULTS_DIR}" >&2
  archived=0
  for d in "${PROJECT_DIR}/experiments/"*/; do
    [[ -d "$d" ]] || continue
    h="$(basename "$d")"
    # A handoff dir holds candidate subdirs, each with trial-N/. Skip anything without them.
    compgen -G "${d}*/trial-*" >/dev/null 2>&1 || continue
    bash "${ROOT}/archive-optimize-results.sh" \
      --handoff "$h" --project-dir "$PROJECT_DIR" --log "$LOG" --results-dir "$RESULTS_DIR"
    archived=$((archived + 1))
  done
  echo "[optimize-live-run] archived ${archived} handoff(s) into ${RESULTS_DIR}" >&2
fi

cat >&2 <<EOF

[optimize-live-run] DONE (propose-only experiment). Next:
  - ranked report is in the run log: ${LOG}
  - per-candidate audit: ${PROJECT_DIR}/experiments/
  - archived corpus: ${RESULTS_DIR}/<handoff>/{summary.json,report.md,<candidate>/trial-N/result.json}
  - persist a winner so that role's next invocation uses it (SEPARATE, deliberate step):
      consort-optimize-apply --project-dir ${PROJECT_DIR} --handoff <id> --candidate <id>
  - TEAR DOWN when finished (a fresh scaffold was left standing; the harness never
    pushed/merged/released, only forked throwaway child branches during the sweep):
      (drop the project's Lakebase instance/branches + delete ${PROJECT_DIR})
EOF
