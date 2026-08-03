#!/usr/bin/env bash
# Archive one role's champion-walk results out of the throwaway project (which is
# destroyed at teardown) into the persistent, committable results dir so the full
# lever sweep accumulates across every role, start to end.
#
# For a role handoff it copies:
#   - every candidate's per-trial result.json (gatePassed/durationMs/costUsd/tokens)
#   - the champion-walk.json winner record
#   - the printed report table (from the run log), as report.md
#   - a summary.json (winner + per-candidate median + gate) computed here
#
# Usage:
#   archive-optimize-results.sh --handoff <id> --project-dir <dir> [--log <path>] [--results-dir <dir>]
# Exit: 0 ok; 2 bad args.
set -euo pipefail

HANDOFF=""
PROJECT_DIR=""
LOG=""
RESULTS_DIR=""
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --handoff) HANDOFF="$2"; shift 2 ;;
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --log) LOG="$2"; shift 2 ;;
    --results-dir) RESULTS_DIR="$2"; shift 2 ;;
    *) echo "archive-optimize-results: unknown arg '$1'" >&2; exit 2 ;;
  esac
done

[[ -n "$HANDOFF" ]] || { echo "archive-optimize-results: --handoff required" >&2; exit 2; }
[[ -n "$PROJECT_DIR" ]] || { echo "archive-optimize-results: --project-dir required" >&2; exit 2; }
RESULTS_DIR="${RESULTS_DIR:-${ROOT}/optimize-results}"

SRC="${PROJECT_DIR}/experiments/${HANDOFF}"
[[ -d "$SRC" ]] || { echo "archive-optimize-results: no experiments dir at ${SRC}" >&2; exit 2; }

DEST="${RESULTS_DIR}/${HANDOFF}"
mkdir -p "$DEST"

# 1. per-candidate trial results + champion-walk.json (verbatim copy).
cp -R "$SRC/." "$DEST/"
# champion-walk.json lives one level up (experiments/champion-walk.json), copy if present.
[[ -f "${PROJECT_DIR}/experiments/champion-walk.json" ]] && cp "${PROJECT_DIR}/experiments/champion-walk.json" "$DEST/champion-walk.json"

# 2. the report table from the run log, if given.
if [[ -n "$LOG" && -f "$LOG" ]]; then
  sed -n '/# Champion-walk optimization report/,/^$/p' "$LOG" > "$DEST/report.md" || true
fi

# 3. a computed summary.json (per-candidate median ms + gate + winner).
node -e '
const fs = require("fs"), path = require("path");
const src = process.argv[1];
const cands = fs.readdirSync(src).filter((d) => {
  const p = path.join(src, d);
  return fs.statSync(p).isDirectory() && fs.readdirSync(p).some((f) => f.startsWith("trial-"));
});
const median = (xs) => { if (!xs.length) return null; const s=[...xs].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; };
const rows = cands.map((c) => {
  const cdir = path.join(src, c);
  const trials = fs.readdirSync(cdir).filter((f) => f.startsWith("trial-")).map((t) => {
    try { return JSON.parse(fs.readFileSync(path.join(cdir, t, "result.json"), "utf8")); } catch { return null; }
  }).filter(Boolean);
  const passing = trials.filter((t) => t.gatePassed);
  return {
    candidate: c,
    trials: trials.length,
    gatePassed: trials.length > 0 && trials.every((t) => t.gatePassed),
    medianMs: median(passing.map((t) => t.durationMs)),
    medianCostUsd: median(passing.map((t) => t.costUsd)),
  };
});
const qualified = rows.filter((r) => r.gatePassed && r.medianMs != null).sort((a,b) => a.medianMs - b.medianMs);
const winner = qualified[0]?.candidate ?? null;
const summary = { handoff: process.argv[2], winner, capturedAt: new Date().toISOString(), candidates: rows };
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
' "$DEST" "$HANDOFF" > "$DEST/summary.json"

echo "[archive] ${HANDOFF}: results -> ${DEST}" >&2
echo "[archive] winner: $(node -e 'console.log(require(process.argv[1]).winner)' "$DEST/summary.json")" >&2
