"""Fitness / invariant tests for S1-split-columns-migration.

T2  -- layering contract: boundary + service must not import DB session
T3  -- config-in-env: Alembic reads DATABASE_URL from env, does not rename databricks_postgres
T4  -- real-DB contract: migration integration suite uses no mock/in-memory DB
T5  -- nullable columns: NULL batch_number + serial_number are accepted (PI1)
T9  -- ordering: backfill executes before the inventory_code drop (NFR-F6-6)
T10 -- data preservation: all seeded rows survive the migration (NFR-F6-1)
T12 -- unique key survives: (sku, location) uniqueness still enforced after migration (PI2)
T13 -- nonconforming count probe: scoped delta never absolute total (NFR-F6-5)
T14 -- reversible migration round-trip (@pytest.mark.migration, PI3)
"""

import ast
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
TESTS = ROOT / "tests"
ALEMBIC_INI = str(ROOT / "alembic.ini")
ALEMBIC_ENV = ROOT / "alembic" / "env.py"
ALEMBIC_VERSIONS = ROOT / "alembic" / "versions"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_sku() -> str:
    return f"SKU-{uuid.uuid4().hex[:12]}"


def _make_loc() -> str:
    return f"LOC-{uuid.uuid4().hex[:8]}"


def _alembic_cfg():
    from alembic.config import Config
    return Config(ALEMBIC_INI)


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


def _cleanup(session, sku: str, location: str) -> None:
    try:
        session.execute(
            sa.text("DELETE FROM stock_records WHERE sku = :sku AND location = :location"),
            {"sku": sku, "location": location},
        )
        session.commit()
    except Exception:
        session.rollback()


# ---------------------------------------------------------------------------
# T2: boundary + service must NOT import the DB session (layering contract)
# ---------------------------------------------------------------------------

_SESSION_IDENTIFIERS = ("SessionLocal", "Session", "get_db", "database")


def test_T2_boundary_and_service_do_not_import_db_session():
    """app/routes and app/services must not import Session/SessionLocal/get_db."""
    violations = []
    for layer in ("routes", "services"):
        for path, src in _all_py_sources(APP / layer):
            if _imports_any(src, *_SESSION_IDENTIFIERS):
                violations.append(str(path.relative_to(ROOT)))
    assert not violations, (
        f"Layering violation: boundary/service modules import the DB session: {violations}. "
        "The session must only be used in app/repositories/."
    )


# ---------------------------------------------------------------------------
# T3: Alembic reads DATABASE_URL from env; must not rename databricks_postgres
# ---------------------------------------------------------------------------

def test_T3_alembic_reads_database_url_from_env_no_hardcoded_dsn():
    """alembic/env.py must source the URL from DATABASE_URL and not hard-code a rename."""
    assert ALEMBIC_ENV.exists(), "alembic/env.py not found"
    src = ALEMBIC_ENV.read_text()
    assert "DATABASE_URL" in src, (
        "alembic/env.py must read DATABASE_URL from the environment (NFR-F6-7)."
    )
    hardcoded = ["postgresql://", "postgresql+psycopg://", "postgres://"]
    for pattern in hardcoded:
        assert pattern not in src, (
            f"alembic/env.py contains a hardcoded connection string '{pattern}' (NFR-F6-7)."
        )


def test_T3_alembic_does_not_rename_databricks_postgres():
    """No migration script may rename the 'databricks_postgres' database."""
    for path in ALEMBIC_VERSIONS.rglob("*.py"):
        src = path.read_text()
        assert "ALTER DATABASE" not in src.upper() or "databricks_postgres" not in src, (
            f"{path.name} appears to rename the database (NFR-F6-7). "
            "The database name comes from the environment; migrations must not rename it."
        )


# ---------------------------------------------------------------------------
# T4: migration tests use no in-memory / mock DB -- real branch only
# ---------------------------------------------------------------------------

_MOCK_PATTERNS = (
    "sqlite://",
    "sqlite+",
    ":memory:",
    "MagicMock",
    "Mock(",
    "patch(",
    "create_engine(\"sqlite",
    "create_engine('sqlite",
)


def test_T4_migration_tests_use_no_mock_or_in_memory_db():
    """All migration-related test files must not reference sqlite/mock/in-memory DB.

    Checks conftest.py and step_defs migration files; excludes this file itself
    (which defines the pattern constants) from the scan.
    """
    this_file = Path(__file__).resolve()
    candidate_paths = (
        [TESTS / "conftest.py"]
        + list((TESTS / "step_defs").rglob("*split*"))
        + list((TESTS / "step_defs").rglob("*migration*"))
    )
    checked = 0
    for path in candidate_paths:
        if not path.exists() or path.resolve() == this_file:
            continue
        src = path.read_text()
        for pattern in _MOCK_PATTERNS:
            assert pattern not in src, (
                f"{path.name} contains '{pattern}' -- migration tests must use the real "
                "Lakebase branch DB only (NFR-F6-3)."
            )
        checked += 1
    # conftest.py must exist and must wire SessionLocal (real DB).
    conftest = TESTS / "conftest.py"
    assert conftest.exists(), "tests/conftest.py missing -- migration test infrastructure absent"
    conftest_src = conftest.read_text()
    assert "SessionLocal" in conftest_src or "DATABASE_URL" in conftest_src, (
        "tests/conftest.py must wire a real DB session via SessionLocal/DATABASE_URL (NFR-F6-3)."
    )


