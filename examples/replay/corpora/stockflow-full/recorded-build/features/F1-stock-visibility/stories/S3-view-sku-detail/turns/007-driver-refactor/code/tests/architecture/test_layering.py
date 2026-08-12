"""Architectural fitness tests for F1-stock-visibility (T1, T2, T3, T11).

These tests assert the layering contract from architecture.json:
- T1: app/routes/ must NOT import SQLAlchemy Session or ORM constructs.
- T2: app/services/ must NOT import SQLAlchemy Session or ORM constructs.
- T3: DATABASE_URL must be read from the environment, not hardcoded.
- T11: StockService must reject a negative quantity before any DB write.

T12–T15, T19 (DB-constraint and migration fitness) live alongside the
behavior tests in tests/step_defs/ so they share the real-branch DB fixture.
"""
import ast
import importlib
import os
import sys
import textwrap
import types
import uuid
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
APP_DIR = PROJECT_ROOT / "app"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _source_files(package_dir: Path) -> list[Path]:
    """Return all .py files under package_dir (recursive)."""
    if not package_dir.exists():
        return []
    return list(package_dir.rglob("*.py"))


_ORM_TOKENS = {
    "Session",
    "SessionLocal",
    "sessionmaker",
    "scoped_session",
    "create_engine",
    "DeclarativeBase",
    "declarative_base",
}

_ORM_MODULE_PREFIXES = (
    "sqlalchemy.orm",
    "sqlalchemy.ext",
    "app.database",
)


def _imports_orm(source: str) -> list[str]:
    """Return a list of ORM import lines found in source (empty = clean)."""
    violations: list[str] = []
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return violations
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if any(alias.name.startswith(p) for p in _ORM_MODULE_PREFIXES):
                    violations.append(f"import {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if any(module.startswith(p) for p in _ORM_MODULE_PREFIXES):
                names = [a.name for a in node.names]
                violations.append(f"from {module} import {', '.join(names)}")
            # Also flag: `from app.database import Session / SessionLocal / ...`
            if module == "app.database":
                names = [a.name for a in node.names if a.name in _ORM_TOKENS]
                if names:
                    violations.append(f"from app.database import {', '.join(names)}")
    return violations


# ---------------------------------------------------------------------------
# T1 – routes module must NOT import ORM constructs
# ---------------------------------------------------------------------------


def test_routes_module_has_no_orm_imports():
    """T1: app/routes/ contains no import of SQLAlchemy Session or any ORM construct."""
    routes_dir = APP_DIR / "routes"
    files = _source_files(routes_dir)
    # The routes module must exist before this passes; if missing the Driver
    # must create it — which is exactly the failing RED state we want.
    assert files, (
        f"No Python source files found under {routes_dir}. "
        "The routes package (app/routes/) must be created."
    )
    all_violations: dict[str, list[str]] = {}
    for f in files:
        viols = _imports_orm(f.read_text())
        if viols:
            all_violations[str(f.relative_to(PROJECT_ROOT))] = viols
    assert not all_violations, (
        "app/routes/ must not import SQLAlchemy Session or ORM constructs "
        "(architecture layer boundary). Violations:\n"
        + "\n".join(
            f"  {path}: {', '.join(v)}" for path, v in all_violations.items()
        )
    )


# ---------------------------------------------------------------------------
# T2 – services module must NOT import ORM constructs
# ---------------------------------------------------------------------------


def test_services_module_has_no_orm_imports():
    """T2: app/services/ contains no import of SQLAlchemy Session or any ORM construct."""
    services_dir = APP_DIR / "services"
    files = _source_files(services_dir)
    assert files, (
        f"No Python source files found under {services_dir}. "
        "The services package (app/services/) must be created."
    )
    all_violations: dict[str, list[str]] = {}
    for f in files:
        viols = _imports_orm(f.read_text())
        if viols:
            all_violations[str(f.relative_to(PROJECT_ROOT))] = viols
    assert not all_violations, (
        "app/services/ must not import SQLAlchemy Session or ORM constructs "
        "(architecture layer boundary). Violations:\n"
        + "\n".join(
            f"  {path}: {', '.join(v)}" for path, v in all_violations.items()
        )
    )


# ---------------------------------------------------------------------------
# T3 – DATABASE_URL is read from env, not hardcoded
# ---------------------------------------------------------------------------


def test_database_url_is_not_hardcoded():
    """T3: DATABASE_URL must be read from the environment variable; no hardcoded
    connection string anywhere in app/**/*.py."""
    # Patterns that look like a hardcoded URL value (not an env read).
    import re

    hardcoded_re = re.compile(
        r'(?:DATABASE_URL\s*=\s*["\']postgresql)|'
        r'(?:create_engine\s*\(\s*["\']postgresql)',
        re.IGNORECASE,
    )
    violations: list[str] = []
    for py_file in APP_DIR.rglob("*.py"):
        source = py_file.read_text()
        for lineno, line in enumerate(source.splitlines(), start=1):
            if hardcoded_re.search(line):
                violations.append(f"{py_file.relative_to(PROJECT_ROOT)}:{lineno}: {line.strip()}")
    assert not violations, (
        "DATABASE_URL must be read from the environment (os.getenv), "
        "not hardcoded.\nViolations:\n" + "\n".join(violations)
    )


# ---------------------------------------------------------------------------
# T11 – StockService rejects negative quantity before any DB write
# ---------------------------------------------------------------------------


def test_stock_service_rejects_negative_quantity_before_db_write(monkeypatch):
    """T11: StockService raises a validation error for quantity < 0 without
    touching the database (the repository's upsert/save is never called)."""
    # We must be able to import the service module; it does not exist yet → RED.
    try:
        from app.services import stock as stock_service_module  # type: ignore[import]
    except (ImportError, ModuleNotFoundError) as exc:
        pytest.fail(
            f"app.services.stock module not found — Driver must create it. ({exc})"
        )

    # The service must expose a callable that accepts file parameters.
    # Try common names; fail explicitly if none exists.
    service_fn = None
    for name in ("file_stock", "create_or_update_stock", "upsert_stock", "file"):
        fn = getattr(stock_service_module, name, None)
        if callable(fn):
            service_fn = fn
            break
    assert service_fn is not None, (
        "app.services.stock must expose a callable (file_stock / "
        "create_or_update_stock / upsert_stock) for filing a stock record."
    )

    # Patch the repository so any DB write raises AssertionError — proving the
    # service never reaches persistence when quantity < 0.
    write_called = {"called": False}

    def _stub_write(*args, **kwargs):
        write_called["called"] = True
        raise AssertionError("DB write must not be called for invalid input")

    # Monkeypatch the repository module if it exists; otherwise a missing
    # repository still proves the service must raise before attempting a write.
    try:
        import app.repositories.stock as repo_module  # type: ignore[import]
        for attr in dir(repo_module):
            obj = getattr(repo_module, attr)
            if callable(obj) and not attr.startswith("_"):
                monkeypatch.setattr(repo_module, attr, _stub_write)
    except (ImportError, ModuleNotFoundError):
        pass  # Repository doesn't exist yet; service must still reject early.

    with pytest.raises(Exception) as exc_info:
        service_fn(
            sku=f"SKU-{uuid.uuid4().hex[:8]}",
            location=f"LOC-{uuid.uuid4().hex[:6]}",
            quantity=-5,
        )

    assert not write_called["called"], (
        "StockService called the repository before rejecting the negative quantity."
    )
    # The exception must not be the AssertionError from our stub write.
    assert not isinstance(exc_info.value, AssertionError), (
        "StockService called the DB write stub instead of rejecting early."
    )
