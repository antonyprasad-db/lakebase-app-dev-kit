#!/usr/bin/env bash
# Run a per-CHAIN lever sweep over the isolation substrate (no cloud project).
#
# Usage:
#   scripts/optimize-role.sh --chains design [--concurrency 3] [--base-model sonnet] [--telemetry-dir DIR]
#   scripts/optimize-role.sh --chains spec-author-story,architect-reviewer [--concurrency 4]
#   scripts/optimize-role.sh --role test-strategist            # back-compat: single chain
#   # RESUME a partial driver-green sweep (crash-safe): each candidate persists as it finishes to
#   # <run>/driver-green/<candidate>/trial.json, and the summary is rebuilt from ALL persisted
#   # per-candidate dirs. Point at the SAME run dir + name only the not-yet-run candidates:
#   RUN_LIVE_STEP=1 LAKEBASE_TEST_E2E=1 scripts/optimize-role.sh --chains driver-green \
#     --telemetry-dir examples/replay/optimize-results/runs/<stamp> \
#     --candidates m-haiku-e-low,m-opus-e-low,scan-tight
#
# --chains is a SET ("design" = every design role chain) or a comma list of chain handles; --role is
# the back-compat single-chain alias. --concurrency caps in-flight candidates (default 1 = sequential;
# >1 fans the chain's candidates out in parallel , each in its OWN mkdtemp workspace with levers
# in-memory, so no shared-state race). Each candidate (baseline + model tiers x effort rungs x
# scan-tight) runs the chain ONCE LIVE (recorded inputs replayed in, only that role's turn is a real
# `claude -p` spawn, tool-scoped out of Bash, in a throwaway .consort workspace), gated on the role's
# conformance validator + a reference-example quality judge; the report ranks the fastest quality-
# holding candidate vs the baseline. Every trial's evidence survives to the telemetry dir. LEAN ,
# nothing to tear down.
#
# This is the lightweight sibling of scripts/optimize-scenario.sh (which sweeps a whole scaffolded
# drive). Requires the same claude auth the per-role live tests use (RUN_LIVE_STEP is implied , the
# CLI always runs live).
set -euo pipefail
cd "$(dirname "$0")/.."
# Source the SINGLE test-env home so a CLOUD chain (driver-green) resolves its workspace the same
# way the live-test runner does (run-all-live-tests.sh sources these too). Lean design/navigator
# chains don't need cloud creds , sourcing is harmless there (it only sets env vars). Without this,
# resolveTestEnv() sees no DATABRICKS_CONFIG_PROFILE/LAKEBASE_TEST_HOST -> empty host -> the
# driver-green scaffold-project op gets an empty config -> "requires config.projectName". The env
# home is the ONLY source of the workspace (never hardcoded); see provisioning/test-env.ts.
# shellcheck source=/dev/null
[ -f ".env.template.test.config" ] && . ".env.template.test.config"
# shellcheck source=/dev/null
[ -f ".env.local.test.config" ] && . ".env.local.test.config"
# Run the BUILT dist artifact (CJS), not the .ts via tsx: the shared schema-loader uses __dirname,
# which is undefined under tsx's ESM loader. This is an INTERNAL harness (not a published bin), so
# it lives under tests/optimization/ and is built to dist purely for this runbook.
#
# ALWAYS rebuild first (not build-if-absent): a STALE dist silently ran old code against fresh source
# more than once (e.g. a driver-green seed fix that wasn't inlined => all candidates fail on the old
# path). tsup is incremental + fast, so an unconditional rebuild is the cheap price of "the launcher
# can never run stale". This is THE one door , always invoke the sweep through here, never `node` by hand.
BIN="dist/tests/optimization/optimize-role.cli.js"
echo "[optimize-role] rebuilding dist (guarantee fresh) ..." >&2
npm run build >/dev/null
exec node "$BIN" "$@"
