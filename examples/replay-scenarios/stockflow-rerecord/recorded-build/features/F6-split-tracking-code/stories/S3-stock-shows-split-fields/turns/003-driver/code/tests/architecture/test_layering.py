"""Architectural fitness tests for S1-file-stock (T4, T5, T6, T7).

T4: boundary (app/routes) does NOT import the DB session.
T5: boundary returns JSON only; no TemplateResponse / server-side rendering.
T6: only the repository layer imports the ORM/session; service + boundary are ORM-free.
T7: DATABASE_URL drives the connection; no hardcoded connection string.
"""

import ast
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "app"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _source(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text()


def _all_py_sources(directory: Path) -> list[tuple[Path, str]]:
    if not directory.exists():
        return []
    return [(p, p.read_text()) for p in directory.rglob("*.py")]


def _imports_any(source: str, *targets: str) -> bool:
    """Return True if any of the target names appear as import targets in source."""
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
# T4: boundary (app/routes) must NOT import the DB session
# ---------------------------------------------------------------------------

def test_T4_boundary_does_not_import_db_session():
    """app/routes/ must not import Session, SessionLocal, db, or get_db."""
    routes_dir = APP / "routes"
    session_identifiers = ("SessionLocal", "Session", "get_db", "database")
    violations = []
    for path, src in _all_py_sources(routes_dir):
        if _imports_any(src, *session_identifiers):
            violations.append(str(path.relative_to(ROOT)))
    assert not violations, (
        f"Boundary modules import the DB session (layering violation): {violations}. "
        "Persistence must live only in app/repositories/."
    )


# ---------------------------------------------------------------------------
# T5: boundary returns JSON only; no TemplateResponse / Jinja2 rendering
# ---------------------------------------------------------------------------

def test_T5_boundary_returns_json_only():
    """app/routes/ must not use TemplateResponse, Jinja2Templates, or render HTML strings."""
    routes_dir = APP / "routes"
    rendering_identifiers = ("TemplateResponse", "Jinja2Templates", "HTMLResponse")
    violations = []
    for path, src in _all_py_sources(routes_dir):
        if _imports_any(src, *rendering_identifiers):
            violations.append(str(path.relative_to(ROOT)))
        # Also catch inline HTML return as a blunt check.
        if "<!DOCTYPE html" in src or "<html" in src:
            violations.append(str(path.relative_to(ROOT)) + " [inline HTML]")
    assert not violations, (
        f"Boundary modules perform server-side rendering (NFR-F1-5 violated): {violations}. "
        "The boundary must return JSON only; the React SPA renders the UI."
    )


# ---------------------------------------------------------------------------
# T6: only repository layer imports ORM/session; service + boundary are ORM-free
# ---------------------------------------------------------------------------

ORM_IDENTIFIERS = ("Session", "SessionLocal", "Column", "relationship", "mapped_column",
                   "DeclarativeBase", "declarative_base", "sqlalchemy")


def test_T6_only_repository_imports_orm():
    """app/services/ and app/routes/ must not import SQLAlchemy ORM constructs."""
    for layer_dir_name in ("services", "routes"):
        layer_dir = APP / layer_dir_name
        violations = []
        for path, src in _all_py_sources(layer_dir):
            if _imports_any(src, *ORM_IDENTIFIERS):
                violations.append(str(path.relative_to(ROOT)))
        assert not violations, (
            f"ORM-only persistence contract violated: {layer_dir_name} modules import ORM: {violations}. "
            "Only app/repositories/ may touch the ORM/session."
        )


# ---------------------------------------------------------------------------
# T7: connection string comes from DATABASE_URL env var; no hardcoded DSN
# ---------------------------------------------------------------------------

_HARDCODED_PATTERNS = [
    "postgresql://",
    "postgresql+psycopg://",
    "postgres://",
]
_ALLOWED_FILES = {"database.py", "alembic/env.py"}


def test_T7_no_hardcoded_connection_string():
    """No application module (outside database.py/alembic/env.py) may embed a hardcoded DSN."""
    for path in APP.rglob("*.py"):
        rel = str(path.relative_to(ROOT))
        if any(allowed in rel for allowed in _ALLOWED_FILES):
            continue
        src = path.read_text()
        for pattern in _HARDCODED_PATTERNS:
            assert pattern not in src, (
                f"Hardcoded connection string '{pattern}' found in {rel} (NFR-F1-7). "
                "All DB config must come from the DATABASE_URL environment variable."
            )

    # Verify database.py reads DATABASE_URL from env (not a literal).
    db_src = _source(APP / "database.py")
    assert 'os.getenv("DATABASE_URL")' in db_src or "DATABASE_URL" in db_src, (
        "database.py must source the connection from DATABASE_URL env var (NFR-F1-7)."
    )
