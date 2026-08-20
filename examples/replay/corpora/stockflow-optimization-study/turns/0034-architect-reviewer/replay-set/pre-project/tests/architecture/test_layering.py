"""Architectural fitness tests for S1-file-stock-record (T1-T8, T12).

T1  – boundary (app/routes/) does not import the DB session object
T2  – service layer (app/services/) contains no ORM imports
T3  – boundary layer (app/routes/) contains no ORM imports
T4  – DB connection config read exclusively from environment variables
T5  – migration round-trip recreates stock_records with all PI constraints  [migration]
T6  – NOT NULL constraint: NULL sku/location/quantity raises IntegrityError
T7  – unique constraint: duplicate (sku, location) raises IntegrityError
T8  – CHECK constraint: negative quantity raises IntegrityError
T12 – service layer rejects negative quantity before reaching the repository
"""

import ast
import re
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

ROOT = Path(__file__).resolve().parents[2]


# ── Static-analysis helpers ──────────────────────────────────────────────────


def _iter_import_modules(directory: Path):
    """Yield the module string for every import/import-from node in directory."""
    if not directory.exists():
        return
    for pyfile in directory.rglob("*.py"):
        tree = ast.parse(pyfile.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                yield node.module or ""
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    yield alias.name


def _iter_importfrom_names(directory: Path):
    """Yield (module, [names]) for every `from module import name` in directory."""
    if not directory.exists():
        return
    for pyfile in directory.rglob("*.py"):
        tree = ast.parse(pyfile.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                yield (node.module or "", [a.name for a in node.names])


# ── T1: boundary does not import the DB session ──────────────────────────────

_SESSION_SYMBOLS = {"SessionLocal", "get_db", "Session", "db"}


def test_T1_routes_do_not_import_db_session():
    """T1: app/routes/ must not import the database session object."""
    routes_dir = ROOT / "app" / "routes"
    violations = []
    for module, names in _iter_importfrom_names(routes_dir):
        if "database" in module or "db" in module:
            bad = _SESSION_SYMBOLS & set(names)
            if bad:
                violations.append(f"{module!r} → {bad}")
    assert not violations, (
        "app/routes/ imports DB session symbols (boundary must delegate to service): "
        + "; ".join(violations)
    )


# ── T2: service layer contains no ORM imports ────────────────────────────────


def test_T2_services_contain_no_orm_imports():
    """T2: app/services/ must not import SQLAlchemy ORM modules."""
    services_dir = ROOT / "app" / "services"
    violations = [
        m for m in _iter_import_modules(services_dir) if m.startswith("sqlalchemy")
    ]
    assert not violations, (
        "app/services/ contains ORM imports (service must stay ORM-free): "
        + str(violations)
    )


# ── T3: boundary layer contains no ORM imports ───────────────────────────────


def test_T3_routes_contain_no_orm_imports():
    """T3: app/routes/ must not import SQLAlchemy ORM modules."""
    routes_dir = ROOT / "app" / "routes"
    violations = [
        m for m in _iter_import_modules(routes_dir) if m.startswith("sqlalchemy")
    ]
    assert not violations, (
        "app/routes/ contains ORM imports (boundary must stay ORM-free): "
        + str(violations)
    )


# ── T4: DB config from environment variables only ────────────────────────────


def test_T4_db_config_read_from_env_vars():
    """T4: database.py reads connection config exclusively from os.getenv()."""
    db_file = ROOT / "app" / "database.py"
    source = db_file.read_text(encoding="utf-8")

    assert "os.getenv" in source, (
        "app/database.py must use os.getenv() to read connection parameters"
    )
    # No hardcoded non-localhost host strings
    hardcoded_hosts = re.findall(
        r'(?:host|HOST)\s*=\s*["\'](?!localhost)[^"\']{5,}["\']', source
    )
    assert not hardcoded_hosts, (
        f"Hardcoded host/HOST value found in app/database.py: {hardcoded_hosts}"
    )
    # No hardcoded passwords
    hardcoded_passwords = re.findall(
        r'(?:password|PASSWORD|passwd)\s*=\s*["\'][^"\']{3,}["\']', source
    )
    assert not hardcoded_passwords, (
        f"Hardcoded password found in app/database.py: {hardcoded_passwords}"
    )


# ── T5: migration round-trip recreates stock_records with all PI constraints ─


@pytest.mark.migration
def test_T5_migration_recreates_table_after_round_trip():
    """T5: downgrade -1 then upgrade head recreates stock_records with PI1/PI2/PI3."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect as sa_inspect
    from sqlalchemy.pool import NullPool

    from app.database import SessionLocal, make_engine

    ini = str(ROOT / "alembic.ini")
    cfg = Config(ini)

    # Round-trip: drop (downgrade -1) then recreate (upgrade head)
    command.downgrade(cfg, "-1")
    command.upgrade(cfg, "head")

    # --- Schema-recreation assertions (NOT data survival) ---
    engine = make_engine(poolclass=NullPool)
    try:
        inspector = sa_inspect(engine)
        assert inspector.has_table("stock_records"), (
            "stock_records must exist after `upgrade head` following `downgrade -1`"
        )
        col_names = {c["name"] for c in inspector.get_columns("stock_records")}
        for required_col in ("sku", "location", "quantity"):
            assert required_col in col_names, (
                f"Column {required_col!r} must be present in stock_records after round-trip"
            )
    finally:
        engine.dispose()

    # PI2 – NOT NULL: inserting NULL sku must fail
    session = SessionLocal()
    try:
        with pytest.raises(IntegrityError, match=""):
            session.execute(
                text(
                    "INSERT INTO stock_records (sku, location, quantity)"
                    " VALUES (NULL, 'LOC-T5', 1)"
                )
            )
            session.commit()
        session.rollback()

        # PI3 – CHECK quantity >= 0: negative quantity must fail
        with pytest.raises(IntegrityError):
            session.execute(
                text(
                    "INSERT INTO stock_records (sku, location, quantity)"
                    " VALUES ('SKU-T5', 'LOC-T5', -1)"
                )
            )
            session.commit()
        session.rollback()

        # PI1 – unique (sku, location): duplicate pair must fail
        sku = f"SKU-T5-{uuid.uuid4()}"
        loc = f"LOC-T5-{uuid.uuid4()}"
        session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity)"
                " VALUES (:sku, :loc, 5)"
            ),
            {"sku": sku, "loc": loc},
        )
        session.commit()
        with pytest.raises(IntegrityError):
            session.execute(
                text(
                    "INSERT INTO stock_records (sku, location, quantity)"
                    " VALUES (:sku, :loc, 10)"
                ),
                {"sku": sku, "loc": loc},
            )
            session.commit()
        session.rollback()
    finally:
        session.close()


# ── T6: NOT NULL constraint on sku, location, quantity ───────────────────────


def test_T6_null_required_columns_raise_not_null(db_session):
    """T6: inserting NULL into sku, location, or quantity raises IntegrityError."""
    uid = str(uuid.uuid4())[:8]

    # NULL sku
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, tracking_code)"
                " VALUES (NULL, :loc, 10, 'TC')"
            ),
            {"loc": f"LOC-T6-{uid}"},
        )
        db_session.commit()
    db_session.rollback()

    # NULL location
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, tracking_code)"
                " VALUES (:sku, NULL, 10, 'TC')"
            ),
            {"sku": f"SKU-T6-{uid}"},
        )
        db_session.commit()
    db_session.rollback()

    # NULL quantity
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, tracking_code)"
                " VALUES (:sku, :loc, NULL, 'TC')"
            ),
            {"sku": f"SKU-T6-{uid}-q", "loc": f"LOC-T6-{uid}-q"},
        )
        db_session.commit()
    db_session.rollback()


# ── T7: unique constraint on (sku, location) ─────────────────────────────────


def test_T7_duplicate_sku_location_raises_unique_violation(db_session):
    """T7: inserting two rows with the same (sku, location) raises IntegrityError."""
    sku = f"SKU-T7-{uuid.uuid4()}"
    loc = f"LOC-T7-{uuid.uuid4()}"

    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, tracking_code)"
            " VALUES (:sku, :loc, 10, 'TC-FIRST')"
        ),
        {"sku": sku, "loc": loc},
    )
    db_session.commit()

    try:
        with pytest.raises(IntegrityError):
            db_session.execute(
                text(
                    "INSERT INTO stock_records (sku, location, quantity, tracking_code)"
                    " VALUES (:sku, :loc, 20, 'TC-SECOND')"
                ),
                {"sku": sku, "loc": loc},
            )
            db_session.commit()
        db_session.rollback()
    finally:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku}
        )
        db_session.commit()


# ── T8: CHECK constraint quantity >= 0 ───────────────────────────────────────


def test_T8_negative_quantity_raises_check_violation(db_session):
    """T8: inserting a row with quantity < 0 raises IntegrityError (PI3 CHECK)."""
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, tracking_code)"
                " VALUES (:sku, :loc, -1, 'TC')"
            ),
            {"sku": f"SKU-T8-{uuid.uuid4()}", "loc": f"LOC-T8-{uuid.uuid4()}"},
        )
        db_session.commit()
    db_session.rollback()


# ── T12: service layer rejects negative quantity before the repository ────────


def test_T12_service_rejects_negative_quantity_before_repository():
    """T12: app/services/stock.file_stock_record raises before calling the repository."""
    # ImportError here is a valid RED: the service module does not yet exist.
    from app.services.stock import file_stock_record  # noqa: PLC0415

    call_log: list = []

    class SpyRepository:
        def upsert(self, sku, location, quantity, tracking_code):
            call_log.append(("upsert", sku, location, quantity, tracking_code))

    with pytest.raises(Exception):
        file_stock_record(
            sku="SKU-T12",
            location="LOC-T12",
            quantity=-5,
            tracking_code="TC-T12",
            repository=SpyRepository(),
        )

    assert not call_log, (
        "The repository must not be called when quantity is negative; "
        f"got calls: {call_log}"
    )
