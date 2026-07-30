#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Validating: create_tdd_skill_md (CREATE skills/consort/SKILL.md) ==="

echo "CHECK 1: Running validation command..."
if test -f skills/consort/SKILL.md && grep -q '^name:' skills/consort/SKILL.md; then
  echo "  PASS: file exists AND frontmatter present"
else
  echo "  FAIL: file exists AND frontmatter present"
  exit 1
fi

echo "=== ALL CHECKS PASSED ==="
