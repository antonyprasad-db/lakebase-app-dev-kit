#!/usr/bin/env bash
# Run a per-CHAIN lever sweep over the isolation substrate (no cloud project).
#
# Usage:
#   scripts/optimize-role.sh --chains design [--concurrency 3] [--base-model sonnet] [--telemetry-dir DIR]
#   scripts/optimize-role.sh --chains spec-author-story,architect-reviewer [--concurrency 4]
#   scripts/optimize-role.sh --role test-strategist            # back-compat: single chain
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
# Run the BUILT dist artifact (CJS), not the .ts via tsx: the shared schema-loader uses __dirname,
# which is undefined under tsx's ESM loader. This is an INTERNAL harness (not a published bin), so
# it lives under tests/optimization/ and is built to dist purely for this runbook. Build if absent.
BIN="dist/tests/optimization/optimize-role.cli.js"
[ -f "$BIN" ] || npm run build >/dev/null
exec node "$BIN" "$@"
