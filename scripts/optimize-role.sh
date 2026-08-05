#!/usr/bin/env bash
# Run a PER-ROLE lever sweep over the isolation substrate (no cloud project).
#
# Usage:
#   scripts/optimize-role.sh --role test-strategist [--base-model sonnet] [--telemetry-dir DIR]
#
# Each candidate (baseline + model tiers x effort rungs x scan-tight) runs the role's chain ONCE
# LIVE (recorded inputs replayed in, only that role's turn is a real `claude -p` spawn, tool-scoped
# out of Bash, in a throwaway .sftdd workspace). Each is gated on the role's conformance validator;
# the report ranks the fastest gate-passer vs the baseline. Every trial's telemetry survives to the
# telemetry dir. LEAN , nothing to tear down.
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
