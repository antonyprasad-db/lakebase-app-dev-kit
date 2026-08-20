"""
Migration fitness tests for S1-perform-batch-serial-schema-migration (F6).

T1  – batch_number IS_NULLABLE = YES after up migration
T2  – serial_number IS_NULLABLE = YES after up migration
T3  – well-formed inventory_code → batch_number = 2nd segment
T4  – well-formed inventory_code → serial_number = 3rd segment
T5  – malformed inventory_code → batch_number = NULL (no exception)
T6  – malformed inventory_code → serial_number = NULL (no exception)
T7  – seeded row count delta = 0 (rows scoped to per-run SKUs)
T8  – each seeded row retains its original id
T9  – each seeded row retains its original location
T10 – UNIQUE (sku, location) constraint survives the migration
T12 – no hardcoded connection string in any migration file
T14 – inventory_code column absent after up migration
T15 – schema correct after downgrade -1 then upgrade head  [pytest.mark.migration]
T16 – rows survive a downgrade -1                          [pytest.mark.migration]
"""
import contextlib
import re
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.pool import NullPool

BASE_REVISION = "20260819190000"
PROJECT_ROOT = Path(__file__).resolve().parents[2]


# ── Helpers ────────────────────────────────────────────────────────────────

def _alembic_cfg() -> Config:
    return Config(str(PROJECT_ROOT / "alembic.ini"))


def _engine():
    from app.database import make_engine  # noqa: PLC0415
    return make_engine(poolclass=NullPool)


def _rid() -> str:
    return uuid.uuid4().hex[:10]


def _ensure_inventory_code(conn: sa.Connection) -> None:
    """Add inventory_code column to stock_records if absent (pre-F6 state setup)."""
    exists = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='stock_records' AND column_name='inventory_code'"
    )).fetchone()
    if not exists:
        conn.execute(sa.text(
            "ALTER TABLE stock_records ADD COLUMN inventory_code text"
        ))
    conn.commit()


def _restore_head() -> None:
    try:
        command.upgrade(_alembic_cfg(), "head")
    except Exception:
        pass


@contextlib.contextmanager
def _migration_context(seed_rows: list[dict]):
    """
    Downgrade to BASE_REVISION, add inventory_code, seed rows, run upgrade head.
    seed_rows: list of dicts {sku, location, quantity, inventory_code}.
    Yields (engine, list[sku]) and cleans up (delete seeded rows + restore head).
    """
    command.downgrade(_alembic_cfg(), BASE_REVISION)
    engine = _engine()
    skus: list[str] = []
    try:
        with engine.connect() as conn:
            _ensure_inventory_code(conn)
            for row in seed_rows:
                conn.execute(sa.text(
                    "DELETE FROM stock_records WHERE sku = :sku"
                ), {"sku": row["sku"]})
                conn.execute(sa.text(
                    "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                    "VALUES (:sku, :location, :quantity, :inv)"
                ), {"sku": row["sku"], "location": row["location"],
                    "quantity": row.get("quantity", 0),
                    "inv": row.get("inventory_code")})
                skus.append(row["sku"])
            conn.commit()
        command.upgrade(_alembic_cfg(), "head")
        yield engine, skus
    finally:
        try:
            with engine.connect() as conn:
                for sku in skus:
                    conn.execute(sa.text(
                        "DELETE FROM stock_records WHERE sku = :sku"
                    ), {"sku": sku})
                conn.commit()
        except Exception:
            pass
        _restore_head()
        engine.dispose()


# ── T1: batch_number IS_NULLABLE = YES ─────────────────────────────────────

def test_T1_batch_number_is_nullable():
    with _migration_context([]) as (engine, _):
        with engine.connect() as conn:
            row = conn.execute(sa.text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_name='stock_records' AND column_name='batch_number'"
            )).fetchone()
    assert row is not None, "batch_number column must exist after up migration"
    assert row[0] == "YES", (
        f"batch_number must be nullable (IS_NULLABLE=YES); got {row[0]!r}"
    )


# ── T2: serial_number IS_NULLABLE = YES ────────────────────────────────────

