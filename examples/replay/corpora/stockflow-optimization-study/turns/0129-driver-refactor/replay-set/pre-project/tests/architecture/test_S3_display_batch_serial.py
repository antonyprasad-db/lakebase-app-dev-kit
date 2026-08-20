"""Architectural fitness tests for S3-display-batch-serial-separately (F6).

T28 – stock-api boundary (app/routes/) does not import SQLAlchemy Session or ORM session
T29 – stock-service (app/services/) contains no SQLAlchemy Session or ORM imports
T30 – DB connection URL resolved exclusively from DATABASE_URL env var
T31 – GET /api/stock returns Content-Type application/json, not server-rendered HTML
"""

import ast
import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]

# ── Static-analysis helpers ──────────────────────────────────────────────────


def _iter_importfrom_names(directory: Path):
    """Yield (module, [names]) for every `from module import name` in directory."""
    if not directory.exists():
        return
    for pyfile in directory.rglob("*.py"):
        tree = ast.parse(pyfile.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                yield (node.module or "", [a.name for a in node.names])


def _iter_import_modules(directory: Path):
    """Yield the module string for every import/import-from node in directory."""
    if not directory.exists():
        return
    for pyfile in directory.rglob("*.py"):
        tree = ast.parse(pyfile.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                yield node.module or ""
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    yield alias.name


# ── T28: boundary does not import DB session ────────────────────────────────

_SESSION_SYMBOLS = {"SessionLocal", "get_db", "Session", "db"}


def test_T28_routes_do_not_import_db_session():
    """T28: app/routes/ must not import SQLAlchemy Session or ORM session objects."""
    routes_dir = ROOT / "app" / "routes"
    violations = []
    for module, names in _iter_importfrom_names(routes_dir):
        if "database" in module or "db" in module or "sqlalchemy" in module:
            bad = _SESSION_SYMBOLS & set(names)
            if bad:
                violations.append(f"{module!r} → {bad}")
    assert not violations, (
        "app/routes/ imports DB session symbols — all data reads must flow through "
        "the service layer: " + "; ".join(violations)
    )


# ── T29: service layer holds no Session or ORM imports ───────────────────────


def test_T29_services_hold_no_orm_session_imports():
    """T29: app/services/ must contain no SQLAlchemy Session or ORM session imports."""
    services_dir = ROOT / "app" / "services"
    orm_violations = [
        m for m in _iter_import_modules(services_dir) if m.startswith("sqlalchemy")
    ]
    session_violations = []
    for module, names in _iter_importfrom_names(services_dir):
        if "database" in module or "sqlalchemy" in module:
            bad = _SESSION_SYMBOLS & set(names)
            if bad:
                session_violations.append(f"{module!r} → {bad}")
    all_violations = orm_violations + session_violations
    assert not all_violations, (
        "app/services/ contains ORM/session imports — persistence must be delegated to "
        "app/repositories/ only: " + str(all_violations)
    )


# ── T30: DATABASE_URL is the sole connection config source ───────────────────


def test_T30_db_connection_url_from_database_url_env():
    """T30: the database connection is resolved from the DATABASE_URL env var, not hardcoded."""
    db_file = ROOT / "app" / "database.py"
    source = db_file.read_text(encoding="utf-8")

    assert "DATABASE_URL" in source, (
        "app/database.py must reference DATABASE_URL environment variable for the "
        "connection URL (NFR-F6-4)"
    )
    # No hardcoded postgres:// or postgresql:// URLs with credentials embedded
    import re

    hardcoded_dsn = re.findall(
        r'["\']postgres(?:ql)?://[^"\'@]{1,}:[^"\'@]{1,}@[^"\']{5,}["\']',
        source,
    )
    assert not hardcoded_dsn, (
        f"Hardcoded connection URL with credentials found in app/database.py: {hardcoded_dsn}"
    )

    # No hardcoded non-localhost host strings (password= style)
    hardcoded_passwords = re.findall(
        r'(?:password|PASSWORD|passwd)\s*=\s*["\'][^"\']{3,}["\']', source
    )
    assert not hardcoded_passwords, (
        f"Hardcoded password found in app/database.py: {hardcoded_passwords}"
    )


# ── T31: GET /api/stock returns JSON, not HTML ───────────────────────────────


def test_T31_stock_list_boundary_returns_json_not_html(client):
    """T31: GET /api/stock returns Content-Type application/json, never server-rendered HTML."""
    resp = client.get("/api/stock")
    assert resp.status_code == 200, (
        f"Expected 200 from GET /api/stock; got {resp.status_code}"
    )
    content_type = resp.headers.get("content-type", "")
    assert "application/json" in content_type, (
        f"GET /api/stock must return application/json; got Content-Type: {content_type!r}"
    )
    # The body must be parseable as JSON and must NOT start with an HTML tag
    body = resp.text.strip()
    assert not body.startswith("<"), (
        "GET /api/stock returned an HTML body — the boundary must return JSON only, "
        f"not server-rendered HTML. Body starts with: {body[:120]!r}"
    )
    # Confirm it parses as JSON without error
    data = resp.json()
    assert isinstance(data, list), (
        f"GET /api/stock must return a JSON array; got {type(data)}"
    )
