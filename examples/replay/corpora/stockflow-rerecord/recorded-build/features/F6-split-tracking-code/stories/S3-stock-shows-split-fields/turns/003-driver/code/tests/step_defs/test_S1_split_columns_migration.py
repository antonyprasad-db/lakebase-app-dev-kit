"""Pytest-BDD step definitions for S1-split-columns-migration (T1, T7, T6, T8, T11).

All tests run against the real paired Lakebase branch DB -- no mocks.
Rows seeded under uuid-suffixed keys; cleanup runs in finally blocks.
"""

import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from pytest_bdd import given, scenarios, then, when

from app.database import SessionLocal

scenarios("../features/S1-split-columns-migration.feature")

ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = str(ROOT / "alembic.ini")


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


def _column_names(session) -> list[str]:
    rows = session.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'stock_records'"
        )
    ).fetchall()
    return [r[0] for r in rows]


def _seed_row(session, sku: str, location: str, inventory_code: str) -> None:
    """Insert a row using only pre-migration columns (inventory_code present)."""
    session.execute(
        sa.text(
            "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
            "VALUES (:sku, :location, :qty, :code)"
        ),
        {"sku": sku, "location": location, "qty": 1, "code": inventory_code},
    )
    session.commit()


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
# T1 -- columns present after migration
# ---------------------------------------------------------------------------

@pytest.fixture()
def migration_applied_context():
    """Apply the migration; yield a session; teardown restores head."""
    from alembic import command
    cfg = _alembic_cfg()
    command.upgrade(cfg, "head")
    session = SessionLocal()
    yield {"session": session}
    session.close()


@given("the split-columns migration has been applied to the branch DB", target_fixture="ctx")
def step_migration_applied():
    from alembic import command
    cfg = _alembic_cfg()
    command.upgrade(cfg, "head")
    session = SessionLocal()
    return {"session": session}


@when("I inspect the columns of stock_records")
def step_inspect_columns(ctx):
    ctx["columns"] = _column_names(ctx["session"])
    ctx["session"].close()


@then("both batch_number and serial_number exist as independently addressable columns")
def step_assert_batch_serial_columns(ctx):
    cols = ctx["columns"]
    assert "batch_number" in cols, (
        f"batch_number missing from stock_records columns: {cols}"
    )
    assert "serial_number" in cols, (
        f"serial_number missing from stock_records columns: {cols}"
    )


# T8 reuses the same given/when; different then.
@then("inventory_code does not exist as a column while batch_number and serial_number are present")
def step_assert_inventory_code_dropped(ctx):
    cols = ctx["columns"]
    assert "inventory_code" not in cols, (
        f"inventory_code still present after migration: {cols}"
    )
    assert "batch_number" in cols, f"batch_number missing: {cols}"
    assert "serial_number" in cols, f"serial_number missing: {cols}"


# ---------------------------------------------------------------------------
# T7 -- nonconforming code leaves NULLs
# ---------------------------------------------------------------------------

@given(
    'a stock row seeded with a uuid-suffixed sku and location and inventory_code "X-1" before the migration',
    target_fixture="ctx",
)
def step_seed_nonconforming_row():
    from alembic import command
    cfg = _alembic_cfg()
    # Ensure we are at the pre-split head (before this migration exists).
    # We seed while inventory_code still exists, then the migration will run.
    # Downgrade to just before the split migration by going to -1 from head.
    command.upgrade(cfg, "head")
    # If split migration already applied, go back one step to seed properly.
    command.downgrade(cfg, "-1")
    sku = _make_sku()
    loc = _make_loc()
    session = SessionLocal()
    try:
        _seed_row(session, sku, loc, "X-1")
    except Exception:
        session.rollback()
        session.close()
        raise
    return {"session": session, "sku": sku, "loc": loc}


@when("the split-columns migration runs", target_fixture="ctx")
def step_run_split_migration(ctx):
    from alembic import command
    ctx["session"].close()
    cfg = _alembic_cfg()
    command.upgrade(cfg, "head")
    ctx["session"] = SessionLocal()
    return ctx


@then("the seeded row still exists and batch_number is NULL and serial_number is NULL")
def step_assert_nonconforming_nulls(ctx):
    session = ctx["session"]
    sku = ctx["sku"]
    loc = ctx["loc"]
    try:
        row = session.execute(
            sa.text(
                "SELECT batch_number, serial_number FROM stock_records "
                "WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": loc},
        ).fetchone()
        assert row is not None, f"Seeded row ({sku}, {loc}) not found after migration"
        assert row[0] is None, f"batch_number should be NULL for nonconforming code, got {row[0]!r}"
        assert row[1] is None, f"serial_number should be NULL for nonconforming code, got {row[1]!r}"
    finally:
        _cleanup(session, sku, loc)
        session.close()


# ---------------------------------------------------------------------------
# T6 -- conforming code split
# ---------------------------------------------------------------------------

@given(
    'a stock row seeded with a uuid-suffixed sku and location and inventory_code "A12-B7-S001" before the migration',
    target_fixture="ctx",
)
def step_seed_conforming_row():
    from alembic import command
    cfg = _alembic_cfg()
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "-1")
    sku = _make_sku()
    loc = _make_loc()
    session = SessionLocal()
    try:
        _seed_row(session, sku, loc, "A12-B7-S001")
    except Exception:
        session.rollback()
        session.close()
        raise
    return {"session": session, "sku": sku, "loc": loc}


@then('batch_number equals "B7" and serial_number equals "S001" for that row')
def step_assert_conforming_split(ctx):
    session = ctx["session"]
    sku = ctx["sku"]
    loc = ctx["loc"]
    try:
        row = session.execute(
            sa.text(
                "SELECT batch_number, serial_number FROM stock_records "
                "WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": loc},
        ).fetchone()
        assert row is not None, f"Seeded row ({sku}, {loc}) not found after migration"
        assert row[0] == "B7", f"batch_number: expected 'B7', got {row[0]!r}"
        assert row[1] == "S001", f"serial_number: expected 'S001', got {row[1]!r}"
    finally:
        _cleanup(session, sku, loc)
        session.close()


# ---------------------------------------------------------------------------
# T11 -- location byte-for-byte unchanged
# ---------------------------------------------------------------------------

@given(
    "a stock row seeded with a uuid-suffixed sku, a known location value, and an inventory_code whose leading segment differs from that location",
    target_fixture="ctx",
)
def step_seed_location_check_row():
    from alembic import command
    cfg = _alembic_cfg()
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "-1")
    sku = _make_sku()
    loc = _make_loc()  # e.g. "LOC-abc123" -- leading segment will NOT match "A12"
    session = SessionLocal()
    try:
        _seed_row(session, sku, loc, "A12-B7-S001")
    except Exception:
        session.rollback()
        session.close()
        raise
    return {"session": session, "sku": sku, "loc": loc}


@then("the row's location is byte-for-byte unchanged after the migration")
def step_assert_location_unchanged(ctx):
    session = ctx["session"]
    sku = ctx["sku"]
    original_loc = ctx["loc"]
    try:
        row = session.execute(
            sa.text("SELECT location FROM stock_records WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": original_loc},
        ).fetchone()
        assert row is not None, (
            f"Row ({sku}, {original_loc}) missing after migration -- "
            "location may have been overwritten"
        )
        assert row[0] == original_loc, (
            f"Location overwritten: expected {original_loc!r}, got {row[0]!r}"
        )
    finally:
        _cleanup(session, sku, original_loc)
        session.close()
