"""Migration-reversibility fitness test (T12 / PI4-migration-reversible).

Schema-mutating: marked `migration` so the verify runs it on its OWN isolated
ephemeral branch, never the shared verify DB. Verifies reversibility with a
SINGLE-step round-trip (`alembic downgrade -1` then `upgrade head`) on the
stock_records migration, never `downgrade base`, and that a pre-existing
seeded row survives the round-trip (R1 durability).
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
def test_stock_records_migration_reverses_and_preserves_seeded_rows(db_session):
    cfg = _alembic_config()

    # Ensure we start from head (the migration under test applied).
    command.upgrade(cfg, "head")

    # Seed a pre-existing row that must survive the downgrade/upgrade round-trip.
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
            "VALUES (:sku, :location, :quantity, :inventory_code)"
        ),
        {
            "sku": "PI4-SEEDED",
            "location": "M1",
            "quantity": 42,
            "inventory_code": "LOT-SEED",
        },
    )
    db_session.commit()

    try:
        # Single-step reversal of the migration under test, never `downgrade base`.
        command.downgrade(cfg, "-1")
        command.upgrade(cfg, "head")

        row = db_session.execute(
            text(
                "SELECT quantity, inventory_code FROM stock_records "
                "WHERE sku = :sku AND location = :location"
            ),
            {"sku": "PI4-SEEDED", "location": "M1"},
        ).fetchone()
        assert row is not None, "the pre-existing seeded row did not survive the migration round-trip"
        assert row[0] == 42
        assert row[1] == "LOT-SEED"
    finally:
        db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": "PI4-SEEDED"})
        db_session.commit()
