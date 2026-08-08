"""Migration-reversibility fitness test (T22 / PI4-migration-reversible) for
the additive, nullable par_level column on stock_records
(S3-inspect-sku-detail, AC4-untracked-par-level-shown).

Schema-mutating: marked `migration` so the verify runs it on its OWN isolated
ephemeral branch, never the shared verify DB. Verifies reversibility with a
SINGLE-step round-trip (`alembic downgrade -1` then `upgrade head`) on the
par_level migration, never `downgrade base`, and that a row filed BEFORE this
migration (i.e. never given a par_level) survives the round-trip with
par_level NULL (durability, PI4).
"""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text

REPO_ROOT = Path(__file__).resolve().parents[2]


def _alembic_config() -> Config:
    return Config(str(REPO_ROOT / "alembic.ini"))


@pytest.mark.migration
def test_par_level_migration_reverses_and_preserves_pre_existing_rows(db_session):
    cfg = _alembic_config()

    # Ensure we start from head (the migration under test applied).
    command.upgrade(cfg, "head")

    # Seed a pre-existing row that predates the par_level migration: filed
    # without any par_level, so it must survive with par_level NULL.
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :location, :quantity, :batch_number, :serial_number)"
        ),
        {
            "sku": "T22-SEEDED",
            "location": "P1",
            "quantity": 11,
            "batch_number": "T22",
            "serial_number": "X",
        },
    )
    db_session.commit()

    try:
        # Single-step reversal of the migration under test, never `downgrade base`.
        command.downgrade(cfg, "-1")
        command.upgrade(cfg, "head")

        row = db_session.execute(
            text(
                "SELECT quantity, batch_number, serial_number, par_level FROM stock_records "
                "WHERE sku = :sku AND location = :location"
            ),
            {"sku": "T22-SEEDED", "location": "P1"},
        ).fetchone()
        assert row is not None, "the pre-existing seeded row did not survive the migration round-trip"
        assert row[0] == 11
        assert row[1] == "T22"
        assert row[2] == "X"
        assert row[3] is None, "par_level must be NULL for a row filed before this migration existed"
    finally:
        db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": "T22-SEEDED"})
        db_session.commit()


def test_par_level_column_is_nullable(db_session):
    """A row can be inserted WITHOUT specifying par_level; the column accepts
    NULL, per AC4's 'par_level is a nullable domain field'."""
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :location, :quantity, :batch_number, :serial_number)"
        ),
        {
            "sku": "T22-NULLABLE",
            "location": "P2",
            "quantity": 5,
            "batch_number": "T22B",
            "serial_number": "Y",
        },
    )
    db_session.commit()
    try:
        row = db_session.execute(
            text("SELECT par_level FROM stock_records WHERE sku = :sku"),
            {"sku": "T22-NULLABLE"},
        ).fetchone()
        assert row is not None
        assert row[0] is None
    finally:
        db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": "T22-NULLABLE"})
        db_session.commit()
