#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Validating: create_navigator_agent (CREATE skills/consort/agents/navigator.md) ==="

echo "CHECK 1: Running validation command..."
if test -f skills/consort/agents/navigator.md; then
  echo "  PASS: file exists"
else
  echo "  FAIL: file exists"
  exit 1
fi

echo "=== ALL CHECKS PASSED ==="
