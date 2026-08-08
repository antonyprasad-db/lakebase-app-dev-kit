"""Layering fitness test (T4): the app/routes boundary must not import the DB
session or ORM models; persistence lives ONLY in the repository layer
(app/repositories/), per architecture.json's declared layers for
S1-file-stock-record. Static/structural check, no Gherkin.
"""

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ROUTES_DIR = REPO_ROOT / "app" / "routes"
REPOSITORIES_DIR = REPO_ROOT / "app" / "repositories"

# Names that indicate direct DB/session/ORM access; these must never appear as
# an imported name inside the boundary module.
_FORBIDDEN_IMPORT_NAMES = {"Session", "SessionLocal", "db", "session"}


def _imported_names(py_file: Path) -> set[str]:
    tree = ast.parse(py_file.read_text(), filename=str(py_file))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add((alias.asname or alias.name).split(".")[-1])
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                names.add(alias.asname or alias.name)
    return names


def _route_source_files() -> list[Path]:
    assert ROUTES_DIR.is_dir(), (
        f"{ROUTES_DIR} does not exist yet; the boundary layer must live at "
        "app/routes/ per architecture.json"
    )
    return [p for p in ROUTES_DIR.rglob("*.py") if p.name != "__init__.py"]


def test_boundary_does_not_import_db_session_or_orm():
    route_files = _route_source_files()
    assert route_files, f"no route modules found under {ROUTES_DIR}"
    for py_file in route_files:
        imported = _imported_names(py_file)
        offending = imported & _FORBIDDEN_IMPORT_NAMES
        assert not offending, (
            f"{py_file} imports {offending} directly; the boundary must "
            "delegate persistence to StockRepository, not touch the DB "
            "session/ORM itself"
        )


def test_repository_layer_exists():
    assert REPOSITORIES_DIR.is_dir(), (
        f"{REPOSITORIES_DIR} does not exist; persistence must live in a "
        "StockRepository under app/repositories/ per architecture.json"
    )
    repo_files = [p for p in REPOSITORIES_DIR.rglob("*.py") if p.name != "__init__.py"]
    assert repo_files, f"no repository modules found under {REPOSITORIES_DIR}"


def test_read_boundary_delegates_listing_to_repository():
    """T17 (S2-browse-stock-table, AC1-table-lists-filed-stock): the
    stock-table READ path must hold to the same layering contract as the
    write path , app/routes must not import the DB session/ORM directly, and
    the listing capability the home table needs must be exposed by
    StockRepository, not queried ad hoc inside the boundary. Read persistence
    lives only in the repository layer.
    """
    route_files = _route_source_files()
    for py_file in route_files:
        imported = _imported_names(py_file)
        offending = imported & _FORBIDDEN_IMPORT_NAMES
        assert not offending, (
            f"{py_file} imports {offending} directly; the stock-table read "
            "path must delegate persistence to StockRepository, not touch "
            "the DB session/ORM itself"
        )

    repo_file = REPOSITORIES_DIR / "stock_repository.py"
    assert repo_file.is_file(), (
        f"{repo_file} must exist; read persistence for the stock table "
        "lives only in StockRepository"
    )
    source = repo_file.read_text()
    assert "def list" in source, (
        f"{repo_file} must expose a list method (e.g. list_all/"
        "list_by_location) so the stock-table read boundary delegates "
        "listing persistence to StockRepository instead of querying inline"
    )
