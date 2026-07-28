"""Architectural fitness tests for S3-sku-detail-view.

T25 - AC1: the SKU detail read boundary (app/routes/) returns a JSON payload and
           never server-rendered HTML (SPA/JSON-API split, renders_via react, NFR5).

T26 - AC1: the SKU detail read path boundary (app/routes/) does not import the DB
           session; the per-SKU fetch is reachable only through the repository
           (app/repositories/ is the sole ORM/session owner, NFR5 + layering).
"""

import ast
import re
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
APP_DIR = ROOT / "app"


# ---------------------------------------------------------------------------
# T25 - detail boundary returns JSON, not HTML
# ---------------------------------------------------------------------------


def test_T25_sku_detail_boundary_returns_json_not_html():
    """T25: GET /api/stock/detail/<sku> returns application/json, never text/html.

    The route does not exist yet -- this goes RED until the Driver creates it.
    A 404 is also a failure: the route is required to exist and return JSON.
    """
    from app.main import app  # noqa: PLC0415

    client = TestClient(app)
    resp = client.get("/api/stock/detail/fitness-sku-t25")

    assert resp.status_code != 404, (
        "GET /api/stock/detail/<sku> returned 404 -- "
        "the SKU detail boundary route has not been created yet"
    )
    content_type = resp.headers.get("content-type", "")
    assert "text/html" not in content_type, (
        f"SKU detail boundary returned HTML (Content-Type: {content_type}); "
        "the detail boundary must return JSON (renders_via: react, NFR5)"
    )
    assert "application/json" in content_type, (
        f"SKU detail boundary Content-Type is '{content_type}'; expected application/json"
    )


# ---------------------------------------------------------------------------
# T26 - detail boundary does NOT import the DB session
# ---------------------------------------------------------------------------


def _python_sources_under(directory: Path):
    return list(directory.rglob("*.py"))


def _imports_db_session(source_path: Path) -> list[str]:
    """Return offending import strings if the file imports the DB session."""
    try:
        tree = ast.parse(source_path.read_text(encoding="utf-8"))
    except SyntaxError:
        return []

    offences = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            src = ast.unparse(node)
            if re.search(r"\b(SessionLocal|get_db|Session)\b", src) and re.search(
                r"\b(database|db)\b", src
            ):
                offences.append(src)
    return offences


def test_T26_detail_boundary_does_not_import_db_session():
    """T26: app/routes/ must not import the DB session for the detail path.

    The per-SKU fetch must flow through app/repositories/ (the sole ORM owner).
    """
    routes_dir = APP_DIR / "routes"
    if not routes_dir.exists():
        import pytest
        pytest.fail(
            "app/routes/ does not exist; the boundary layer has not been created yet"
        )

    violations = {}
    for py_file in _python_sources_under(routes_dir):
        bad = _imports_db_session(py_file)
        if bad:
            violations[str(py_file.relative_to(ROOT))] = bad

    assert not violations, (
        "Boundary module(s) import the DB session directly -- "
        "persistence must live only in app/repositories/ (T26):\n"
        + "\n".join(f"  {f}: {v}" for f, v in violations.items())
    )


def test_T26_repository_module_exists():
    """T26 (companion): app/repositories/ must exist as the sole ORM owner."""
    repo_dir = APP_DIR / "repositories"
    assert repo_dir.exists() and repo_dir.is_dir(), (
        "app/repositories/ does not exist; "
        "the repository layer (sole ORM/session owner) has not been created"
    )
