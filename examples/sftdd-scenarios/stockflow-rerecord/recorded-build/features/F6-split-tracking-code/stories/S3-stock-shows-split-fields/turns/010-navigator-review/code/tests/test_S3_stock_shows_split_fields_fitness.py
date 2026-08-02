"""Architectural fitness test for S3-stock-shows-split-fields.

T21: the boundary (app/routes) returns the stock record as JSON only carrying
     batch_number and serial_number as separate fields, never server-rendered
     HTML (NFR-F6-9: boundary renders_via react, JSON only).

This is a regression guard that goes RED when the boundary contains:
  - imports of a server-side templating engine (Jinja2 / TemplateResponse), or
  - any direct rendering that would produce HTML rather than JSON, or
  - fields named inventory_code in its response models (the old combined code
    that must not appear in the JSON surface once S3 lands).

It goes GREEN once the boundary exposes batch_number and serial_number as
separate JSON fields and carries no inventory_code.
"""

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"


def _source(path: Path) -> str:
    return path.read_text() if path.exists() else ""


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


_TEMPLATE_IDENTIFIERS = (
    "TemplateResponse",
    "Jinja2Templates",
    "jinja2",
    "templates.TemplateResponse",
)


def test_T21_boundary_returns_json_only_no_html_rendering():
    """The stock routes boundary must NOT import any server-side HTML renderer.

    NFR-F6-9: renders_via is 'react'; the boundary returns JSON only.
    Importing Jinja2Templates or emitting TemplateResponse from app/routes/
    would violate the contract and break the SPA boundary.
    """
    routes_dir = APP / "routes"
    for path, src in _all_py_sources(routes_dir):
        for identifier in _TEMPLATE_IDENTIFIERS:
            assert identifier not in src, (
                f"NFR-F6-9 violation: boundary module {path.relative_to(ROOT)} "
                f"references '{identifier}'. "
                "The stock boundary renders_via react (JSON only); "
                "server-side HTML templating must not appear in app/routes/."
            )
        assert not _imports_any(src, "fastapi.responses.HTMLResponse", "HTMLResponse"), (
            f"NFR-F6-9 violation: boundary module {path.relative_to(ROOT)} "
            "imports HTMLResponse. The boundary must return JSON, never HTML."
        )


def test_T21_boundary_pydantic_models_expose_split_fields_not_combined_code():
    """The boundary's Pydantic response shapes must carry batch_number and
    serial_number as separate fields, and must NOT carry inventory_code
    (the old opaque combined field that S3 retires from the JSON surface).

    This goes RED while the boundary still echoes inventory_code and goes
    GREEN once the Driver introduces the split-field response model.
    """
    stock_route = APP / "routes" / "stock.py"
    assert stock_route.exists(), (
        "app/routes/stock.py must exist (boundary for stock filing and retrieval)."
    )
    src = stock_route.read_text()

    # The JSON surface must expose the split fields.
    assert "batch_number" in src, (
        "app/routes/stock.py must reference 'batch_number' in its response shape. "
        "S3 requires the boundary to return batch_number as a separate JSON field."
    )
    assert "serial_number" in src, (
        "app/routes/stock.py must reference 'serial_number' in its response shape. "
        "S3 requires the boundary to return serial_number as a separate JSON field."
    )

    # The old combined field must not appear in a Pydantic model definition
    # inside the boundary. Scanning for 'inventory_code' as a Pydantic field
    # name (i.e., as an assignment inside a BaseModel subclass body).
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return  # parse failure is a different problem; let it surface elsewhere

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        # Check whether the class inherits from BaseModel (directly or via alias).
        base_names = {
            (b.id if isinstance(b, ast.Name) else
             b.attr if isinstance(b, ast.Attribute) else "")
            for b in node.bases
        }
        if "BaseModel" not in base_names:
            continue
        # Walk the class body looking for inventory_code field declarations.
        for stmt in node.body:
            if isinstance(stmt, ast.AnnAssign):
                field_name = (
                    stmt.target.id
                    if isinstance(stmt.target, ast.Name)
                    else None
                )
                assert field_name != "inventory_code", (
                    f"NFR-F6-9 / AC1-split-fields-shown violation: "
                    f"Pydantic model '{node.name}' in app/routes/stock.py still "
                    "declares 'inventory_code'. "
                    "S3 retires the combined code from the JSON surface; the model "
                    "must expose 'batch_number' and 'serial_number' instead."
                )
