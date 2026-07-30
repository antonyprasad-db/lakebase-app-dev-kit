#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Validating: create_design_spec_gate (CREATE scripts/sftdd/design-spec-gate.ts) ==="

echo "CHECK 1: Running validation command..."
if npm run typecheck; then
  echo "  PASS: typecheck clean"
else
  echo "  FAIL: typecheck clean"
  exit 1
fi

echo "=== ALL CHECKS PASSED ==="
