#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Validating: update_root_readme_with_shared_canon (MODIFY README.md) ==="

echo "CHECK 1: Running validation command..."
if grep -q 'engineering canon' README.md && grep -q 'skills/software-design-principles/SKILL.md' README.md; then
  echo "  PASS: README describes the engineering canon and links to skills/software-design-principles/SKILL.md"
else
  echo "  FAIL: README describes the engineering canon and links to skills/software-design-principles/SKILL.md"
  exit 1
fi

echo "=== ALL CHECKS PASSED ==="