# ---------------------------------------------------------------------------
# T5: NULL batch_number + NULL serial_number are accepted (PI1)
# ---------------------------------------------------------------------------

def test_T5_nullable_batch_serial_columns_accept_null():
    """After the migration, inserting a row with NULL batch_number and serial_number succeeds."""
    from alembic import command
    command.upgrade(_alembic_cfg(), "head")

    sku = _make_sku()
    loc = _make_loc()
    session = SessionLocal()
    try:
        session.execute(
            sa.text(
                "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :loc, 1, NULL, NULL)"
            ),
            {"sku": sku, "loc": loc},
        )
        session.commit()
        row = session.execute(
            sa.text(
                "SELECT batch_number, serial_number FROM stock_records "
                "WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": loc},
        ).fetchone()
        assert row is not None, "Inserted row not found"
        assert row[0] is None, f"batch_number expected NULL, got {row[0]!r}"
        assert row[1] is None, f"serial_number expected NULL, got {row[1]!r}"
    finally:
        _cleanup(session, sku, loc)
        session.close()


# ---------------------------------------------------------------------------
# T9: migration script ordering -- backfill before drop (NFR-F6-6)
# ---------------------------------------------------------------------------

def test_T9_migration_backfill_before_drop_ordering():
    """The split migration must add+backfill batch/serial BEFORE dropping inventory_code."""
    # Find the split migration file by searching for 'batch_number' addition.
    split_migration = None
    for path in ALEMBIC_VERSIONS.rglob("*.py"):
        src = path.read_text()
        if "batch_number" in src and ("drop_column" in src or "drop_table" in src):
            split_migration = path
            break
    assert split_migration is not None, (
        "No split migration file found that adds batch_number and drops inventory_code. "
        "The Driver must create alembic/versions/<rev>_split_tracking_code.py."
    )
    src = split_migration.read_text()
    # The add_column for batch_number must appear before any drop_column for inventory_code.
    add_pos = src.find("batch_number")
    drop_pos = src.find("inventory_code")
    # Also look for explicit drop_column("stock_records", "inventory_code")
    drop_col_pos = src.find("drop_column")
    assert add_pos != -1, "batch_number addition not found in split migration"
    assert drop_col_pos != -1, (
        "drop_column not found in split migration -- inventory_code must be dropped"
    )
    assert add_pos < drop_col_pos, (
        f"Ordering violation (NFR-F6-6): batch_number add (pos {add_pos}) must appear "
        f"before drop_column (pos {drop_col_pos}) in the migration script."
    )


# ---------------------------------------------------------------------------
# T10: data preservation -- all seeded rows survive the migration (NFR-F6-1)
# ---------------------------------------------------------------------------

def test_T10_all_seeded_rows_preserved_after_migration():
    """Seed sprint-1-style rows (including nonconforming), run upgrade, verify all survive."""
    from alembic import command

    # Downgrade to before the split so we can seed with inventory_code.
    command.upgrade(_alembic_cfg(), "head")
    command.downgrade(_alembic_cfg(), "-1")

    marker = uuid.uuid4().hex[:8]
    rows = [
        (_make_sku(), _make_loc(), "A12-B7-S001"),   # conforming
        (_make_sku(), _make_loc(), "X-1"),             # nonconforming
        (_make_sku(), _make_loc(), "C99-D4-S002"),    # conforming
        (_make_sku(), _make_loc(), f"BAD-{marker}"),   # nonconforming, marker
    ]

    session = SessionLocal()
    try:
        for sku, loc, code in rows:
            session.execute(
                sa.text(
                    "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                    "VALUES (:sku, :loc, 1, :code)"
                ),
                {"sku": sku, "loc": loc, "code": code},
            )
        session.commit()
        session.close()
        session = None

        # Run the migration.
        command.upgrade(_alembic_cfg(), "head")

        session = SessionLocal()
        for sku, loc, _code in rows:
            row = session.execute(
                sa.text(
                    "SELECT id FROM stock_records WHERE sku = :sku AND location = :loc"
                ),
                {"sku": sku, "loc": loc},
            ).fetchone()
            assert row is not None, (
                f"Row (sku={sku}, loc={loc}) lost after migration -- data preservation failure (NFR-F6-1)."
            )
    finally:
        if session is None:
            session = SessionLocal()
        for sku, loc, _ in rows:
            _cleanup(session, sku, loc)
        session.close()


# ---------------------------------------------------------------------------
# T12: (sku, location) unique key survives the split (PI2)
# ---------------------------------------------------------------------------

