#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Validating: test_design_spec_gate_output (TEST tests/bdd/sftdd-design-spec-gate.test.ts) ==="

echo "CHECK 1: Test file exists..."
if [ -f "tests/bdd/sftdd-design-spec-gate.test.ts" ]; then
  echo "  PASS: test file exists"
else
  echo "  FAIL: test file not found at tests/bdd/sftdd-design-spec-gate.test.ts"
  exit 1
fi

echo "CHECK 2: Test passes..."
if npx vitest run tests/bdd/sftdd-design-spec-gate.test.ts; then
  echo "  PASS: test exited 0"
else
  echo "  FAIL: test exited non-zero"
  exit 1
fi

echo "=== ALL CHECKS PASSED ==="
