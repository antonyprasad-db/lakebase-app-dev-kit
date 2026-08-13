#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Validating: create_consort_bootstrap_template (CREATE templates/consort-bootstrap/.consort/README.md) ==="

echo "CHECK 1: Running validation command..."
if test -f templates/consort-bootstrap/.consort/README.md && test -f templates/consort-bootstrap/.consort/spec.json; then
  echo "  PASS: skeleton present"
else
  echo "  FAIL: skeleton present"
  exit 1
fi

echo "=== ALL CHECKS PASSED ==="
