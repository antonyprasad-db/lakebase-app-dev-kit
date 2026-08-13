"""Schema-mutating fitness tests for the S1-split-code-migration revision.

Both tests here mutate the stock_records schema (downgrade/upgrade a live
migration), so both are marked `@pytest.mark.migration`: the verify runs this
module on its OWN isolated ephemeral branch, never the shared verify
database.

- T8 / PI1-migration-reversible: a single-step down-then-up round trip of the
  split-migration revision (never `downgrade base`) re-adds inventory_code,
  reconstructs it, then re-applies the split cleanly.
- T9 / PI2-row-preservation-atomic: the add-columns / backfill / drop-column
  steps run as one atomic transaction; forcing a failure mid-migration (at
  the drop-column retirement step) leaves the pre-migration schema and row
  set intact rather than a partially-migrated table.
"""

from pathlib import Path

import pytest
from alembic import command, op
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

REPO_ROOT = Path(__file__).resolve().parents[2]

_SEEDED_SKU_T8 = "T8-SPLIT-ROUNDTRIP"
_SEEDED_SKU_T9 = "T9-ATOMIC-SEEDED"


def _alembic_config() -> Config:
    return Config(str(REPO_ROOT / "alembic.ini"))


def _existing_columns(db_session) -> set:
    return {
        row[0]
        for row in db_session.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'stock_records'"
            )
        )
    }


def _ensure_pre_split_schema(db_session) -> None:
    cfg = _alembic_config()
    columns = _existing_columns(db_session)
    if "batch_number" in columns or "serial_number" in columns:
        command.downgrade(cfg, "-1")


@pytest.mark.migration
def test_split_migration_round_trips_down_then_up_cleanly(db_session):
    """T8 / PI1-migration-reversible: on an isolated branch, downgrade -1 then
    upgrade head re-adds inventory_code (reconstructing it), then re-applies
    the split cleanly -- proving the revision realizes reversibility, never
    `downgrade base`."""
    cfg = _alembic_config()

    # Ensure the split migration under test is applied (we start from head).
    command.upgrade(cfg, "head")

    try:
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :location, :quantity, :batch_number, :serial_number)"
            ),
            {
                "sku": _SEEDED_SKU_T8,
                "location": "R1",
                "quantity": 5,
                "batch_number": "B9",
                "serial_number": "S900",
            },
        )
        db_session.commit()

        # Single-step reversal of the migration under test, never `downgrade base`.
        command.downgrade(cfg, "-1")

        columns_after_down = _existing_columns(db_session)
        assert "inventory_code" in columns_after_down, (
            "the down migration must re-add inventory_code, reconstructing it "
            "from location + batch_number + serial_number"
        )
        row = db_session.execute(
            text("SELECT inventory_code FROM stock_records WHERE sku = :sku"),
            {"sku": _SEEDED_SKU_T8},
        ).fetchone()
        assert row is not None
        assert row[0] == "R1-B9-S900", (
            f"expected the reconstructed combined code 'R1-B9-S900', got {row[0]!r}"
        )

        # Release db_session's open read transaction before Alembic's separate
        # connection runs the re-upgrade DDL, otherwise the DDL lock-waits on
        # this idle transaction until idle_in_transaction_session_timeout kills
        # the connection outright.
        db_session.commit()

        # Re-apply the split cleanly.
        command.upgrade(cfg, "head")
        columns_after_up = _existing_columns(db_session)
        assert "batch_number" in columns_after_up and "serial_number" in columns_after_up
        assert "inventory_code" not in columns_after_up

        row = db_session.execute(
            text(
                "SELECT batch_number, serial_number FROM stock_records WHERE sku = :sku"
            ),
            {"sku": _SEEDED_SKU_T8},
        ).fetchone()
        assert row is not None
        assert row[0] == "B9"
        assert row[1] == "S900"
    finally:
        try:
            db_session.execute(
                text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": _SEEDED_SKU_T8}
            )
            db_session.commit()
        except Exception:
            db_session.rollback()


@pytest.mark.migration
def test_split_migration_is_atomic_and_rolls_back_completely_on_failure(db_session, monkeypatch):
    """T9 / PI2-row-preservation-atomic: force a failure at the drop-column
    retirement step (the last step of the additive-then-retire migration) and
    assert the WHOLE revision's transaction rolls back, leaving the
    pre-migration schema (inventory_code present, no batch_number/
    serial_number) and the seeded row set completely intact -- never a
    partially-migrated table."""
    cfg = _alembic_config()
    _ensure_pre_split_schema(db_session)

    try:
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :quantity, :inventory_code)"
            ),
            {
                "sku": _SEEDED_SKU_T9,
                "location": "R2",
                "quantity": 8,
                "inventory_code": "R2-B1-S100",
            },
        )
        db_session.commit()

        def _boom(*args, **kwargs):
            raise RuntimeError("forced failure mid-migration (T9 atomicity check)")

        monkeypatch.setattr(op, "drop_column", _boom)

        with pytest.raises(Exception):
            command.upgrade(cfg, "head")

        columns = _existing_columns(db_session)
        assert "inventory_code" in columns, (
            "a forced failure mid-migration must leave the pre-migration schema "
            "intact (inventory_code still present), not a partially-migrated table"
        )
        assert "batch_number" not in columns and "serial_number" not in columns, (
            "the aborted revision must not leave behind columns added earlier in "
            "its own transaction; the whole revision must roll back atomically"
        )

        row = db_session.execute(
            text("SELECT quantity, inventory_code FROM stock_records WHERE sku = :sku"),
            {"sku": _SEEDED_SKU_T9},
        ).fetchone()
        assert row is not None, "the seeded pre-migration row must survive the aborted migration"
        assert row[0] == 8
        assert row[1] == "R2-B1-S100"
    finally:
        try:
            db_session.execute(
                text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": _SEEDED_SKU_T9}
            )
            db_session.commit()
        except IntegrityError:
            db_session.rollback()
        except Exception:
            db_session.rollback()
