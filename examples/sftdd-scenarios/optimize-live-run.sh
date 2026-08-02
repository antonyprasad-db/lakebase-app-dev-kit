#!/usr/bin/env bash
# One-command LIVE optimization run (P1 + P3 + P4, first pass): scaffold a fresh
# project, drive the feature's DESIGN lane live (stopping cleanly at the build
# boundary), then run the per-handoff champion-walk sweep (propose-only) on the
# FIRST build role turn, and print the before/after report. Leaves the project
# standing so the winner can be reviewed + persisted (optimize-apply) and the
# corpus finalized; teardown is a deliberate, separate final step (see the end).
#
# This is a thin composition of two audited wrappers:
#   1. capture-scenario.sh --create ... --only design   (scaffold + live design lane)
#   2. optimize-scenario.sh --only build --propose-only  (sweep the first build turn)
#
# Usage:
#   LAKEBASE_SFTDD_AUTO_CONTINUE=1 DATABRICKS_CONFIG_PROFILE=<profile> \
#   bash examples/sftdd-scenarios/optimize-live-run.sh \
#     --scenario stockflow-optimize --feature F1-stock-visibility \
#     --databricks-host <url> --github-owner <owner> \
#     --candidates 'navigator.red.model=sonnet,haiku' [--trials 3]
#
# Env: DATABRICKS_CONFIG_PROFILE valid for the target workspace; port 8000 free;
#      LAKEBASE_SFTDD_AUTO_CONTINUE=1 (headless design lane). Do NOT set
#      LAKEBASE_KIT_DIR or LAKEBASE_SFTDD_REPLAY_BUILD_DIR (the wrappers refuse them).
# Exit: 0 ok; 2 bad args.
#
# SAFETY: LIVE CLOUD , scaffolds a real project + forks Lakebase child branches per
# candidate. The harness NEVER pushes/merges/releases. TEAR DOWN when done.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIO=""
FEATURE=""
HOST=""
OWNER=""
CANDIDATES=""
TRIALS="3"
PROJECT_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario) SCENARIO="$2"; shift 2 ;;
    --feature) FEATURE="$2"; shift 2 ;;
    --databricks-host) HOST="$2"; shift 2 ;;
    --github-owner) OWNER="$2"; shift 2 ;;
    --candidates) CANDIDATES="$2"; shift 2 ;;
    --trials) TRIALS="$2"; shift 2 ;;
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    *) echo "optimize-live-run: unknown arg '$1'" >&2; exit 2 ;;
  esac
done

[[ -n "$SCENARIO" ]] || { echo "optimize-live-run: --scenario is required" >&2; exit 2; }
[[ -n "$FEATURE" ]] || { echo "optimize-live-run: --feature is required" >&2; exit 2; }
# --candidates is OPTIONAL: the lane sweep uses per-role default candidates
# (defaultLaneCandidates). It is accepted only as an escape hatch and is currently
# unused by the lane-sweep path below.

# ── Step 1: scaffold + stage + CLAIM (no drive; the sweep owns the drive) ──
# capture-scenario --no-drive creates the project, stages intake, and claims the
# feature, but does NOT drive, so the lane sweep below owns + experiments on every
# design + build role turn. The scaffolded project dir is derived below.
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

# ── Step 2: sweep the ENTIRE DESIGN lane (propose-only) ────────────────────────
# --sweep-lane design walks every design role handoff sequentially (spec-author ->
# architect -> dba -> test-strategist -> ux-designer, per story), champion-walking
# each with per-role candidates (model + effort + a prompt/scope variant), and
# recording each winner before positioning the next (the design lane's inter-turn
# dependency). The reflect critic is baseline-only (not an authoring turn).
echo "[optimize-live-run] STEP 2/3: propose-only DESIGN-lane sweep of ${FEATURE}" >&2
bash "${ROOT}/optimize-scenario.sh" \
  --scenario "$SCENARIO" --project-dir "$PROJECT_DIR" --feature "$FEATURE" \
  --trials "$TRIALS" --sweep-lane design --propose-only

# ── Step 3: sweep the BUILD lane's turns (propose-only) ───────────────────────
# --sweep-lane build walks the build role turns (navigator RED / driver GREEN ...)
# once design is complete + the gate passed. (First pass focuses on the turns that
# are safe to reset without commit-preservation; see the harness notes.)
echo "[optimize-live-run] STEP 3/3: propose-only BUILD-lane sweep of ${FEATURE}" >&2
bash "${ROOT}/optimize-scenario.sh" \
  --scenario "$SCENARIO" --project-dir "$PROJECT_DIR" --feature "$FEATURE" \
  --trials "$TRIALS" --sweep-lane build --propose-only

cat >&2 <<EOF

[optimize-live-run] DONE (propose-only, design + build lanes). Review, then decide:
  - ranked report printed above; per-candidate audit in ${PROJECT_DIR}/experiments/
  - persist a winner so the role's next invocation uses it:
      lakebase-sftdd-optimize-apply --project-dir ${PROJECT_DIR} --handoff <id> --candidate <id>
  - TEAR DOWN when finished (this run left the project + its Lakebase branches standing):
      (drop the project's Lakebase instance/branches + delete ${PROJECT_DIR}; the harness
       never pushed/merged/released, only forked throwaway child branches during the sweep.)
EOF
