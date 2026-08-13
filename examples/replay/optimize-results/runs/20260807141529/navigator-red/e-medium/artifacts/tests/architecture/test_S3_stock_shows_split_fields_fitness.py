"""Architectural fitness tests for S3-stock-shows-split-fields.

T21 (AC1-split-fields-shown / NFR-F6-9):
    The boundary (app/routes) returns JSON only; it NEVER performs server-side
    rendering (no TemplateResponse / Jinja2Templates / HTMLResponse / inline HTML).
    The React SPA owns all rendering; batch_number and serial_number reach the
    client as separate JSON fields.

    This is a regression guard: the routes module already satisfies this
    constraint from S1 (renders_via react was declared from the start).  Writing
    it here locks the contract for the split-field story so a future refactor
    cannot accidentally introduce a Jinja2 render path for the new fields.
"""

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "app"


# ---------------------------------------------------------------------------
# Helpers (mirrors the pattern in tests/architecture/test_layering.py)
# ---------------------------------------------------------------------------

def _all_py_sources(directory: Path) -> list[tuple[Path, str]]:
    """Yield (path, source) for every .py under *directory*."""
    if not directory.exists():
        return []
    return [(p, p.read_text()) for p in directory.rglob("*.py")]


def _imports_any(source: str, *targets: str) -> bool:
    """Return True when *source* imports any of *targets* (by name or module)."""
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
# T21: boundary returns JSON only — no server-side rendering
# ---------------------------------------------------------------------------

def test_T21_boundary_returns_json_only_no_ssr():
    """app/routes/ must NOT import TemplateResponse, Jinja2Templates, or
    HTMLResponse, and must NOT embed inline HTML strings.

    NFR-F6-9: renders_via=react — the boundary is a pure JSON API; the React
    SPA surfaces batch_number and serial_number as separately labelled fields.
    """
    routes_dir = APP / "routes"
    rendering_identifiers = ("TemplateResponse", "Jinja2Templates", "HTMLResponse")
    violations: list[str] = []

    for path, src in _all_py_sources(routes_dir):
        rel = str(path.relative_to(ROOT))

        # Import-level check.
        if _imports_any(src, *rendering_identifiers):
            violations.append(f"{rel}: imports a server-side rendering construct")

        # Blunt inline-HTML check (catches render() helpers that don't import).
        if "<!DOCTYPE html" in src or "<html" in src:
            violations.append(f"{rel}: contains inline HTML markup")

    assert not violations, (
        "Boundary modules perform server-side rendering — NFR-F6-9 violated.\n"
        "The boundary (app/routes) must return JSON only; the React SPA renders "
        "batch_number and serial_number as split fields.\n"
        f"Violations: {violations}"
    )