def test_T12_sku_location_unique_key_survives_migration():
    """After the migration, inserting duplicate (sku, location) raises IntegrityError."""
    from alembic import command
    command.upgrade(_alembic_cfg(), "head")

    sku = _make_sku()
    loc = _make_loc()
    session = SessionLocal()
    try:
        session.execute(
            sa.text(
                "INSERT INTO stock_records (sku, location, quantity) VALUES (:sku, :loc, 1)"
            ),
            {"sku": sku, "loc": loc},
        )
        session.commit()
        with pytest.raises(IntegrityError):
            session.execute(
                sa.text(
                    "INSERT INTO stock_records (sku, location, quantity) VALUES (:sku, :loc, 2)"
                ),
                {"sku": sku, "loc": loc},
            )
            session.commit()
    finally:
        session.rollback()
        _cleanup(session, sku, loc)
        session.close()


# ---------------------------------------------------------------------------
# T13: nonconforming count probe -- scoped delta (NFR-F6-5)
# ---------------------------------------------------------------------------

def test_T13_nonconforming_count_probe_scoped_to_own_rows():
    """Pre-acceptance probe reports the correct nonconforming count for THIS test's rows only."""
    from alembic import command

    command.upgrade(_alembic_cfg(), "head")
    command.downgrade(_alembic_cfg(), "-1")

    marker = f"PROBE-{uuid.uuid4().hex[:8]}"
    conforming = [
        (_make_sku(), _make_loc(), f"A12-B7-S001"),
        (_make_sku(), _make_loc(), f"C99-D4-S002"),
    ]
    nonconforming = [
        (_make_sku(), _make_loc(), f"X-1"),
        (_make_sku(), _make_loc(), f"BAD"),
        (_make_sku(), _make_loc(), f"ONLY-ONE-SEG"),
    ]
    all_rows = conforming + nonconforming
    all_skus = [r[0] for r in all_rows]
    expected_nonconforming = len(nonconforming)

    session = SessionLocal()
    try:
        for sku, loc, code in all_rows:
            session.execute(
                sa.text(
                    "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                    "VALUES (:sku, :loc, 1, :code)"
                ),
                {"sku": sku, "loc": loc, "code": code},
            )
        session.commit()
        session.close()
        session = None

        # Run the migration (which triggers backfill).
        command.upgrade(_alembic_cfg(), "head")

        session = SessionLocal()
        # Count rows belonging to this test where batch_number IS NULL
        # (indicating nonconforming backfill), scoped by our own SKUs.
        placeholders = ", ".join(f":sku{i}" for i in range(len(all_skus)))
        params = {f"sku{i}": s for i, s in enumerate(all_skus)}
        count_row = session.execute(
            sa.text(
                f"SELECT COUNT(*) FROM stock_records "
                f"WHERE sku IN ({placeholders}) AND batch_number IS NULL"
            ),
            params,
        ).fetchone()
        actual = count_row[0]
        assert actual == expected_nonconforming, (
            f"Nonconforming count for test's own rows: expected {expected_nonconforming}, "
            f"got {actual} (NFR-F6-5). Must use a scoped delta, never an absolute total."
        )
    finally:
        if session is None:
            session = SessionLocal()
        for sku, loc, _ in all_rows:
            _cleanup(session, sku, loc)
        session.close()


# ---------------------------------------------------------------------------
# T14: reversible migration round-trip (@pytest.mark.migration, PI3)
# ---------------------------------------------------------------------------

@pytest.mark.migration
def test_T14_migration_round_trip_restores_prior_schema():
    """Single-step round-trip: downgrade -1 reconstructs inventory_code; upgrade head re-splits."""
    from alembic import command

    cfg = _alembic_cfg()
    # Ensure at head first.
    command.upgrade(cfg, "head")

    # Single-step downgrade (never downgrade base).
    command.downgrade(cfg, "-1")

    session = SessionLocal()
    try:
        cols_after_down = [
            r[0] for r in session.execute(
                sa.text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'stock_records'"
                )
            ).fetchall()
        ]
        # After downgrade: inventory_code must be back; batch/serial must be gone.
        assert "inventory_code" in cols_after_down, (
            f"inventory_code not restored after downgrade -1 (NFR-F6-4). Columns: {cols_after_down}"
        )
        assert "batch_number" not in cols_after_down, (
            f"batch_number still present after downgrade -1 (NFR-F6-4). Columns: {cols_after_down}"
        )
        assert "serial_number" not in cols_after_down, (
            f"serial_number still present after downgrade -1 (NFR-F6-4). Columns: {cols_after_down}"
        )
    finally:
        session.close()

    # Upgrade back to head -- must return to split schema.
    command.upgrade(cfg, "head")

    session = SessionLocal()
    try:
        cols_after_up = [
            r[0] for r in session.execute(
                sa.text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'stock_records'"
                )
            ).fetchall()
        ]
        assert "batch_number" in cols_after_up, (
            f"batch_number missing after re-upgrade (PI3). Columns: {cols_after_up}"
        )
        assert "serial_number" in cols_after_up, (
            f"serial_number missing after re-upgrade (PI3). Columns: {cols_after_up}"
        )
        assert "inventory_code" not in cols_after_up, (
            f"inventory_code still present after re-upgrade (PI3). Columns: {cols_after_up}"
        )
    finally:
        session.close()
