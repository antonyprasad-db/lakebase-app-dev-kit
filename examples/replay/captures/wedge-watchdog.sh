#!/usr/bin/env bash
# wedge-watchdog.sh — durable, out-of-band liveness instrumentation for a live capture.
#
# WHY THIS EXISTS: the only liveness signal we had (agent-live.log) is written BY the
# agent's own stream. When the agent wedges — main event-loop thread parked in kevent64
# waiting on an Anthropic API response that stalled mid-stream, TLS socket held open on
# keepalive, ~0.1% CPU — the sidecar freezes and we go blind to WHY. The old hang rule
# ("CPU accruing + ESTABLISHED conns = alive, never kill") is fooled by exactly this: a
# STALLED-but-open read has that signature too. See docs/runbooks/evidence/
# navigator-red-wedge-sample-65149-20260809.txt for the specimen call-graph.
#
# WHAT THIS DOES: an independent process (survives the agent dying) that every INTERVAL
# seconds appends ONE structured JSONL snapshot of the SCOPED drive-child agent's INTERNAL
# state (cwd, cpu delta, thread parking, ESTABLISHED conn count, sidecar mtime + line count),
# and the MOMENT the wedge signature trips (sidecar frozen >= STALL_S AND cpu flat AND main
# thread parked in an idle syscall), auto-captures a full `sample` call-graph + a marker so
# the wedge is fully diagnosed even if the agent then dies. It NEVER kills anything — it only
# observes and records. Recovery stays a human/loop decision.
#
# Usage:
#   nohup bash wedge-watchdog.sh <RECORD_DIR> [PROJECT_MATCH] > /tmp/wedge-watchdog.log 2>&1 &
#   RECORD_DIR   : the capture's record dir (holds agent-live.log)
#   PROJECT_MATCH: substring to scope the drive-child agent by cwd (default: basename of RECORD_DIR)
#
# Output (all under <RECORD_DIR>/watchdog/):
#   liveness.jsonl        — one snapshot per tick (the durable timeline)
#   wedge-<pid>-<ts>.txt  — a `sample` call-graph captured at each detected wedge onset
#   wedge-events.jsonl    — one line per wedge onset/clear transition
set -uo pipefail

REC="${1:?usage: wedge-watchdog.sh <RECORD_DIR> [PROJECT_MATCH]}"
MATCH="${2:-$(basename "$REC")}"
OUT="$REC/watchdog"
mkdir -p "$OUT"
SIDE="$REC/agent-live.log"
LIVE="$OUT/liveness.jsonl"
EVENTS="$OUT/wedge-events.jsonl"

INTERVAL="${WATCHDOG_INTERVAL:-30}"   # seconds between snapshots
STALL_S="${WATCHDOG_STALL_S:-420}"    # sidecar-frozen seconds before we call it a wedge (7min)
CPU_EPS="${WATCHDOG_CPU_EPS:-0.10}"   # seconds of CPU per INTERVAL below which = "flat" (idle-spin)

now() { date +%s; }
jesc() { python3 -c "import json,sys;print(json.dumps(sys.stdin.read()))"; }

# resolve the scoped drive-child agent: a `claude` process whose cwd contains MATCH
scoped_pid() {
  local pid c
  for pid in $(pgrep -f "claude" 2>/dev/null); do
    c=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep '^n' | sed 's/^n//')
    case "$c" in *"$MATCH"*) echo "$pid"; return 0;; esac
  done
  return 1
}

# CPU seconds (UTIME+STIME) as a float, from ps TIME (mm:ss.ss)
cpu_secs() {
  ps -p "$1" -o time= 2>/dev/null | tr -d ' ' | awk -F: '{s=0;for(i=1;i<=NF;i++)s=s*60+$i;print s}'
}

