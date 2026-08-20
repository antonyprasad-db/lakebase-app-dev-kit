"""Architectural fitness tests for S2-expose-batch-serial-in-api (F6).

T18 – app/routes/ does not import the DB session object directly;
      all data access flows through the service layer
T19 – no hardcoded connection string or credential in any layer touched
      by this story (routes, services, repositories)
T21 – app/services/ contains no ORM or session imports; delegates all
      persistence to app/repositories/
T23 – app/routes/ contains no ORM imports; the repository is the sole
      module that imports and operates the ORM session
T26 – the stock endpoint returns Content-Type application/json (JSON data,
      not server-rendered HTML)

These are regression guards: they assert the layering contract the Driver
must satisfy (and must not break) while implementing S2.
"""
import ast
import re
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]

# ── Static-analysis helpers ───────────────────────────────────────────────────


def _iter_import_modules(directory: Path):
    """Yield the module string for every import node in *directory*."""
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


def _iter_importfrom_names(directory: Path):
    """Yield (module, [names]) for every `from module import name` in directory."""
    if not directory.exists():
        return
    for pyfile in directory.rglob("*.py"):
        tree = ast.parse(pyfile.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                yield (node.module or "", [a.name for a in node.names])


def _source_in_dir(directory: Path) -> str:
    """Concatenate source of every .py file under *directory*."""
    if not directory.exists():
        return ""
    return "\n".join(
        pyfile.read_text(encoding="utf-8") for pyfile in directory.rglob("*.py")
    )


_SESSION_SYMBOLS = {"SessionLocal", "get_db", "Session", "db"}

# ── T18: routes must not import the DB session ────────────────────────────────


def test_T18_routes_do_not_import_db_session_directly():
    """T18: app/routes/ must not import the database session object.

    All data access must flow through the service layer, never bypassing it
    by reaching into the DB session directly from the boundary.
    """
    routes_dir = ROOT / "app" / "routes"
    violations = []
    for module, names in _iter_importfrom_names(routes_dir):
        if "database" in module or "db" in module:
            bad = _SESSION_SYMBOLS & set(names)
            if bad:
                violations.append(f"{module!r} → {bad}")
    assert not violations, (
        "app/routes/ imports DB session symbols; all data access must flow through "
        "the service layer (boundary → service → repository → ORM): "
        + "; ".join(violations)
    )


# ── T19: no hardcoded credentials in any layer touched by this story ──────────


def test_T19_no_hardcoded_credentials_in_any_layer():
    """T19: app/routes/, app/services/, app/repositories/ must contain no
    hardcoded host, password, or connection DSN with credentials.

    The database connection in the stock API path must be resolved exclusively
    from the DATABASE_URL environment variable (or the Lakebase metadata env
    vars); nothing hardcoded anywhere in these layers.
    """
    layers = {
        "routes": ROOT / "app" / "routes",
        "services": ROOT / "app" / "services",
        "repositories": ROOT / "app" / "repositories",
    }
    hardcoded_host = re.compile(
        r'(?:host|HOST)\s*=\s*["\'](?!localhost)[^"\']{5,}["\']'
    )
    hardcoded_pw = re.compile(
        r'(?:password|PASSWORD|passwd)\s*=\s*["\'][^"\']{3,}["\']'
    )
    # A literal DSN that embeds credentials (user:pass@host)
    hardcoded_dsn = re.compile(
        r'postgresql(?:\+psycopg)?://[^@"\s]{3,}@[^"\']{3,}'
    )
    violations = []
    for layer_name, layer_dir in layers.items():
        source = _source_in_dir(layer_dir)
        for pattern, label in [
            (hardcoded_host, "hardcoded host"),
            (hardcoded_pw, "hardcoded password"),
            (hardcoded_dsn, "hardcoded DSN with credentials"),
        ]:
            matches = pattern.findall(source)
            if matches:
                violations.append(f"{layer_name}/{label}: {matches[:2]}")
    assert not violations, (
        "Hardcoded credentials found in layers touched by S2 "
        "(connection must come from DATABASE_URL or Lakebase env vars only): "
        + "; ".join(violations)
    )


# ── T21: services must contain no ORM imports ─────────────────────────────────


def test_T21_services_contain_no_orm_imports():
    """T21: app/services/ must not import SQLAlchemy ORM modules.

    The service layer delegates all persistence to app/repositories/;
    it must hold no SQLAlchemy Session references of its own.
    """
    services_dir = ROOT / "app" / "services"
    violations = [
        m for m in _iter_import_modules(services_dir) if m.startswith("sqlalchemy")
    ]
    assert not violations, (
        "app/services/ contains ORM imports; the service layer must be ORM-free "
        "and delegate all persistence to app/repositories/: " + str(violations)
    )


# ── T23: routes must contain no ORM imports ───────────────────────────────────


def test_T23_routes_contain_no_orm_imports():
    """T23: app/routes/ must not import SQLAlchemy ORM modules.

    The repository is the sole module that imports and operates the ORM
    session; the boundary layer must stay ORM-free.
    """
    routes_dir = ROOT / "app" / "routes"
    violations = [
        m for m in _iter_import_modules(routes_dir) if m.startswith("sqlalchemy")
    ]
    assert not violations, (
        "app/routes/ contains ORM imports; the repository is the sole ORM owner "
        "(boundary must not touch SQLAlchemy directly): " + str(violations)
    )


# ── T26: stock endpoint returns JSON, not HTML ────────────────────────────────


def test_T26_stock_endpoint_returns_json_not_html():
    """T26: GET /api/stock must return Content-Type: application/json.

    The boundary is a JSON API serving a React SPA (renders_via: react);
    it must never return server-rendered HTML.
    """
    from app.main import app  # noqa: PLC0415

    client = TestClient(app)
    resp = client.get("/api/stock")
    assert resp.status_code == 200, (
        f"Expected 200 from GET /api/stock; got {resp.status_code}: {resp.text}"
    )
    content_type = resp.headers.get("content-type", "")
    assert "application/json" in content_type, (
        f"Stock endpoint must return application/json (not HTML); "
        f"got Content-Type: {content_type!r}"
    )
    data = resp.json()
    assert isinstance(data, list), (
        f"Stock endpoint must return a JSON array; got type {type(data).__name__!r}"
    )
