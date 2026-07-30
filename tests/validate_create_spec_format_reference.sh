#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Validating: create_spec_format_reference (CREATE skills/consort/references/spec-format.md) ==="

echo "CHECK 1: Running validation command..."
if test -f skills/consort/references/spec-format.md; then
  echo "  PASS: file exists"
else
  echo "  FAIL: file exists"
  exit 1
fi

echo "=== ALL CHECKS PASSED ==="
