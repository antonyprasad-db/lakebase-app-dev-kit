"""
S3-stock-shows-split-fields – Architectural fitness tests

T21 – AC1-split-fields-shown / NFR-F6-9
  The boundary (app/routes/) returns JSON only (renders_via: react) — never
  server-rendered HTML — and the stock-record payload carries batch_number and
  serial_number as SEPARATE top-level JSON fields (not a combined inventory_code).

  Two complementary checks:
    (a) Static / AST:  app/routes/ must not import TemplateResponse, Jinja2Templates,
        or HTMLResponse, and must not contain inline HTML strings.
    (b) Runtime / API: the GET /api/stock/{sku}/{location} endpoint returns a JSON
        response whose body contains the keys "batch_number" and "serial_number"
        at the top level, and does NOT contain a key "inventory_code".

Both checks run against the real paired-branch DB (no mocks).
"""

import ast
import json
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "app"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _all_py_sources(directory: Path) -> list[tuple[Path, str]]:
    if not directory.exists():
        return []
    return [(p, p.read_text()) for p in directory.rglob("*.py")]


def _imports_any(source: str, *targets: str) -> bool:
    """Return True if any of the target names appear as import targets."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return False
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if any(t in alias.name for t in targets):
                    return True
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if any(t in module for t in targets):
                return True
            for alias in node.names:
                if any(t in alias.name for t in targets):
                    return True
    return False


# ---------------------------------------------------------------------------
# T21 (a) – static check: boundary must not import or use server-side rendering
# ---------------------------------------------------------------------------

def test_T21_a_boundary_does_not_render_html():
    """
    app/routes/ must not perform server-side rendering.
    Prohibited: TemplateResponse, Jinja2Templates, HTMLResponse, inline HTML bodies.
    This enforces NFR-F6-9: renders_via react (JSON only).
    """
    routes_dir = APP / "routes"
    rendering_identifiers = ("TemplateResponse", "Jinja2Templates", "HTMLResponse")
    violations: list[str] = []
    for path, src in _all_py_sources(routes_dir):
        if _imports_any(src, *rendering_identifiers):
            violations.append(f"{path.relative_to(ROOT)} imports a rendering identifier")
        if "<!DOCTYPE html" in src or "<html" in src:
            violations.append(f"{path.relative_to(ROOT)} contains inline HTML")
    assert not violations, (
        "Boundary (app/routes/) performs server-side rendering — violates NFR-F6-9 "
        "(renders_via react; JSON only). Violations:\n" + "\n".join(violations)
    )


# ---------------------------------------------------------------------------
# T21 (b) – runtime check: /api/stock response carries split JSON fields
# ---------------------------------------------------------------------------

def test_T21_b_stock_endpoint_returns_split_json_fields(db_session):
    """
    The GET /api/stock/{sku}/{location} endpoint must return a JSON object
    containing 'batch_number' and 'serial_number' as separate top-level keys,
    and must NOT contain 'inventory_code' (the old combined column).

    Runs against the real paired-branch DB via FastAPI TestClient.
    State owned by this test: uuid-suffixed (sku, location) pair seeded and
    cleaned up in a finally block.
    """
    from app.main import app  # import here so the fixture can run first

    sku = f"SKU-T21-{uuid.uuid4().hex[:10]}"
    location = f"LOC-T21-{uuid.uuid4().hex[:8]}"
    batch = "BATCH-T21"
    serial = "SERIAL-T21"

    # Idempotent seed: delete any stale row with this key first.
    db_session.execute(
        sa.text("DELETE FROM stock_records WHERE sku = :sku AND location = :location"),
        {"sku": sku, "location": location},
    )
    db_session.commit()

    db_session.execute(
        sa.text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :location, :qty, :batch, :serial)"
        ),
        {"sku": sku, "location": location, "qty": 1, "batch": batch, "serial": serial},
    )
    db_session.commit()

    try:
        with TestClient(app) as http:
            response = http.get(f"/api/stock/{sku}/{location}")

        assert response.status_code == 200, (
            f"Expected 200 from GET /api/stock/{sku}/{location}, got {response.status_code}: "
            f"{response.text}"
        )

        payload = response.json()

        # Must carry the split fields.
        assert "batch_number" in payload, (
            f"Response JSON missing 'batch_number' key (NFR-F6-9): {json.dumps(payload)}"
        )
        assert "serial_number" in payload, (
            f"Response JSON missing 'serial_number' key (NFR-F6-9): {json.dumps(payload)}"
        )

        # Must NOT carry the combined column — it was dropped by the migration.
        assert "inventory_code" not in payload, (
            f"Response JSON contains forbidden 'inventory_code' key — "
            f"boundary must expose only split fields (NFR-F6-9): {json.dumps(payload)}"
        )

        # Spot-check values are correct (the right record was returned).
        assert payload["batch_number"] == batch, (
            f"batch_number mismatch: expected {batch!r}, got {payload['batch_number']!r}"
        )
        assert payload["serial_number"] == serial, (
            f"serial_number mismatch: expected {serial!r}, got {payload['serial_number']!r}"
        )

    finally:
        db_session.execute(
            sa.text("DELETE FROM stock_records WHERE sku = :sku AND location = :location"),
            {"sku": sku, "location": location},
        )
        db_session.commit()
