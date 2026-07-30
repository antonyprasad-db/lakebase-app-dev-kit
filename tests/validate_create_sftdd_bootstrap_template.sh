#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Validating: create_tdd_bootstrap_template (CREATE templates/sftdd-bootstrap/.sftdd/README.md) ==="

echo "CHECK 1: Running validation command..."
if test -f templates/sftdd-bootstrap/.sftdd/README.md && test -f templates/sftdd-bootstrap/.sftdd/spec.json; then
  echo "  PASS: skeleton present"
else
  echo "  FAIL: skeleton present"
  exit 1
fi

echo "=== ALL CHECKS PASSED ==="