def test_T2_serial_number_is_nullable():
    with _migration_context([]) as (engine, _):
        with engine.connect() as conn:
            row = conn.execute(sa.text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_name='stock_records' AND column_name='serial_number'"
            )).fetchone()
    assert row is not None, "serial_number column must exist after up migration"
    assert row[0] == "YES", (
        f"serial_number must be nullable (IS_NULLABLE=YES); got {row[0]!r}"
    )


# ── T3: well-formed code → batch_number = 2nd segment ──────────────────────

def test_T3_wellformed_code_backfills_batch_number():
    rid = _rid()
    sku = f"SKU-T3-{rid}"
    # Exactly 3 hyphen-delimited segments; location stored separately
    rows = [{"sku": sku, "location": "WHOUSE", "quantity": 5,
             "inventory_code": "WHOUSE-BATCH42-SN001"}]
    with _migration_context(rows) as (engine, _):
        with engine.connect() as conn:
            result = conn.execute(sa.text(
                "SELECT batch_number FROM stock_records WHERE sku = :sku"
            ), {"sku": sku}).fetchone()
    assert result is not None, f"Row sku={sku!r} not found after migration"
    assert result[0] == "BATCH42", (
        f"batch_number should be 'BATCH42' (2nd segment); got {result[0]!r}"
    )


# ── T4: well-formed code → serial_number = 3rd segment ─────────────────────

def test_T4_wellformed_code_backfills_serial_number():
    rid = _rid()
    sku = f"SKU-T4-{rid}"
    rows = [{"sku": sku, "location": "WHOUSE", "quantity": 5,
             "inventory_code": "WHOUSE-BATCH42-SN001"}]
    with _migration_context(rows) as (engine, _):
        with engine.connect() as conn:
            result = conn.execute(sa.text(
                "SELECT serial_number FROM stock_records WHERE sku = :sku"
            ), {"sku": sku}).fetchone()
    assert result is not None, f"Row sku={sku!r} not found after migration"
    assert result[0] == "SN001", (
        f"serial_number should be 'SN001' (3rd segment); got {result[0]!r}"
    )


# ── T5: malformed code → batch_number = NULL ───────────────────────────────

def test_T5_malformed_code_backfills_null_batch_number():
    rid = _rid()
    sku = f"SKU-T5-{rid}"
    # 2 segments only – fewer than 3
    rows = [{"sku": sku, "location": "DOCK1", "quantity": 1,
             "inventory_code": "ONLY-TWOSEG"}]
    with _migration_context(rows) as (engine, _):
        with engine.connect() as conn:
            result = conn.execute(sa.text(
                "SELECT batch_number FROM stock_records WHERE sku = :sku"
            ), {"sku": sku}).fetchone()
    assert result is not None, f"Row sku={sku!r} not found after migration"
    assert result[0] is None, (
        f"batch_number should be NULL for a 2-segment inventory_code; got {result[0]!r}"
    )


# ── T6: malformed code → serial_number = NULL ──────────────────────────────

def test_T6_malformed_code_backfills_null_serial_number():
    rid = _rid()
    sku = f"SKU-T6-{rid}"
    rows = [{"sku": sku, "location": "DOCK1", "quantity": 1,
             "inventory_code": "ONLY-TWOSEG"}]
    with _migration_context(rows) as (engine, _):
        with engine.connect() as conn:
            result = conn.execute(sa.text(
                "SELECT serial_number FROM stock_records WHERE sku = :sku"
            ), {"sku": sku}).fetchone()
    assert result is not None, f"Row sku={sku!r} not found after migration"
    assert result[0] is None, (
        f"serial_number should be NULL for a 2-segment inventory_code; got {result[0]!r}"
    )


# ── T7: seeded row count delta = 0 ─────────────────────────────────────────

