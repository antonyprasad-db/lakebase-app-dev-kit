"""Architectural fitness tests for F6-S3-stock-shows-split-fields.

T21 – the boundary (app/routes) returns JSON only with batch_number and
      serial_number as separate fields and never server-rendered HTML
      (NFR-F6-9: renders_via react, boundary is JSON-only).

Checks:
  1. No TemplateResponse / Jinja2 / HTMLResponse import in app/routes/.
  2. The stock route source declares both 'batch_number' and 'serial_number'
     as distinct response fields (not a combined 'inventory_code').
  3. 'inventory_code' is NOT surfaced as a response field in any route.
"""

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "app"
ROUTES_DIR = APP / "routes"


# ---------------------------------------------------------------------------
# Helpers (kept local so this file is self-contained)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# T21-a: boundary must not import or use any server-side rendering mechanism
# ---------------------------------------------------------------------------

def test_T21_boundary_no_html_rendering():
    """app/routes/ must not import TemplateResponse, Jinja2Templates, or HTMLResponse.

    NFR-F6-9: renders_via react; the boundary is JSON-only.
    """
    rendering_identifiers = ("TemplateResponse", "Jinja2Templates", "HTMLResponse")
    violations: list[str] = []
    for path, src in _all_py_sources(ROUTES_DIR):
        if _imports_any(src, *rendering_identifiers):
            violations.append(str(path.relative_to(ROOT)))
        if "<!DOCTYPE html" in src or "<html" in src:
            violations.append(str(path.relative_to(ROOT)) + " [inline HTML]")
    assert not violations, (
        f"Boundary modules use server-side HTML rendering (NFR-F6-9 violated): {violations}. "
        "The boundary must return JSON only; the React SPA renders the UI."
    )


# ---------------------------------------------------------------------------
# T21-b: stock route exposes batch_number and serial_number as distinct fields
# ---------------------------------------------------------------------------

def test_T21_stock_route_exposes_split_fields():
    """The stock boundary source must reference 'batch_number' and 'serial_number'
    as distinct identifiers, proving the split schema is surfaced to the SPA.

    NFR-F6-9: the boundary carries batch_number and serial_number as separate
    JSON fields so the React SPA can render each independently.
    """
    stock_route = ROUTES_DIR / "stock.py"
    assert stock_route.exists(), (
        f"{stock_route} does not exist; the stock boundary has not been created."
    )
    src = stock_route.read_text()

    assert "batch_number" in src, (
        "app/routes/stock.py does not reference 'batch_number'. "
        "The boundary must surface batch_number as a distinct JSON field (NFR-F6-9)."
    )
    assert "serial_number" in src, (
        "app/routes/stock.py does not reference 'serial_number'. "
        "The boundary must surface serial_number as a distinct JSON field (NFR-F6-9)."
    )


# ---------------------------------------------------------------------------
# T21-c: the combined inventory_code must NOT be surfaced by the boundary
# ---------------------------------------------------------------------------

def test_T21_stock_route_does_not_surface_combined_code():
    """app/routes/stock.py must not expose 'inventory_code' as a response field.

    After the split migration the combined column is dropped; the boundary
    must never re-combine or re-expose it (NFR-F6-9).
    """
    stock_route = ROUTES_DIR / "stock.py"
    if not stock_route.exists():
        # If the file doesn't exist yet this test would be vacuously true;
        # the existence check in T21-b already catches that case.
        return

    src = stock_route.read_text()

    # 'inventory_code' should not appear in the route response schema or
    # in any dict/key returned from the boundary layer.
    assert "inventory_code" not in src, (
        "app/routes/stock.py references 'inventory_code'. "
        "The boundary must not surface the dropped combined column; "
        "only batch_number and serial_number are the split tracking fields (NFR-F6-9)."
    )
