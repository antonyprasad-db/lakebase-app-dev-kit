#!/usr/bin/env bash
# consort-create.sh , kit-owned create launcher with a DOWNLOAD HEARTBEAT.
#
# `npx --package=github:…#<ver> lakebase-create-project` first git-fetches the kit +
# its dependencies (cold: ~1-3 min) and is SILENT the entire time , the log sits empty
# and the run looks hung, then every [stage] line seems to arrive at once. The bin
# cannot narrate its own download (it is not running yet), so THIS wrapper , shipped in
# the plugin and therefore present BEFORE any fetch , prints an elapsed-time heartbeat
# during the fetch, then forwards create's own [stage] lines unchanged. This mirrors
# the `lk --refresh` install heartbeat for the create path.
#
# Relay it exactly like a drive: background this to a log and poll-once with
# `consort-watch --since <cursor> --log <log>` (see /consort:start). Do NOT tail it in
# a long foreground loop , the harness buffers a blocking call, so the human sees
# nothing until it returns (the "nothing reported until all done" failure).
#
# Usage: consort-create.sh <KIT_PKG> [lakebase-create-project args…]
#   e.g. consort-create.sh 'github:databricks-solutions/consort#v0.3.25' \
#          --project-name demo --parent-dir "$HOME/code" --databricks-host https://… …
set -u

KIT_PKG="${1:?usage: consort-create.sh <KIT_PKG> [lakebase-create-project args…]}"
shift

start=$(date +%s)
# A marker file the reader drops on create's FIRST output line, to stop the heartbeat
# (the fetch is done + the bin is running once ANY line appears).
marker="$(mktemp -u "${TMPDIR:-/tmp}/consort-create-fetch.XXXXXX")"

echo "[toolkit] Downloading the Consort toolkit (${KIT_PKG}) , one-time for this version, ~1-2 min (kit + its dependencies). Later commands are instant."

# Heartbeat during the silent npx fetch: an elapsed-time line every 15s until the
# marker appears (or we are torn down). Runs in the background so the fetch is not held.
(
  while [ ! -f "$marker" ]; do
    sleep 15
    [ -f "$marker" ] && break
    echo "[toolkit] … still downloading the Consort toolkit ($(( $(date +%s) - start ))s elapsed; ~1-2 min typical)…"
  done
) &
hb=$!

# Run create; merge its stderr (where the [stage] lines go) into the pipe. On the FIRST
# forwarded line the fetch is complete, so drop the marker to stop the heartbeat, then
# forward every line through unchanged for the relay to pick up.
npx --yes --package="$KIT_PKG" lakebase-create-project "$@" 2>&1 | {
  first=1
  while IFS= read -r line; do
    if [ "$first" = 1 ]; then : > "$marker"; first=0; fi
    printf '%s\n' "$line"
  done
}
rc=${PIPESTATUS[0]}

# Ensure the heartbeat stops even if create produced NO output (an early hard failure).
: > "$marker"
wait "$hb" 2>/dev/null
rm -f "$marker"
exit "$rc"
