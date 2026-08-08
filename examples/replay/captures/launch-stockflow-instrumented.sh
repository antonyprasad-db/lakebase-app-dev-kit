#!/usr/bin/env bash
# Launch the instrumented live re-record of stockflow-rerecord (F1 -> F6), recording EVERY turn +
# the routing-decisions.jsonl diagnostic stream, to a NEW capture dir. One-shot; auto-continues the
# navigator pause so it runs unattended. Env is prepared here (the capture engine requires
# DATABRICKS_HOST + GITHUB_OWNER EXPORTED; _replay-smoke.sh does not source the test config itself).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

STAMP="${STAMP:-$(date +%Y%m%d-%H%M%S)}"
REC="$REPO_ROOT/examples/replay/captures/stockflow-instrumented-$STAMP"
SCEN="$REPO_ROOT/examples/replay/corpora/stockflow-rerecord"
CORPUS="$SCEN/recorded-artifacts"
FEATURE="${FEATURE:-F1-stock-visibility}"
# CRITICAL: --corpus only sets CORPUS_DIR (the recorded design/build artifacts). INTAKE is a
# SEPARATE dir resolved from REPLAY_INTAKE_DIR (defaults to bug-tracker!), which replay-scenario.sh
# exports as "${SCEN}/intake". Omitting it makes intake stage bug-tracker's product-overview/nfrs,
# which the spec-author breakdown then fails to reconcile ("missing input nfrs"). Point it at the
# scenario's own intake dir. (This is the launcher bug that killed the first live capture.)
export REPLAY_INTAKE_DIR="$SCEN/intake"
mkdir -p "$REC"

# --- env prep (mirror replay-stockflow-rerecord.sh: source config, resolve host from profile) ---
[[ -f "$REPO_ROOT/.env.template.test.config" ]] && . "$REPO_ROOT/.env.template.test.config"
[[ -f "$REPO_ROOT/.env.local.test.config" ]] || { echo "MISSING .env.local.test.config" >&2; exit 1; }
. "$REPO_ROOT/.env.local.test.config"
PROFILE="${DATABRICKS_CONFIG_PROFILE:-}"
if [[ -z "${DATABRICKS_HOST:-}" ]]; then
  [[ -n "$PROFILE" ]] || { echo "set DATABRICKS_CONFIG_PROFILE or DATABRICKS_HOST" >&2; exit 1; }
  RAW="$(databricks auth describe --profile "$PROFILE" -o json 2>&1 || true)"
  DATABRICKS_HOST="$(printf '%s\n' "$RAW" | python3 -c "import json,sys; t=sys.stdin.read(); s=t.find('{'); print('' if s<0 else (json.loads(t[s:]).get('details') or {}).get('host','').rstrip('/'))" 2>/dev/null || echo "")"
fi
[[ -n "$DATABRICKS_HOST" ]] || { echo "could not resolve DATABRICKS_HOST from profile '$PROFILE'" >&2; exit 1; }
export DATABRICKS_HOST DATABRICKS_CONFIG_PROFILE="$PROFILE"
export GITHUB_OWNER="${GITHUB_OWNER:-${LAKEBASE_TEST_GITHUB_OWNER:-}}"
[[ -n "$GITHUB_OWNER" ]] || { echo "set LAKEBASE_TEST_GITHUB_OWNER" >&2; exit 1; }

# --- recording + unattended resume ---
export LAKEBASE_CONSORT_RECORD_DIR="$REC"
export LAKEBASE_SFTDD_AUTO_CONTINUE=1   # auto-confirm the navigator pause (line 241 _replay-smoke.sh)

echo "[launch] record dir : $REC"
echo "[launch] corpus     : $CORPUS  feature=$FEATURE"
echo "[launch] host       : $DATABRICKS_HOST  owner=$GITHUB_OWNER  profile=$PROFILE"

# --sprint runs the PLANNING lane so the human-proxy supplies the feature-request THROUGH the
# author-requests turn (the PO stand-in answering the orchestrator's ask, via SPRINT_REQUESTS),
# IDENTICAL to the interactive path , instead of the bare-cp side-channel that skipped it. Without
# --sprint, planning is skipped, feature-request is injected out-of-band, and the automated path
# diverges from interactive. stockflow-rerecord-s1 is the sprint that ships F1-stock-visibility.
exec bash "$REPO_ROOT/examples/replay/run-capture.sh" \
  --tiers 2 \
  --corpus "$CORPUS" \
  --feature "$FEATURE" \
  --sprint stockflow-rerecord-s1 \
  --project-name "stockflow-instrumented-$STAMP"
