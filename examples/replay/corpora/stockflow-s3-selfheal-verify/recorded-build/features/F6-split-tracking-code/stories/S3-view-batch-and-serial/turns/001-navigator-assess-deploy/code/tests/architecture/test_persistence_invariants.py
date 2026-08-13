"""Persistence-invariant fitness tests for S1-file-stock-record. Each test
inserts directly against the real paired-branch stock_records table (never a
mock) to verify the migration itself realized the declared
architecture.json persistence_invariant, not the ORM's generic behavior.
"""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text


def _cleanup(db_session, skus):
    try:
        for sku in skus:
            db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        db_session.commit()
    except Exception:
        db_session.rollback()


@pytest.fixture(autouse=True)
def _clean_invariant_rows(db_session):
    skus = ["PI2-MISSING", "PI3-NEGATIVE", "PI1-DUP-A"]
    _cleanup(db_session, skus)
    yield
    _cleanup(db_session, skus)


def test_pi2_required_fields_not_null(db_session):
    """T3 / PI2-required-fields-not-null: a row missing sku, location, or
    quantity raises a NOT NULL IntegrityError. (batch_number/serial_number
    are nullable per AC2-conforming-code-nonconforming-blank; inventory_code
    is retired by the split-code migration.)"""
    with pytest.raises(IntegrityError):
        db_session.execute(
            text("INSERT INTO stock_records (sku, location, quantity) VALUES (:sku, :location, :quantity)"),
            {
                "sku": "PI2-MISSING",
                "location": "L1",
                "quantity": None,
            },
        )
        db_session.commit()
    db_session.rollback()


def test_pi3_quantity_non_negative(db_session):
    """T6 / PI3-quantity-non-negative: a row with quantity < 0 raises a
    CHECK-constraint violation."""
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :location, :quantity, :batch_number, :serial_number)"
            ),
            {
                "sku": "PI3-NEGATIVE",
                "location": "L1",
                "quantity": -1,
                "batch_number": "X",
                "serial_number": "1",
            },
        )
        db_session.commit()
    db_session.rollback()


def test_pi1_sku_location_unique(db_session):
    """T8 / PI1-sku-location-unique: two rows sharing (sku, location) raise a
    unique-constraint IntegrityError."""
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :location, :quantity, :batch_number, :serial_number)"
        ),
        {
            "sku": "PI1-DUP-A",
            "location": "L1",
            "quantity": 3,
            "batch_number": "A",
            "serial_number": "1",
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
                "sku": "PI1-DUP-A",
                "location": "L1",
                "quantity": 9,
                "batch_number": "B",
                "serial_number": "2",
            },
        )
        db_session.commit()
    db_session.rollback()
