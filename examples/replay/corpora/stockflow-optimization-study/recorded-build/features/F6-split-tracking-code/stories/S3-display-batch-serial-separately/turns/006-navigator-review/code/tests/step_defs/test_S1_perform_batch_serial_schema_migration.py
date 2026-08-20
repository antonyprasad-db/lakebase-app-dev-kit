"""pytest-bdd step definitions for S1-perform-batch-serial-schema-migration (F6).

Scenarios covered:
  T11 – atomic rollback when migration fails partway
  T13 – integrity probe counts NULL batch/serial rows for a mixed seed set
  T17 – downgrade reconstructs inventory_code from location + batch + serial
"""
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from pytest_bdd import given, then, when, scenarios
from sqlalchemy.pool import NullPool

scenarios("../features/S1-perform-batch-serial-schema-migration.feature")

BASE_REVISION = "20260819190000"
PROJECT_ROOT = Path(__file__).resolve().parents[2]


# ── Helpers ────────────────────────────────────────────────────────────────

def _cfg() -> Config:
    return Config(str(PROJECT_ROOT / "alembic.ini"))


def _engine():
    from app.database import make_engine  # noqa: PLC0415
    return make_engine(poolclass=NullPool)


def _rid() -> str:
    return uuid.uuid4().hex[:10]


def _ensure_inventory_code(conn: sa.Connection) -> None:
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
        command.upgrade(_cfg(), "head")
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════════════════════
# T11 – atomic rollback on partial migration failure
# ═══════════════════════════════════════════════════════════════════════════

@given(
    "the stock_records table is at the pre-migration schema with a seeded row",
    target_fixture="t11_ctx",
)
def t11_pre_migration_seeded():
    rid = _rid()
    sku = f"SKU-T11-{rid}"
    command.downgrade(_cfg(), BASE_REVISION)
    engine = _engine()
    with engine.connect() as conn:
        _ensure_inventory_code(conn)
        conn.execute(sa.text(
            "DELETE FROM stock_records WHERE sku = :sku"
        ), {"sku": sku})
        conn.execute(sa.text(
            "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
            "VALUES (:sku, :location, :quantity, :inv)"
        ), {"sku": sku, "location": "BINT11", "quantity": 1,
            "inv": "BINT11-B1-S1"})
        conn.commit()
        pre_cols = {r[0] for r in conn.execute(sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='stock_records'"
        )).fetchall()}
    return {"sku": sku, "engine": engine, "pre_cols": pre_cols, "exception": None}


@when("the migration fails partway through a step")
def t11_migration_fails_partway(t11_ctx):
    try:
        with patch("alembic.op.drop_column",
                   side_effect=RuntimeError("Simulated partial migration failure")):
            command.upgrade(_cfg(), "head")
    except Exception as exc:
        t11_ctx["exception"] = exc


@then("the migration exception was raised indicating a partial failure")
def t11_exception_raised(t11_ctx):
    assert t11_ctx["exception"] is not None, (
        "Expected an exception from a partial migration failure but none was raised. "
        "Ensure the F6 migration exists and calls op.drop_column."
    )


@then("the stock_records table schema is unchanged from the pre-migration state")
def t11_schema_unchanged(t11_ctx):
    engine = t11_ctx["engine"]
    pre_cols = t11_ctx["pre_cols"]
    with engine.connect() as conn:
        post_cols = {r[0] for r in conn.execute(sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='stock_records'"
        )).fetchall()}
    assert post_cols == pre_cols, (
        f"Schema must be unchanged after a rolled-back migration; "
        f"pre={sorted(pre_cols)}, post={sorted(post_cols)}"
    )


@then("the seeded row is still present in stock_records")
def t11_row_still_present(t11_ctx):
    engine = t11_ctx["engine"]
    sku = t11_ctx["sku"]
    with engine.connect() as conn:
        result = conn.execute(sa.text(
            "SELECT id FROM stock_records WHERE sku = :sku"
        ), {"sku": sku}).fetchone()
    # cleanup
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
    assert result is not None, (
        f"Seeded row sku={sku!r} must still be present after atomic rollback"
    )


# ═══════════════════════════════════════════════════════════════════════════
# T13 – integrity probe counts NULL rows after backfill
# ═══════════════════════════════════════════════════════════════════════════

