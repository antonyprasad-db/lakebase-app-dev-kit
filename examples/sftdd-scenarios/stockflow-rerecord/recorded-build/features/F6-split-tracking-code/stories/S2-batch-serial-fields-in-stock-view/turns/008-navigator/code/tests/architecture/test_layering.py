"""Architectural fitness tests for F1-stock-visibility (S1-file-stock-record).

T6  - boundary does NOT import the DB session; repository is the sole ORM owner.
T7  - stock boundary returns JSON, never server-rendered HTML.
T8  - DATABASE_URL is sourced from the environment; no hard-coded connection string;
      database name is databricks_postgres.
T9  - inserting duplicate (sku, location) raises an IntegrityError (PI1).
T10 - inserting a row missing a NOT NULL field raises an IntegrityError (PI2).
T11 - inserting a row with quantity < 0 raises an IntegrityError (PI3).
T12 - migration down-then-up round-trip succeeds (PI4, reversibility).
"""

import ast
import importlib.util
import os
import re
from pathlib import Path

import pytest
import sqlalchemy
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
APP_DIR = ROOT / "app"


# ---------------------------------------------------------------------------
# T6 - boundary does NOT import the DB session
# ---------------------------------------------------------------------------


def _python_sources_under(directory: Path):
    return list(directory.rglob("*.py"))


def _imports_db_session(source_path: Path) -> list[str]:
    """Return a list of offending import strings if the file imports the DB session."""
    try:
        tree = ast.parse(source_path.read_text(encoding="utf-8"))
    except SyntaxError:
        return []

    offences = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            src = ast.unparse(node)
            # The patterns that indicate direct session access in a boundary module.
            if re.search(r"\b(SessionLocal|get_db|Session)\b", src) and re.search(
                r"\b(database|db)\b", src
            ):
                offences.append(src)
    return offences


def test_T6_boundary_does_not_import_db_session():
    """T6: app/routes/ must not import the DB session (only the repository may)."""
    routes_dir = APP_DIR / "routes"
    if not routes_dir.exists():
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
        "persistence must live only in app/repositories/:\n"
        + "\n".join(f"  {f}: {v}" for f, v in violations.items())
    )


def test_T6_repository_module_exists():
    """T6 (companion): app/repositories/ must exist as the sole ORM owner."""
    repo_dir = APP_DIR / "repositories"
    assert repo_dir.exists() and repo_dir.is_dir(), (
        "app/repositories/ does not exist; "
        "the repository layer (sole ORM/session owner) has not been created"
    )


# ---------------------------------------------------------------------------
# T7 - stock boundary returns JSON, not HTML
# ---------------------------------------------------------------------------


def test_T7_stock_boundary_returns_json_not_html():
    """T7: POST /api/stock returns a JSON payload (Content-Type: application/json),
    never server-rendered HTML. Validates with a well-formed payload; a 404 from a
    missing route is also a failure (the route does not exist yet).
    """
    from app.main import app  # noqa: PLC0415

    client = TestClient(app)
    resp = client.post(
        "/api/stock",
        json={
            "sku": "fitness-sku-t7",
            "location": "BIN-T7",
            "quantity": 1,
        },
    )
    # The route must exist (not 404) and must not return HTML.
    assert resp.status_code != 404, (
        "POST /api/stock returned 404 -- the boundary route has not been created"
    )
    content_type = resp.headers.get("content-type", "")
    assert "text/html" not in content_type, (
        f"Boundary returned HTML (Content-Type: {content_type}); "
        "the stock boundary must return JSON (renders_via: react)"
    )
    assert "application/json" in content_type, (
        f"Boundary Content-Type is '{content_type}'; expected application/json"
    )


# ---------------------------------------------------------------------------
# T8 - DATABASE_URL from environment; no hard-coded connection string; DB name fixed
# ---------------------------------------------------------------------------


def test_T8_database_url_sourced_from_environment():
    """T8: app/database.py reads DATABASE_URL from the environment, not hard-coded."""
    database_py = APP_DIR / "database.py"
    assert database_py.exists(), "app/database.py not found"

    source = database_py.read_text(encoding="utf-8")

    # DATABASE_URL must be read from the environment (os.getenv or os.environ).
    assert re.search(r'os\.(getenv|environ)', source), (
        "app/database.py does not read from os.getenv / os.environ; "
        "DATABASE_URL must be sourced from the environment"
    )

    # The string 'DATABASE_URL' must appear as the env var key being read.
    assert "DATABASE_URL" in source, (
        "DATABASE_URL is not referenced in app/database.py; "
        "the connection must be configured via this env var"
    )


def test_T8_database_name_is_databricks_postgres():
    """T8: The database name must stay databricks_postgres; it must not be renamed."""
    database_py = APP_DIR / "database.py"
    source = database_py.read_text(encoding="utf-8")

    # The fixed default DB name must appear literally in the source.
    assert "databricks_postgres" in source, (
        "app/database.py does not reference 'databricks_postgres'; "
        "the database name must remain databricks_postgres (NFR7)"
    )

    # There must be no hard-coded postgresql:// URL that embeds a different DB name.
    # We look for a literal connection string that is NOT referencing databricks_postgres.
    hard_coded = re.findall(
        r'(postgresql(?:\+\w+)?://[^\s\'"]+)', source
    )
    for url in hard_coded:
        if "%" not in url and "{" not in url:  # skip f-string templates
            assert "databricks_postgres" in url or url.endswith("/"), (
                f"Hard-coded connection string found with wrong DB name: {url}"
            )


