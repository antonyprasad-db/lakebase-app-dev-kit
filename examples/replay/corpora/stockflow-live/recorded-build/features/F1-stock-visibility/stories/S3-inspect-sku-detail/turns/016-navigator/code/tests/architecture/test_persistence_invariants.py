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
    """T3 / PI2-required-fields-not-null: a row missing sku, location,
    quantity, or inventory_code raises a NOT NULL IntegrityError."""
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :quantity, :inventory_code)"
            ),
            {
                "sku": "PI2-MISSING",
                "location": "L1",
                "quantity": 5,
                "inventory_code": None,
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
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :quantity, :inventory_code)"
            ),
            {
                "sku": "PI3-NEGATIVE",
                "location": "L1",
                "quantity": -1,
                "inventory_code": "LOT-X",
            },
        )
        db_session.commit()
    db_session.rollback()


def test_pi1_sku_location_unique(db_session):
    """T8 / PI1-sku-location-unique: two rows sharing (sku, location) raise a
    unique-constraint IntegrityError."""
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
            "VALUES (:sku, :location, :quantity, :inventory_code)"
        ),
        {
            "sku": "PI1-DUP-A",
            "location": "L1",
            "quantity": 3,
            "inventory_code": "LOT-A",
        },
    )
    db_session.commit()

    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :quantity, :inventory_code)"
            ),
            {
                "sku": "PI1-DUP-A",
                "location": "L1",
                "quantity": 9,
                "inventory_code": "LOT-B",
            },
        )
        db_session.commit()
    db_session.rollback()
