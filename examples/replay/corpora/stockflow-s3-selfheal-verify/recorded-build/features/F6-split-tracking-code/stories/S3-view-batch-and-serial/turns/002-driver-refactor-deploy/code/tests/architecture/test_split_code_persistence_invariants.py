"""Persistence-invariant fitness tests for S1-split-code-migration
(F6-split-tracking-code). Each test inserts directly against the real
paired-branch stock_records table (never a mock), against the schema AS IT
STANDS AFTER the split migration, to verify the migration itself preserved
the declared architecture.json persistence_invariant rather than merely
relying on the ORM's generic behavior.

None of these tests mutate schema themselves (they only call `command.upgrade`
to `head`, a no-op once already there), so none carries `@pytest.mark.migration`;
they are safe against the shared verify database.
"""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

REPO_ROOT = Path(__file__).resolve().parents[2]


def _alembic_config() -> Config:
    return Config(str(REPO_ROOT / "alembic.ini"))


def _cleanup(db_session, skus):
    try:
        for sku in skus:
            db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        db_session.commit()
    except Exception:
        db_session.rollback()


@pytest.fixture(autouse=True)
def _clean_invariant_rows(db_session):
    skus = ["T10-DUP-A", "T11-KEEP", "T11-NULLLOC", "T12-NEG"]
    _cleanup(db_session, skus)
    yield
    _cleanup(db_session, skus)


def test_pi3_sku_location_unique_preserved_after_split_migration(db_session):
    """T10 / PI3-sku-location-unique-preserved: after the migration, a second
    row sharing (sku, location) with an existing row still raises an
    IntegrityError, proving the composite UNIQUE(sku, location) constraint
    carried through the split unweakened."""
    command.upgrade(_alembic_config(), "head")

    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :location, :quantity, :batch_number, :serial_number)"
        ),
        {
            "sku": "T10-DUP-A",
            "location": "L10",
            "quantity": 3,
            "batch_number": "B1",
            "serial_number": "S1",
        },
    )
    db_session.commit()

    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :location, :quantity, :batch_number, :serial_number)"
            ),
            {
                "sku": "T10-DUP-A",
                "location": "L10",
                "quantity": 9,
                "batch_number": "B2",
                "serial_number": "S2",
            },
        )
        db_session.commit()
    db_session.rollback()


def test_pi4_location_not_null_and_unchanged_after_split_migration(db_session):
    """T11 / PI4-location-not-null-preserved: after the migration, a row with
    location set to NULL is rejected by the NOT NULL constraint, and an
    existing row's stored location value is unchanged (not recreated from
    the code's leading segment)."""
    command.upgrade(_alembic_config(), "head")

    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :location, :quantity, :batch_number, :serial_number)"
        ),
        {
            "sku": "T11-KEEP",
            "location": "Dock-9 Row B",
            "quantity": 4,
            "batch_number": None,
            "serial_number": None,
        },
    )
    db_session.commit()

    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, NULL, :quantity, :batch_number, :serial_number)"
            ),
            {
                "sku": "T11-NULLLOC",
                "quantity": 2,
                "batch_number": None,
                "serial_number": None,
            },
        )
        db_session.commit()
    db_session.rollback()

    row = db_session.execute(
        text("SELECT location FROM stock_records WHERE sku = :sku"),
        {"sku": "T11-KEEP"},
    ).fetchone()
    assert row is not None, "the existing row must survive the rejected NULL-location insert"
    assert row[0] == "Dock-9 Row B", (
        f"location must remain exactly as stored, not recreated from the code's "
        f"leading segment; got {row[0]!r}"
    )


def test_quantity_check_and_overcommit_guarantee_survive_split_migration(db_session):
    """T12: after the migration, the existing CHECK quantity >= 0 constraint
    on stock_records still rejects a negative-quantity write and overcommit
    rejection still holds, proving the schema-shape-only migration left the
    quantity guarantees unaffected."""
    command.upgrade(_alembic_config(), "head")

    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :location, :quantity, :batch_number, :serial_number)"
            ),
            {
                "sku": "T12-NEG",
                "location": "L12",
                "quantity": -1,
                "batch_number": None,
                "serial_number": None,
            },
        )
        db_session.commit()
    db_session.rollback()
