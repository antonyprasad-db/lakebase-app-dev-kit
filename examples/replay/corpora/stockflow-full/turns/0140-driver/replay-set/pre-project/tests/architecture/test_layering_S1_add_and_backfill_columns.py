"""Architectural fitness tests for F6 / S1-add-and-backfill-columns (T4, T5, T6).

T4: app/routes/ imports only from the service layer; no SQLAlchemy Session or
    ORM imports allowed in the boundary module.
T5: app/services/ contains no SQLAlchemy Session or ORM model imports; only
    the repository layer may import from the ORM.
T6: DATABASE_URL is read from the environment variable; it is not hard-coded
    in any application module.
"""
import ast
import re
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
APP_DIR = PROJECT_ROOT / "app"

# ---------------------------------------------------------------------------
# Helpers (identical contract to test_layering.py; kept local so this file is
# self-contained and the F6/S1 fitness guard is independently runnable).
# ---------------------------------------------------------------------------

_ORM_MODULE_PREFIXES = (
    "sqlalchemy.orm",
    "sqlalchemy.ext",
    "app.database",
)

_ORM_TOKENS = {
    "Session",
    "SessionLocal",
    "sessionmaker",
    "scoped_session",
    "create_engine",
    "DeclarativeBase",
    "declarative_base",
}


def _source_files(package_dir: Path) -> list[Path]:
    if not package_dir.exists():
        return []
    return list(package_dir.rglob("*.py"))


def _imports_orm(source: str) -> list[str]:
    """Return ORM import lines found in source (empty list = clean)."""
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
            if module == "app.database":
                names = [a.name for a in node.names if a.name in _ORM_TOKENS]
                if names:
                    violations.append(f"from app.database import {', '.join(names)}")
    return violations


# ---------------------------------------------------------------------------
# T4 – routes boundary must NOT import SQLAlchemy Session or ORM constructs
# ---------------------------------------------------------------------------


def test_T4_routes_module_has_no_orm_imports():
    """T4 [AC1-columns-exist]: app/routes/ imports only from the service layer;
    no SQLAlchemy Session or ORM imports are allowed in the boundary module."""
    routes_dir = APP_DIR / "routes"
    files = _source_files(routes_dir)
    assert files, (
        f"No Python source files found under {routes_dir}. "
        "The routes package (app/routes/) must be created by the Driver."
    )
    violations: dict[str, list[str]] = {}
    for f in files:
        viols = _imports_orm(f.read_text())
        if viols:
            violations[str(f.relative_to(PROJECT_ROOT))] = viols
    assert not violations, (
        "T4 FAIL – app/routes/ must not import SQLAlchemy Session or ORM "
        "constructs (architecture boundary: routes -> service only).\n"
        "Violations:\n"
        + "\n".join(
            f"  {path}: {', '.join(v)}" for path, v in violations.items()
        )
    )


# ---------------------------------------------------------------------------
# T5 – services layer must NOT import SQLAlchemy Session or ORM model imports
# ---------------------------------------------------------------------------


def test_T5_services_module_has_no_orm_imports():
    """T5 [AC1-columns-exist]: app/services/ contains no SQLAlchemy Session or
    ORM model imports; only the repository layer may import from the ORM."""
    services_dir = APP_DIR / "services"
    files = _source_files(services_dir)
    assert files, (
        f"No Python source files found under {services_dir}. "
        "The services package (app/services/) must be created by the Driver."
    )
    violations: dict[str, list[str]] = {}
    for f in files:
        viols = _imports_orm(f.read_text())
        if viols:
            violations[str(f.relative_to(PROJECT_ROOT))] = viols
    assert not violations, (
        "T5 FAIL – app/services/ must not import SQLAlchemy Session or ORM "
        "model constructs (only the repository layer owns the ORM).\n"
        "Violations:\n"
        + "\n".join(
            f"  {path}: {', '.join(v)}" for path, v in violations.items()
        )
    )


# ---------------------------------------------------------------------------
# T6 – DATABASE_URL is read from the environment variable, not hard-coded
# ---------------------------------------------------------------------------

_HARDCODED_DB_URL_RE = re.compile(
    r'(?:DATABASE_URL\s*=\s*["\']postgresql)|'
    r'(?:create_engine\s*\(\s*["\']postgresql)',
    re.IGNORECASE,
)


def test_T6_database_url_is_not_hardcoded():
    """T6 [AC1-columns-exist]: DATABASE_URL is read from the environment
    variable (os.getenv / os.environ); it is not hard-coded in any app module."""
    violations: list[str] = []
    for py_file in APP_DIR.rglob("*.py"):
        source = py_file.read_text()
        for lineno, line in enumerate(source.splitlines(), start=1):
            if _HARDCODED_DB_URL_RE.search(line):
                violations.append(
                    f"{py_file.relative_to(PROJECT_ROOT)}:{lineno}: {line.strip()}"
                )
    assert not violations, (
        "T6 FAIL – DATABASE_URL must be read from the environment (os.getenv), "
        "not hard-coded as a literal connection string.\nViolations:\n"
        + "\n".join(violations)
    )
