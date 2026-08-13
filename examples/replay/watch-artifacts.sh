#!/usr/bin/env bash
# watch-artifacts.sh , stream ONE line per newly-produced (or grown) run artifact.
#
# WHY: a live optimize/capture run is "healthy" only when artifacts land on disk ,
# feature-spec.json, each experiments/<handoff>/candidate-*/trial-* record, the
# recorded turns, champion-walk.json. Grepping the driver LOG for milestone strings
# is misleading: the log can say "spec-author turn done" while the artifact was
# blocked and never written (the acceptEdits/bypassPermissions regression showed
# exactly this , log looked fine, zero artifacts). This watcher reports the OUTPUT.
#
# Design for the Monitor tool: each stdout line is one event; the script exits when
# the run's terminal artifact (champion-walk.json with the expected winner count) or a
# halt signal appears, so a bounded run emits a finite stream. Runs unbounded until
# killed if --expect-winners is omitted. Portable to macOS bash 3.2 (no assoc arrays):
# a flat state file tracks what has already been announced.
#
# Usage:
#   watch-artifacts.sh --project-dir <dir> [--feature F1-stock-visibility]
#                      [--log <driver.log>] [--expect-winners N] [--interval 5]
#
# Emits (one per line):
#   ART  <relpath>  <bytes>b       a NEW artifact file appeared (0b flags an empty/blocked write)
#   GROW <relpath>  <bytes>b       an existing artifact grew (e.g. champion-walk.json gained a winner)
#   DIR  <relpath>                 a new experiments/<handoff> or candidate/trial dir appeared
#   HALT <why>                     a halt/failure signal in the log (raise-to-hil, produced no <artifact>, auth fail)
#   DONE champion-walk winners=N   terminal: expected winner count reached
set -uo pipefail

PROJECT_DIR=""; FEATURE="F1-stock-visibility"; LOG=""; EXPECT_WINNERS=""; INTERVAL=5
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2;;
    --feature) FEATURE="$2"; shift 2;;
    --log) LOG="$2"; shift 2;;
    --expect-winners) EXPECT_WINNERS="$2"; shift 2;;
    --interval) INTERVAL="$2"; shift 2;;
    *) echo "watch-artifacts: unknown arg $1" >&2; exit 2;;
  esac
done
[[ -n "$PROJECT_DIR" ]] || { echo "watch-artifacts: --project-dir required" >&2; exit 2; }

# Resolve the artifact root: canonical .consort, honoring the legacy .sftdd/.tdd
# names (newest-first) so this watcher works against an older project layout too.
ARTIFACT_DIR="$PROJECT_DIR/.consort"
for _root in .consort .sftdd .tdd; do
  if [[ -d "$PROJECT_DIR/$_root" ]]; then ARTIFACT_DIR="$PROJECT_DIR/$_root"; break; fi
done
EXPERIMENTS_DIR="$PROJECT_DIR/experiments"
FEATDIR="$ARTIFACT_DIR/features/$FEATURE"
CHAMP="$EXPERIMENTS_DIR/champion-walk.json"

STATE="$(mktemp)"          # lines: "<key>\t<bytes>" of what we've already announced
trap 'rm -f "$STATE"' EXIT
LOG_OFFSET=0

emit() { printf '%s\n' "$*"; }
rel()  { printf '%s' "${1#"$PROJECT_DIR"/}"; }

# seen <key> -> echoes the last-announced bytes for key, or empty if never seen.
# Record layout is "<key>\t<bytes>" (key first, no leading tab), so an exact
# start-anchored match on "<key>\t" finds it and field 2 is the byte count.
seen() { grep -F "$1	" "$STATE" 2>/dev/null | tail -1 | cut -f2; }
# remember <key> <bytes>
remember() { printf '%s\t%s\n' "$1" "$2" >> "$STATE"; }

scan_dirs() {
  local d r
  while IFS= read -r d; do
    [[ -n "$d" ]] || continue
    r="dir:$(rel "$d")"
    if [[ -z "$(seen "$r")" ]]; then emit "DIR  $(rel "$d")"; remember "$r" 1; fi
  done < <(find "$EXPERIMENTS_DIR" -mindepth 1 -type d 2>/dev/null)
}

scan_files() {
  local f bytes r prev
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    bytes=$(wc -c < "$f" 2>/dev/null | tr -d ' ')
    r="$(rel "$f")"
    prev="$(seen "file:$r")"
    if [[ -z "$prev" ]]; then emit "ART  $r  ${bytes}b"; remember "file:$r" "$bytes"
    elif [[ "$prev" != "$bytes" ]]; then emit "GROW $r  ${bytes}b"; remember "file:$r" "$bytes"; fi
  done < <(find "$FEATDIR" "$EXPERIMENTS_DIR" "$ARTIFACT_DIR/recorded-artifacts" "$PROJECT_DIR/recorded-build" \
              -type f \( -name '*.json' -o -name '*.md' -o -name '*.txt' \) 2>/dev/null)
}

scan_log_halts() {
  # Terminal/failure signals only , the crash signatures that otherwise look identical
  # to "still running" (silence). Never the happy-path chatter.
  [[ -n "$LOG" && -f "$LOG" ]] || return 0
  local total new
  total=$(wc -c < "$LOG" 2>/dev/null | tr -d ' ')
  [[ "$total" -gt "$LOG_OFFSET" ]] || return 0
  new=$(tail -c "+$((LOG_OFFSET + 1))" "$LOG" 2>/dev/null)
  LOG_OFFSET="$total"
  printf '%s\n' "$new" | grep -aoiE \
    "produced no [a-z.-]+|raise-to-hil|driver stalled|auth[^ ]* fail[a-z]*|token[- ]mint[^ ]* fail[a-z]*|Traceback|permission[^ ]* denied|haven't granted" \
    2>/dev/null | while IFS= read -r hit; do [[ -n "$hit" ]] && emit "HALT $hit"; done
}

winners_count() {
  [[ -f "$CHAMP" ]] || { echo 0; return; }
  jq -r '.winners | length' "$CHAMP" 2>/dev/null || grep -aoc 'handoffId' "$CHAMP" 2>/dev/null || echo 0
}

emit "watch-artifacts: project=$PROJECT_DIR feature=$FEATURE expect-winners=${EXPECT_WINNERS:-<unbounded>} interval=${INTERVAL}s"
while true; do
  scan_dirs
  scan_files
  scan_log_halts
  if [[ -n "$EXPECT_WINNERS" ]]; then
    n="$(winners_count)"
    if [[ "${n:-0}" -ge "$EXPECT_WINNERS" ]]; then emit "DONE champion-walk winners=$n"; exit 0; fi
  fi
  sleep "$INTERVAL"
done
