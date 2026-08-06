"""T15-T19 -- S2: reversible-down-migration fitness tests.

All tests are @pytest.mark.migration so the verify substrate runs them on
their OWN isolated ephemeral branch DB (SFTDD_PYTEST_MARKER split).

Tests verify that `alembic downgrade -1` (from the split-columns head back to
the combined inventory_code schema) behaves correctly per NFR-F6-10:

  T15 (AC1-combined-column-restored):    inventory_code column re-appears
  T16 (AC2-code-recombined-from-parts):  conforming row reconstructed correctly
  T17 (AC4-split-columns-removed):       batch_number / serial_number are gone
  T18 (AC3-nonconforming-row-recombined-safely): NULL batch/serial -> location only
  T19 (AC5-all-rows-survive-rollback):   row count delta is zero
"""

import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy import pool

ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_INI = str(ROOT / "alembic.ini")


def _make_config() -> Config:
    return Config(ALEMBIC_INI)


def _make_engine():
    from app.database import make_engine
    return make_engine(poolclass=pool.NullPool)


@pytest.mark.migration
def test_T15_inventory_code_column_restored_after_downgrade():
    """T15 [AC1-combined-column-restored]: after downgrade -1, stock_records exposes inventory_code."""
    cfg = _make_config()
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "-1")

    engine = _make_engine()
    try:
        inspector = sa.inspect(engine)
        columns = {col["name"] for col in inspector.get_columns("stock_records")}
        assert "inventory_code" in columns, (
            "inventory_code column not found on stock_records after downgrade -1 "
            "(AC1-combined-column-restored): the down-migration must re-add it."
        )
    finally:
        engine.dispose()


@pytest.mark.migration
def test_T16_conforming_row_recombined_from_parts():
    """T16 [AC2-code-recombined-from-parts]: conforming split row -> location-batch-serial code."""
    run_id = uuid.uuid4().hex[:8]
    sku = f"SKU-T16-{run_id}"
    location = f"LOC-T16-{run_id}"
    batch = "B7"
    serial = "S001"
    expected_code = f"{location}-{batch}-{serial}"

    cfg = _make_config()
    command.upgrade(cfg, "head")

    # Seed at head (batch_number + serial_number columns exist; inventory_code does not).
    engine = _make_engine()
    try:
        with engine.begin() as conn:
            # Delete before insert for idempotency (uuid suffix makes key unique per run,
            # but guard against an orphaned row from a prior killed run anyway).
            conn.execute(sa.text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
            conn.execute(
                sa.text(
                    "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
                    "VALUES (:sku, :loc, :qty, :batch, :serial)"
                ),
                {"sku": sku, "loc": location, "qty": 1, "batch": batch, "serial": serial},
            )
    finally:
        engine.dispose()

    try:
        command.downgrade(cfg, "-1")

        engine2 = _make_engine()
        try:
            with engine2.connect() as conn:
                row = conn.execute(
                    sa.text("SELECT inventory_code FROM stock_records WHERE sku = :sku"),
                    {"sku": sku},
                ).fetchone()
        finally:
            engine2.dispose()

        assert row is not None, (
            f"Seeded row (sku={sku}) not found after downgrade -1."
        )
        assert row[0] == expected_code, (
            f"inventory_code mismatch after downgrade (AC2-code-recombined-from-parts): "
            f"expected '{expected_code}', got '{row[0]}'."
        )
    finally:
        # Data cleanup (schema will be restored to head by the autouse fixture).
        engine3 = _make_engine()
        try:
            with engine3.begin() as conn:
                conn.execute(sa.text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        finally:
            engine3.dispose()


@pytest.mark.migration
def test_T17_split_columns_removed_after_downgrade():
    """T17 [AC4-split-columns-removed]: batch_number and serial_number absent after downgrade -1."""
    cfg = _make_config()
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "-1")

    engine = _make_engine()
    try:
        inspector = sa.inspect(engine)
        columns = {col["name"] for col in inspector.get_columns("stock_records")}
        assert "batch_number" not in columns, (
            "batch_number still present on stock_records after downgrade -1 "
            "(AC4-split-columns-removed): the down-migration must drop it."
        )
        assert "serial_number" not in columns, (
            "serial_number still present on stock_records after downgrade -1 "
            "(AC4-split-columns-removed): the down-migration must drop it."
        )
    finally:
        engine.dispose()


@pytest.mark.migration
def test_T18_nonconforming_row_recombined_safely():
    """T18 [AC3-nonconforming-row-recombined-safely]: NULL batch/serial yields location-only code."""
    run_id = uuid.uuid4().hex[:8]
    sku = f"SKU-T18-{run_id}"
    location = f"LOC-T18-{run_id}"

    cfg = _make_config()
    command.upgrade(cfg, "head")

    # Seed a row with NULL batch_number and serial_number at head.
    engine = _make_engine()
    try:
        with engine.begin() as conn:
            conn.execute(sa.text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
            conn.execute(
                sa.text(
                    "INSERT INTO stock_records (sku, location, quantity) "
                    "VALUES (:sku, :loc, :qty)"
                ),
                {"sku": sku, "loc": location, "qty": 0},
            )
    finally:
        engine.dispose()

    try:
        command.downgrade(cfg, "-1")

        engine2 = _make_engine()
        try:
            with engine2.connect() as conn:
                row = conn.execute(
                    sa.text("SELECT inventory_code FROM stock_records WHERE sku = :sku"),
                    {"sku": sku},
                ).fetchone()
        finally:
            engine2.dispose()

        assert row is not None, (
            f"Seeded row (sku={sku}) not found after downgrade -1."
        )
        code = row[0]
        assert code is not None, (
            "inventory_code is NULL after downgrade for a non-conforming row "
            "(AC3-nonconforming-row-recombined-safely): must be at least the location value."
        )
        assert code == location, (
            f"inventory_code for non-conforming row (NULL batch/serial) must equal "
            f"location only, with no trailing hyphen or literal NULL text "
            f"(AC3-nonconforming-row-recombined-safely): "
            f"expected '{location}', got '{code}'."
        )
    finally:
        engine3 = _make_engine()
        try:
            with engine3.begin() as conn:
                conn.execute(sa.text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        finally:
            engine3.dispose()


@pytest.mark.migration
def test_T19_row_count_unchanged_across_downgrade():
    """T19 [AC5-all-rows-survive-rollback]: before-vs-after row count delta is zero."""
    cfg = _make_config()
    command.upgrade(cfg, "head")

    engine = _make_engine()
    try:
        with engine.connect() as conn:
            count_before = conn.execute(
                sa.text("SELECT COUNT(*) FROM stock_records")
            ).scalar()
    finally:
        engine.dispose()

    command.downgrade(cfg, "-1")

    engine2 = _make_engine()
    try:
        with engine2.connect() as conn:
            count_after = conn.execute(
                sa.text("SELECT COUNT(*) FROM stock_records")
            ).scalar()
    finally:
        engine2.dispose()

    delta = count_after - count_before
    assert delta == 0, (
        f"Row count changed across downgrade -1 (AC5-all-rows-survive-rollback): "
        f"before={count_before}, after={count_after}, delta={delta}. "
        "No row may be dropped or duplicated during the rollback."
    )