# is the main thread parked in an idle syscall? (kevent64 / mach_msg = not computing)
main_parked() {
  # cheap: sample 1s, check if the dominant leaf is an idle wait
  local tmp; tmp=$(mktemp)
  sample "$1" 1 -f "$tmp" >/dev/null 2>&1
  if grep -qE "kevent64|mach_msg2_trap" "$tmp" && ! grep -qiE "v8|jsc|Parser|Interpret|GC|malloc" "$tmp"; then
    rm -f "$tmp"; echo "yes"
  else
    rm -f "$tmp"; echo "no"
  fi
}

echo "[watchdog] REC=$REC MATCH=$MATCH interval=${INTERVAL}s stall=${STALL_S}s -> $OUT"
prev_cpu=""; prev_pid=""; wedged=0

while true; do
  ts=$(now)
  pid=$(scoped_pid || true)
  side_mtime=$(stat -f %m "$SIDE" 2>/dev/null || echo 0)
  side_lines=$(wc -l < "$SIDE" 2>/dev/null | tr -d ' ' || echo 0)
  side_age=$(( ts - side_mtime ))

  if [ -z "$pid" ]; then
    printf '{"ts":%s,"scoped_pid":null,"note":"no scoped agent","side_age_s":%s,"side_lines":%s}\n' \
      "$ts" "$side_age" "$side_lines" >> "$LIVE"
    prev_cpu=""; prev_pid=""
    sleep "$INTERVAL"; continue
  fi

  cpu=$(cpu_secs "$pid")
  conns=$(lsof -a -p "$pid" -iTCP -sTCP:ESTABLISHED -n -P 2>/dev/null | grep -c ':443')
  stat_field=$(ps -p "$pid" -o stat= 2>/dev/null | tr -d ' ')
  # cpu delta only meaningful if same pid across ticks
  if [ "$pid" = "$prev_pid" ] && [ -n "$prev_cpu" ]; then
    dcpu=$(awk -v a="$prev_cpu" -v b="$cpu" 'BEGIN{printf "%.2f", b-a}')
  else
    dcpu="null"
  fi

  # wedge signature: sidecar frozen past STALL_S AND (cpu flat OR unknown) AND main parked
  sig="live"
  if [ "$side_age" -ge "$STALL_S" ]; then
    flat=$(awk -v d="$dcpu" -v e="$CPU_EPS" 'BEGIN{if(d=="null"){print "unknown"}else if(d+0<=e+0){print "yes"}else{print "no"}}')
    if [ "$flat" != "no" ]; then
      parked=$(main_parked "$pid")
      if [ "$parked" = "yes" ]; then sig="wedge"; fi
    fi
  fi

  printf '{"ts":%s,"scoped_pid":%s,"cpu_s":%s,"dcpu_s":%s,"stat":"%s","conns":%s,"side_age_s":%s,"side_lines":%s,"sig":"%s"}\n' \
    "$ts" "$pid" "$cpu" "$dcpu" "$stat_field" "$conns" "$side_age" "$side_lines" "$sig" >> "$LIVE"

  # transition into wedge -> capture a full sample specimen + event
  if [ "$sig" = "wedge" ] && [ "$wedged" -eq 0 ]; then
    spec="$OUT/wedge-${pid}-${ts}.txt"
    sample "$pid" 3 -f "$spec" >/dev/null 2>&1
    printf '{"ts":%s,"event":"wedge_onset","scoped_pid":%s,"side_age_s":%s,"side_lines":%s,"conns":%s,"dcpu_s":%s,"sample":"%s"}\n' \
      "$ts" "$pid" "$side_age" "$side_lines" "$conns" "$dcpu" "$(basename "$spec")" >> "$EVENTS"
    echo "[watchdog] WEDGE ONSET pid=$pid side_age=${side_age}s -> sample $spec"
    wedged=1
  elif [ "$sig" = "live" ] && [ "$wedged" -eq 1 ]; then
    printf '{"ts":%s,"event":"wedge_cleared","scoped_pid":%s,"side_lines":%s}\n' \
      "$ts" "$pid" "$side_lines" >> "$EVENTS"
    echo "[watchdog] wedge cleared pid=$pid (sidecar moving again)"
    wedged=0
  fi

  prev_cpu="$cpu"; prev_pid="$pid"
  sleep "$INTERVAL"
done
