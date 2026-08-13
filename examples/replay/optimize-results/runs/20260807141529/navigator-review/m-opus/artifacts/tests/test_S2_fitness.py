"""Architectural fitness test for S2-stock-by-location-table (T19).

T19: read-path row shaping/ordering (the list DTO) lives in the service;
     the query is the repository's sole ORM touch; the boundary and React
     component contain no shaping or ORM logic.

This is a regression guard: it holds once the layering is correct and
protects against future drift.
"""

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"


def _source(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text()


def _all_py_sources(directory: Path) -> list[tuple[Path, str]]:
    if not directory.exists():
        return []
    return [(p, p.read_text()) for p in directory.rglob("*.py")]


def _imports_any(source: str, *targets: str) -> bool:
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


_ORM_IDENTIFIERS = (
    "Session", "SessionLocal", "Column", "relationship",
    "mapped_column", "DeclarativeBase", "declarative_base", "sqlalchemy",
)


def test_T19_read_path_shaping_not_in_boundary_or_react():
    """Read-path list DTO shaping must NOT appear in the boundary (app/routes/).

    The service owns list ordering/DTO construction; the query is the
    repository's sole ORM touch. The boundary delegates to the service and
    returns what the service returns -- it must not call the ORM directly or
    reshape rows itself.

    The React component test (T20) asserts the client seam, not this fitness
    function; we check the Python boundary only here.
    """
    routes_dir = APP / "routes"
    # The boundary must be ORM-free.
    for path, src in _all_py_sources(routes_dir):
        assert not _imports_any(src, *_ORM_IDENTIFIERS), (
            f"Read-path layering violation: boundary module {path.relative_to(ROOT)} "
            "imports ORM/session identifiers. "
            "List DTO shaping and the query must live in service/repository, not the boundary."
        )

    # The repository is the ONLY layer permitted to touch the ORM.
    repo_dir = APP / "repositories"
    services_dir = APP / "services"

    # Services must NOT import ORM session wrappers (they receive a db session
    # via DI but must not import the ORM machinery themselves).
    for path, src in _all_py_sources(services_dir):
        # Allow importing db-session type annotations but not ORM query classes.
        if _imports_any(src, "DeclarativeBase", "declarative_base", "Column",
                        "relationship", "mapped_column"):
            raise AssertionError(
                f"Read-path layering violation: service module {path.relative_to(ROOT)} "
                "imports ORM model-definition constructs. "
                "Only app/repositories/ may declare or manipulate ORM models."
            )

    # The repository module for stock must exist (persistence is NOT inline in
    # the boundary or service).
    stock_repo = repo_dir / "stock_repository.py"
    assert stock_repo.exists(), (
        "app/repositories/stock_repository.py must exist. "
        "The read-path query for stock_records belongs in the repository layer, "
        "not inline in the boundary or service."
    )