@given(
    "stock_records contains 2 well-formed and 3 malformed inventory_codes",
    target_fixture="t13_ctx",
)
def t13_seed_mixed_rows():
    rid = _rid()
    conforming_skus = [f"SKU-T13-CONF{i}-{rid}" for i in range(2)]
    malformed_skus = [f"SKU-T13-MALF{i}-{rid}" for i in range(3)]
    all_skus = conforming_skus + malformed_skus

    command.downgrade(_cfg(), BASE_REVISION)
    engine = _engine()
    with engine.connect() as conn:
        _ensure_inventory_code(conn)
        for i, sku in enumerate(conforming_skus):
            conn.execute(sa.text(
                "DELETE FROM stock_records WHERE sku = :sku"
            ), {"sku": sku})
            conn.execute(sa.text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :quantity, :inv)"
            ), {"sku": sku, "location": f"LOCF{i}{rid}", "quantity": i + 1,
                "inv": f"LOCF{i}{rid}-BATCH{i}-SN{i}"})
        for i, sku in enumerate(malformed_skus):
            conn.execute(sa.text(
                "DELETE FROM stock_records WHERE sku = :sku"
            ), {"sku": sku})
            conn.execute(sa.text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :quantity, :inv)"
            ), {"sku": sku, "location": f"LOCM{i}{rid}", "quantity": i + 1,
                "inv": f"SHORTY{i}"})   # 1 segment – fewer than 3
        conn.commit()
    return {
        "engine": engine,
        "all_skus": all_skus,
        "expected_null_count": 3,
    }


@when("the up migration completes its backfill")
def t13_run_upgrade(t13_ctx):
    command.upgrade(_cfg(), "head")


@then("the count of NULL batch_number or serial_number rows for the seeded set equals 3")
def t13_probe_count_matches(t13_ctx):
    engine = t13_ctx["engine"]
    all_skus = t13_ctx["all_skus"]
    expected = t13_ctx["expected_null_count"]

    placeholders = ", ".join(f":sku{i}" for i in range(len(all_skus)))
    params = {f"sku{i}": sku for i, sku in enumerate(all_skus)}

    with engine.connect() as conn:
        actual = conn.execute(sa.text(
            f"SELECT COUNT(*) FROM stock_records "
            f"WHERE sku IN ({placeholders}) "
            f"AND (batch_number IS NULL OR serial_number IS NULL)"
        ), params).scalar()

    # cleanup
    try:
        with engine.connect() as conn:
            conn.execute(sa.text(
                f"DELETE FROM stock_records WHERE sku IN ({placeholders})"
            ), params)
            conn.commit()
    except Exception:
        pass
    _restore_head()
    engine.dispose()

    assert actual == expected, (
        f"Integrity probe count mismatch: "
        f"expected {expected} NULL-batch/serial rows, found {actual}"
    )


# ═══════════════════════════════════════════════════════════════════════════
# T17 – down migration reconstructs inventory_code
# ═══════════════════════════════════════════════════════════════════════════

@given(
    "the up migration has been applied with rows having batch_number and serial_number",
    target_fixture="t17_ctx",
)
def t17_seed_and_migrate():
    rid = _rid()
    sku = f"SKU-T17-{rid}"
    # location with NO hyphens so reconstruction is deterministic:
    # inventory_code = location + '-' + batch + '-' + serial
    location = f"SHELF{rid}"
    batch = "BATCH17"
    serial = "SN17"
    inventory_code = f"{location}-{batch}-{serial}"

    command.downgrade(_cfg(), BASE_REVISION)
    engine = _engine()
    with engine.connect() as conn:
        _ensure_inventory_code(conn)
        conn.execute(sa.text(
            "DELETE FROM stock_records WHERE sku = :sku"
        ), {"sku": sku})
        conn.execute(sa.text(
            "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
            "VALUES (:sku, :location, :quantity, :inv)"
        ), {"sku": sku, "location": location, "quantity": 2, "inv": inventory_code})
        conn.commit()
    command.upgrade(_cfg(), "head")
    return {
        "engine": engine,
        "sku": sku,
        "location": location,
        "expected_inventory_code": inventory_code,
    }


@when("the down migration runs one step")
def t17_run_downgrade(t17_ctx):
    command.downgrade(_cfg(), "-1")


@then("inventory_code column is re-added to stock_records")
def t17_inventory_code_exists(t17_ctx):
    engine = t17_ctx["engine"]
    with engine.connect() as conn:
        row = conn.execute(sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='stock_records' AND column_name='inventory_code'"
        )).fetchone()
    assert row is not None, (
        "inventory_code column must be re-added to stock_records after downgrade -1"
    )


@then("each seeded row inventory_code equals location concatenated with batch_number and serial_number")
def t17_inventory_code_reconstructed(t17_ctx):
    engine = t17_ctx["engine"]
    sku = t17_ctx["sku"]
    expected = t17_ctx["expected_inventory_code"]

    with engine.connect() as conn:
        result = conn.execute(sa.text(
            "SELECT inventory_code FROM stock_records WHERE sku = :sku"
        ), {"sku": sku}).fetchone()

    # cleanup
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

    assert result is not None, f"Row sku={sku!r} not found after downgrade"
    assert result[0] == expected, (
        f"Reconstructed inventory_code should be {expected!r}; got {result[0]!r}"
    )