def test_T7_seeded_row_count_delta_is_zero():
    rid = _rid()
    skus = [f"SKU-T7a-{rid}", f"SKU-T7b-{rid}", f"SKU-T7c-{rid}"]
    rows = [
        {"sku": skus[0], "location": f"LOC0{rid}", "quantity": 1,
         "inventory_code": f"LOC0{rid}-B0-S0"},
        {"sku": skus[1], "location": f"LOC1{rid}", "quantity": 2,
         "inventory_code": f"LOC1{rid}-B1-S1"},
        {"sku": skus[2], "location": f"LOC2{rid}", "quantity": 3,
         "inventory_code": f"LOC2{rid}-B2-S2"},
    ]
    command.downgrade(_alembic_cfg(), BASE_REVISION)
    engine = _engine()
    try:
        with engine.connect() as conn:
            _ensure_inventory_code(conn)
            for row in rows:
                conn.execute(sa.text(
                    "DELETE FROM stock_records WHERE sku = :sku"
                ), {"sku": row["sku"]})
                conn.execute(sa.text(
                    "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                    "VALUES (:sku, :location, :quantity, :inv)"
                ), {"sku": row["sku"], "location": row["location"],
                    "quantity": row["quantity"], "inv": row["inventory_code"]})
            conn.commit()
            count_before = conn.execute(sa.text(
                "SELECT COUNT(*) FROM stock_records "
                "WHERE sku IN (:s0, :s1, :s2)"
            ), {"s0": skus[0], "s1": skus[1], "s2": skus[2]}).scalar()
        command.upgrade(_alembic_cfg(), "head")
        with engine.connect() as conn:
            count_after = conn.execute(sa.text(
                "SELECT COUNT(*) FROM stock_records "
                "WHERE sku IN (:s0, :s1, :s2)"
            ), {"s0": skus[0], "s1": skus[1], "s2": skus[2]}).scalar()
        assert count_after == count_before, (
            f"Row count delta must be 0; before={count_before}, after={count_after}"
        )
    finally:
        try:
            with engine.connect() as conn:
                conn.execute(sa.text(
                    "DELETE FROM stock_records WHERE sku IN (:s0, :s1, :s2)"
                ), {"s0": skus[0], "s1": skus[1], "s2": skus[2]})
                conn.commit()
        except Exception:
            pass
        _restore_head()
        engine.dispose()


# ── T8: seeded rows retain original id ─────────────────────────────────────

def test_T8_seeded_rows_retain_original_id():
    rid = _rid()
    sku = f"SKU-T8-{rid}"
    command.downgrade(_alembic_cfg(), BASE_REVISION)
    engine = _engine()
    try:
        with engine.connect() as conn:
            _ensure_inventory_code(conn)
            conn.execute(sa.text(
                "DELETE FROM stock_records WHERE sku = :sku"
            ), {"sku": sku})
            conn.execute(sa.text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :quantity, :inv)"
            ), {"sku": sku, "location": "SHELF1", "quantity": 10,
                "inv": "SHELF1-B1-S1"})
            conn.commit()
            original_id = conn.execute(sa.text(
                "SELECT id FROM stock_records WHERE sku = :sku"
            ), {"sku": sku}).scalar()
        command.upgrade(_alembic_cfg(), "head")
        with engine.connect() as conn:
            post_id = conn.execute(sa.text(
                "SELECT id FROM stock_records WHERE sku = :sku"
            ), {"sku": sku}).scalar()
        assert post_id == original_id, (
            f"id must be unchanged after migration; before={original_id}, after={post_id}"
        )
    finally:
        try:
            with engine.connect() as conn:
                conn.execute(sa.text(
                    "DELETE FROM stock_records WHERE sku = :sku"
                ), {"sku": sku})
                conn.commit()
        except Exception:
            pass
        _restore_head()
        engine.dispose()


# ── T9: seeded rows retain original location ───────────────────────────────

def test_T9_seeded_rows_retain_original_location():
    rid = _rid()
    sku = f"SKU-T9-{rid}"
    location = f"BIN{rid}"
    rows = [{"sku": sku, "location": location, "quantity": 3,
             "inventory_code": f"{location}-BX-SX"}]
    with _migration_context(rows) as (engine, _):
        with engine.connect() as conn:
            result = conn.execute(sa.text(
                "SELECT location FROM stock_records WHERE sku = :sku"
            ), {"sku": sku}).fetchone()
    assert result is not None, f"Row sku={sku!r} not found after migration"
    assert result[0] == location, (
        f"location must be unchanged; expected {location!r}, got {result[0]!r}"
    )


# ── T10: UNIQUE (sku, location) constraint survives migration ───────────────

