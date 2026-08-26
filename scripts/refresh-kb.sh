#!/usr/bin/env bash
# refresh-kb.sh , refresh the Consort docs Knowledge Assistant (the #consort-for-app-dev
# auto-answer bot) so it answers from the CURRENT docs.
#
# The KA ingests a SNAPSHOT of the kit docs from a UC Volume (Agent Bricks reads Volumes,
# not the git repo), so the corpus goes stale until it is re-uploaded + re-synced. Run this
# at every release (it is step 5 of the release checklist in CONTRIBUTING.md) so the bot
# never drifts more than one release behind. Idempotent; safe to re-run any time.
#
# Overridable via env: CONSORT_KB_PROFILE, CONSORT_KB_VOLUME, CONSORT_KB_KA.
set -euo pipefail

PROFILE="${CONSORT_KB_PROFILE:-partner-demo-catalog}"
VOLUME="${CONSORT_KB_VOLUME:-/Volumes/partner_demo_catalog/consort/docs}"
KA="${CONSORT_KB_KA:-knowledge-assistants/f54be2f1-eb22-4908-992f-375875f5fefd}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# The corpus: agent + reference docs, the slash commands, TELEMETRY, CHANGELOG, READMEs.
# Flatten path -> filename (a/b/c.md -> a__b__c.md) so KA citations keep provenance and the
# flat Volume has no name collisions.
{ find skills/consort commands -name '*.md'; ls TELEMETRY.md CHANGELOG.md README.md 2>/dev/null; } | while read -r f; do
  cp "$f" "$STAGE/$(printf '%s' "$f" | sed 's#/#__#g')"
done
echo "[refresh-kb] staged $(find "$STAGE" -type f | wc -l | tr -d ' ') docs from $REPO_ROOT"

# Upload (overwrite). NOTE: additive , a doc DELETED from the repo lingers in the Volume
# until manually removed (rare); edits + additions refresh cleanly.
echo "[refresh-kb] uploading to $VOLUME (profile $PROFILE) ..."
databricks fs cp --recursive --overwrite "$STAGE" "dbfs:$VOLUME" --profile "$PROFILE"

echo "[refresh-kb] syncing the Knowledge Assistant $KA ..."
databricks knowledge-assistants sync-knowledge-sources "$KA" --profile "$PROFILE"

echo "[refresh-kb] done , the #consort-for-app-dev bot serves the refreshed docs once the sync completes (a few min)."
echo "[refresh-kb] status: databricks knowledge-assistants get-knowledge-assistant \"$KA\" --profile \"$PROFILE\""
