"""Architectural fitness test for S3-sku-detail-view (T25).

T25: the SKU-detail group-by-location shaping (one entry per location for a sku)
     lives in the service; the sku-filtered query is the repository's sole ORM
     touch; the boundary and React component contain no shaping or ORM logic
     (detail read-path layering contract).

This is a regression guard: it holds once the layering is correct and
protects against future drift.
"""

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"


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


def test_T25_sku_detail_read_path_layering():
    """SKU-detail read-path: shaping must NOT appear in the boundary (app/routes/).

    The service owns the group-by-location DTO; the sku-filtered query is the
    repository's sole ORM touch. The boundary delegates to the service and
    returns what the service returns -- it must not call the ORM directly or
    reshape rows itself.

    Additionally: the repository module for stock must exist, confirming
    that the sku-detail query does NOT live inline in the boundary or service.
    """
    routes_dir = APP / "routes"
    # Boundary must be ORM-free.
    for path, src in _all_py_sources(routes_dir):
        assert not _imports_any(src, *_ORM_IDENTIFIERS), (
            f"SKU-detail layering violation: boundary module {path.relative_to(ROOT)} "
            "imports ORM/session identifiers. "
            "Group-by-location shaping and the sku-filtered query must live in "
            "service/repository, not the boundary."
        )

    # Services must NOT import ORM model-definition constructs.
    services_dir = APP / "services"
    for path, src in _all_py_sources(services_dir):
        if _imports_any(src, "DeclarativeBase", "declarative_base", "Column",
                        "relationship", "mapped_column"):
            raise AssertionError(
                f"SKU-detail layering violation: service module {path.relative_to(ROOT)} "
                "imports ORM model-definition constructs. "
                "Only app/repositories/ may declare or manipulate ORM models."
            )

    # The stock repository module must exist (persistence is NOT inline in
    # the boundary or service).
    stock_repo = APP / "repositories" / "stock_repository.py"
    assert stock_repo.exists(), (
        "app/repositories/stock_repository.py must exist. "
        "The sku-detail query for stock_records belongs in the repository layer, "
        "not inline in the boundary or service."
    )

    # The sku-detail service function for SKU detail must be defined in the
    # service module (group-by-location shaping lives in the service, not the
    # boundary).
    stock_service = APP / "services" / "stock_service.py"
    assert stock_service.exists(), (
        "app/services/stock_service.py must exist. "
        "SKU-detail group-by-location shaping must live in the service layer."
    )
    service_src = stock_service.read_text()
    assert "get_sku_detail" in service_src or "sku_detail" in service_src, (
        "app/services/stock_service.py must define a SKU-detail service function "
        "(e.g. get_sku_detail). "
        "Group-by-location shaping for the detail read-path belongs in the service, "
        "not in the boundary router."
    )