def test_T8_no_hard_coded_full_connection_string():
    """T8: app/database.py must not hard-code a full connection string with credentials."""
    database_py = APP_DIR / "database.py"
    source = database_py.read_text(encoding="utf-8")

    # A hard-coded password in a URL would look like postgresql://user:password@host
    hard_coded_creds = re.findall(
        r'postgresql(?:\+\w+)?://[^{%\s\'"]*:[^{%@\s\'"]+@', source
    )
    assert not hard_coded_creds, (
        f"Hard-coded credentials found in app/database.py: {hard_coded_creds}; "
        "all credentials must come from the environment"
    )


# ---------------------------------------------------------------------------
# T9 - duplicate (sku, location) raises IntegrityError (PI1)
# ---------------------------------------------------------------------------


def test_T9_unique_constraint_sku_location(db_session):
    """T9: Inserting two stock_records rows with the same (sku, location) raises
    an IntegrityError, verifying the composite unique constraint PI1."""
    import uuid as _uuid

    sku = f"pi1-sku-{_uuid.uuid4().hex[:8]}"
    loc = "BIN-PI1"

    db_session.execute(
        sqlalchemy.text(
            "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": sku, "loc": loc},
    )
    db_session.commit()

    db_session.execute(
        sqlalchemy.text(
            "INSERT INTO stock_records (sku, location, quantity) "
            "VALUES (:sku, :loc, :qty)"
        ),
        {"sku": sku, "loc": loc, "qty": 1},
    )
    db_session.commit()

    with pytest.raises(Exception) as exc_info:
        db_session.execute(
            sqlalchemy.text(
                "INSERT INTO stock_records (sku, location, quantity) "
                "VALUES (:sku, :loc, :qty)"
            ),
            {"sku": sku, "loc": loc, "qty": 2},
        )
        db_session.commit()

    db_session.rollback()
    exc_str = str(exc_info.value).lower()
    assert any(kw in exc_str for kw in ("unique", "duplicate", "integrity", "violat")), (
        f"Expected a unique-constraint IntegrityError, got: {exc_info.value}"
    )


# ---------------------------------------------------------------------------
# T10 - NOT NULL constraint rejects rows missing core fields (PI2)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "missing_field,insert_kwargs",
    [
        (
            "sku",
            {"loc": "BIN-PI2", "qty": 1},
        ),
        (
            "location",
            {"sku": "pi2-loc-missing", "qty": 1},
        ),
        (
            "quantity",
            {"sku": "pi2-qty-missing", "loc": "BIN-PI2"},
        ),
    ],
)
def test_T10_not_null_constraint(db_session, missing_field, insert_kwargs):
    """T10: Inserting a stock_records row missing any core field is rejected by
    a NOT NULL constraint (PI2)."""
    import uuid as _uuid

    # Make SKU unique per run to avoid leftover conflicts.
    if "sku" in insert_kwargs:
        insert_kwargs["sku"] = f"{insert_kwargs['sku']}-{_uuid.uuid4().hex[:8]}"

    # Build the INSERT with only the provided columns.
    col_map = {"sku": "sku", "loc": "location", "qty": "quantity"}
    cols = ", ".join(col_map[k] for k in insert_kwargs)
    params = ", ".join(f":{k}" for k in insert_kwargs)
    sql = f"INSERT INTO stock_records ({cols}) VALUES ({params})"

    with pytest.raises(Exception) as exc_info:
        db_session.execute(sqlalchemy.text(sql), insert_kwargs)
        db_session.commit()

    db_session.rollback()
    exc_str = str(exc_info.value).lower()
    assert any(
        kw in exc_str
        for kw in ("not null", "null value", "violat", "integrity", "notnull")
    ), (
        f"Expected NOT NULL constraint violation for missing '{missing_field}', "
        f"got: {exc_info.value}"
    )


# ---------------------------------------------------------------------------
# T11 - CHECK (quantity >= 0) rejects negative values (PI3)
# ---------------------------------------------------------------------------


def test_T11_check_quantity_non_negative(db_session):
    """T11: Inserting a stock_records row with quantity < 0 is rejected by the
    CHECK (quantity >= 0) constraint (PI3)."""
    import uuid as _uuid

    sku = f"pi3-sku-{_uuid.uuid4().hex[:8]}"

    with pytest.raises(Exception) as exc_info:
        db_session.execute(
            sqlalchemy.text(
                "INSERT INTO stock_records (sku, location, quantity) "
                "VALUES (:sku, :loc, :qty)"
            ),
            {"sku": sku, "loc": "BIN-PI3", "qty": -1},
        )
        db_session.commit()

    db_session.rollback()
    exc_str = str(exc_info.value).lower()
    assert any(
        kw in exc_str
        for kw in ("check", "violat", "integrity", "constraint")
    ), (
        f"Expected CHECK constraint violation for quantity=-1, got: {exc_info.value}"
    )


# ---------------------------------------------------------------------------
# T12 - migration down-then-up round-trip (PI4 reversibility)
# ---------------------------------------------------------------------------


@pytest.mark.migration
def test_T12_migration_reversible():
    """T12: A single-step downgrade (-1) then upgrade (head) of the stock_records
    create_table migration succeeds, verifying PI4 (reversible downgrade).

    Marked @pytest.mark.migration so the verify harness runs this on its own
    isolated ephemeral branch, never against the shared verify DB.
    """
    from pathlib import Path as _Path

    from alembic import command as alembic_command
    from alembic.config import Config as AlembicConfig

    ini_path = str(_Path(__file__).resolve().parents[2] / "alembic.ini")
    cfg = AlembicConfig(ini_path)

    # Step 1: downgrade one step (must not raise)
    alembic_command.downgrade(cfg, "-1")

    # Step 2: upgrade back to head (must not raise)
    alembic_command.upgrade(cfg, "head")