def test_T10_unique_sku_location_constraint_survives():
    with _migration_context([]) as (engine, _):
        with engine.connect() as conn:
            rows = conn.execute(sa.text(
                "SELECT conname FROM pg_constraint "
                "WHERE conrelid = 'stock_records'::regclass AND contype = 'u'"
            )).fetchall()
    constraint_names = [r[0] for r in rows]
    assert "uq_stock_records_sku_location" in constraint_names, (
        f"UNIQUE constraint uq_stock_records_sku_location must survive migration; "
        f"found: {constraint_names}"
    )


# ── T12: no hardcoded connection strings in migration files ────────────────

def test_T12_no_hardcoded_connection_string_in_migration_files():
    migration_dir = PROJECT_ROOT / "alembic" / "versions"
    # Matches literal URLs or hardcoded host/port connection parameters
    pattern = re.compile(
        r"(postgresql://|postgres://|psycopg2\.connect\s*\(|"
        r"\"host\"\s*:|'host'\s*:|host\s*=\s*['\"][^'\"]+['\"])",
        re.IGNORECASE,
    )
    offending: list[str] = []
    for path in sorted(migration_dir.glob("*.py")):
        for lineno, line in enumerate(path.read_text().splitlines(), 1):
            if pattern.search(line):
                offending.append(f"{path.name}:{lineno}: {line.strip()}")
    assert not offending, (
        "Hardcoded connection strings found in migration files:\n"
        + "\n".join(offending)
    )


# ── T14: inventory_code column absent after up migration ───────────────────

def test_T14_inventory_code_absent_after_migration():
    with _migration_context([]) as (engine, _):
        with engine.connect() as conn:
            row = conn.execute(sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='stock_records' AND column_name='inventory_code'"
            )).fetchone()
    assert row is None, (
        "inventory_code column must NOT exist in stock_records after the up migration"
    )


# ── T15: schema correct after downgrade -1 then upgrade head ───────────────

@pytest.mark.migration
def test_T15_schema_correct_after_round_trip():
    command.downgrade(_alembic_cfg(), "-1")
    try:
        command.upgrade(_alembic_cfg(), "head")
        engine = _engine()
        try:
            with engine.connect() as conn:
                cols = {r[0] for r in conn.execute(sa.text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='stock_records'"
                )).fetchall()}
            assert "batch_number" in cols, (
                "batch_number must be present in stock_records after round-trip"
            )
            assert "serial_number" in cols, (
                "serial_number must be present in stock_records after round-trip"
            )
            assert "inventory_code" not in cols, (
                "inventory_code must be absent from stock_records after round-trip"
            )
        finally:
            engine.dispose()
    finally:
        _restore_head()


# ── T16: rows survive a single-step downgrade ──────────────────────────────

@pytest.mark.migration
def test_T16_rows_survive_downgrade():
    rid = _rid()
    sku = f"SKU-T16-{rid}"
    command.downgrade(_alembic_cfg(), BASE_REVISION)
    engine = _engine()
    try:
        with engine.connect() as conn:
            _ensure_inventory_code(conn)
            conn.execute(sa.text(
                "DELETE FROM stock_records WHERE sku = :sku"
            ), {"sku": sku})
            conn.execute(sa.text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :quantity, :inv)"
            ), {"sku": sku, "location": "RACK1", "quantity": 7,
                "inv": "RACK1-B1-S1"})
            conn.commit()
            original_id = conn.execute(sa.text(
                "SELECT id FROM stock_records WHERE sku = :sku"
            ), {"sku": sku}).scalar()
        command.upgrade(_alembic_cfg(), "head")
        command.downgrade(_alembic_cfg(), "-1")
        with engine.connect() as conn:
            post_id = conn.execute(sa.text(
                "SELECT id FROM stock_records WHERE sku = :sku"
            ), {"sku": sku}).scalar()
        assert post_id is not None, (
            f"Row sku={sku!r} must still exist after downgrade -1"
        )
        assert post_id == original_id, (
            f"id must be unchanged after downgrade; "
            f"original={original_id}, after_downgrade={post_id}"
        )
    finally:
        try:
            with engine.connect() as conn:
                conn.execute(sa.text(
                    "DELETE FROM stock_records WHERE sku = :sku"
                ), {"sku": sku})
                conn.commit()
        except Exception:
            pass
        _restore_head()
        engine.dispose()
