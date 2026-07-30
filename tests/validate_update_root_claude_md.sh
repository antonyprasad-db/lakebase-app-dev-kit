#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Validating: update_root_claude_md (MODIFY CLAUDE.md) ==="

echo "CHECK 1: Running validation command..."
if grep -q '\.sftdd/' CLAUDE.md; then
  echo "  PASS: CLAUDE.md mentions .sftdd/"
else
  echo "  FAIL: CLAUDE.md mentions .sftdd/"
  exit 1
fi

echo "=== ALL CHECKS PASSED ==="
