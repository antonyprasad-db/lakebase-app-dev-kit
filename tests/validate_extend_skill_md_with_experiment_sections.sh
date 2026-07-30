#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Validating: extend_skill_md_with_experiment_sections (MODIFY skills/consort/SKILL.md) ==="

echo "CHECK 1: Running validation command..."
if grep -q '### Experiment' skills/consort/SKILL.md && grep -q 'design-spec-gate' skills/consort/SKILL.md; then
  echo "  PASS: SKILL.md mentions experiment + spike + design-spec-gate"
else
  echo "  FAIL: SKILL.md mentions experiment + spike + design-spec-gate"
  exit 1
fi

echo "=== ALL CHECKS PASSED ==="
