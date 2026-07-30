#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Validating: create_architect_reviewer_agent (CREATE skills/consort/agents/architect-reviewer.md) ==="

echo "CHECK 1: Running validation command..."
if test -f skills/consort/agents/architect-reviewer.md && grep -q software-design-principles skills/consort/agents/architect-reviewer.md; then
  echo "  PASS: file exists AND references software-design-principles"
else
  echo "  FAIL: file exists AND references software-design-principles"
  exit 1
fi

echo "=== ALL CHECKS PASSED ==="
