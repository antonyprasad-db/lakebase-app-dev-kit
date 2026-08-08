"""Architectural fitness tests for S3-stock-shows-split-fields.

T21 [AC1-split-fields-shown, NFR-F6-9]:
    The boundary (app/routes) returns the stock record as JSON only, carrying
    batch_number and serial_number as separate fields.  It must never
    server-render HTML.  The boundary is declared renders_via:react (JSON API
    contract); the React SPA owns the presentation layer.

This file is a regression guard: it holds once the Driver wires the route
correctly and protects against future drift back to Jinja2 / HTML responses.
"""

import ast
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _all_py_sources(directory: Path) -> list[tuple[Path, str]]:
    """Return (path, source) pairs for every .py under *directory*."""
    if not directory.exists():
        return []
    return [(p, p.read_text()) for p in directory.rglob("*.py")]


def _imports_any(source: str, *targets: str) -> bool:
    """Return True if *source* imports any of *targets* (by simple AST walk)."""
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


_TEMPLATE_IDENTIFIERS = (
    "TemplateResponse",
    "Jinja2Templates",
    "HTMLResponse",
    "templates",
)

_SESSION_IDENTIFIERS = ("SessionLocal", "Session", "get_db", "database")


# ---------------------------------------------------------------------------
# T21 — boundary returns JSON only; batch_number + serial_number as separate
#        JSON fields; never server-rendered HTML (NFR-F6-9, renders_via:react)
# ---------------------------------------------------------------------------

def test_T21_boundary_returns_json_not_html():
    """GET /api/stock/{sku}/{location} responds with JSON, not HTML (NFR-F6-9).

    The boundary is declared renders_via:react, meaning it must return JSON
    exclusively.  A non-JSON (HTML) Content-Type or a TemplateResponse import
    in app/routes/ is a layering violation.
    """
    import uuid
    sku = f"SKU-{uuid.uuid4().hex[:10]}"
    location = f"LOC-{uuid.uuid4().hex[:8]}"

    # Seed a row so the endpoint can return a real record (not a 404).
    db = SessionLocal()
    try:
        import sqlalchemy as sa
        db.execute(
            sa.text(
                "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        )
        db.execute(
            sa.text(
                "INSERT INTO stock_records "
                "(sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :loc, 1, :batch, :serial)"
            ),
            {"sku": sku, "loc": location, "batch": "B-T21", "serial": "S-T21"},
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(f"/api/stock/{sku}/{location}")

    # Clean up.
    db2 = SessionLocal()
    try:
        import sqlalchemy as sa
        db2.execute(
            sa.text(
                "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        )
        db2.commit()
    except Exception:
        db2.rollback()
    finally:
        db2.close()

    assert response.status_code == 200, (
        f"Expected 200 from /api/stock/{sku}/{location}, got {response.status_code}: "
        f"{response.text}"
    )

    # The Content-Type must be JSON, never HTML.
    content_type = response.headers.get("content-type", "")
    assert "application/json" in content_type, (
        f"Boundary must return JSON (NFR-F6-9 renders_via:react), "
        f"got Content-Type: {content_type!r}.  "
        "A TemplateResponse / HTMLResponse in the route is a layering violation."
    )

    # Must be valid JSON (no accidental HTML body).
    try:
        body = response.json()
    except Exception as exc:
        raise AssertionError(
            f"Response body is not valid JSON (NFR-F6-9): {exc}\n"
            f"Body excerpt: {response.text[:500]}"
        )

    # batch_number and serial_number must be present as separate JSON fields.
    assert "batch_number" in body, (
        "Response JSON must carry 'batch_number' as a separate field (NFR-F6-9). "
        f"Keys present: {list(body.keys())}"
    )
    assert "serial_number" in body, (
        "Response JSON must carry 'serial_number' as a separate field (NFR-F6-9). "
        f"Keys present: {list(body.keys())}"
    )

    # The old combined inventory_code field must NOT appear in the JSON response.
    assert "inventory_code" not in body, (
        "Response JSON must NOT carry 'inventory_code' — the combined code has been "
        "split; only 'batch_number' and 'serial_number' are the source of truth "
        "after the F6 migration (NFR-F6-9).  "
        f"Keys present: {list(body.keys())}"
    )


def test_T21_boundary_module_does_not_use_template_response():
    """app/routes/ must NOT import TemplateResponse / Jinja2Templates / HTMLResponse.

    The boundary is renders_via:react — it must only return JSON.  Any
    TemplateResponse in the route layer is a layering violation (NFR-F6-9).
    """
    routes_dir = APP / "routes"
    for path, src in _all_py_sources(routes_dir):
        assert not _imports_any(src, *_TEMPLATE_IDENTIFIERS), (
            f"Boundary module {path.relative_to(ROOT)} imports a template/HTML "
            "renderer: {_TEMPLATE_IDENTIFIERS}. "
            "The stock boundary is renders_via:react (JSON only); Jinja2/HTML "
            "rendering belongs in a Jinja-declared boundary, not here (NFR-F6-9)."
        )


def test_T21_boundary_module_does_not_import_db_session():
    """app/routes/ must NOT import the DB session (layering contract, T2 regression guard).

    The session lives exclusively in app/repositories/.  This guard ensures
    the split-fields route does not re-introduce a boundary→DB direct call.
    """
    violations = []
    for layer in ("routes", "services"):
        for path, src in _all_py_sources(APP / layer):
            if _imports_any(src, *_SESSION_IDENTIFIERS):
                violations.append(str(path.relative_to(ROOT)))
    assert not violations, (
        f"Layering violation (T21/T2): boundary/service modules import the DB "
        f"session: {violations}.  The session must only be used in app/repositories/."
    )


def test_T21_batch_and_serial_values_pass_through_json_unchanged():
    """batch_number and serial_number values are returned unchanged from the boundary.

    Verifies end-to-end that what was seeded in the DB appears verbatim in the
    JSON response — no stripping, no concatenation into a combined code.
    """
    import uuid
    sku = f"SKU-{uuid.uuid4().hex[:10]}"
    location = f"LOC-{uuid.uuid4().hex[:8]}"
    batch = f"BATCH-{uuid.uuid4().hex[:6]}"
    serial = f"SERIAL-{uuid.uuid4().hex[:6]}"

    db = SessionLocal()
    try:
        import sqlalchemy as sa
        db.execute(
            sa.text(
                "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        )
        db.execute(
            sa.text(
                "INSERT INTO stock_records "
                "(sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :loc, 7, :batch, :serial)"
            ),
            {"sku": sku, "loc": location, "batch": batch, "serial": serial},
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(f"/api/stock/{sku}/{location}")

    # Clean up.
    db2 = SessionLocal()
    try:
        import sqlalchemy as sa
        db2.execute(
            sa.text(
                "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        )
        db2.commit()
    except Exception:
        db2.rollback()
    finally:
        db2.close()

    assert response.status_code == 200, (
        f"Expected 200, got {response.status_code}: {response.text}"
    )
    body = response.json()

    assert body.get("batch_number") == batch, (
        f"batch_number round-trip failed: seeded {batch!r}, "
        f"got {body.get('batch_number')!r} (NFR-F6-9)."
    )
    assert body.get("serial_number") == serial, (
        f"serial_number round-trip failed: seeded {serial!r}, "
        f"got {body.get('serial_number')!r} (NFR-F6-9)."
    )
