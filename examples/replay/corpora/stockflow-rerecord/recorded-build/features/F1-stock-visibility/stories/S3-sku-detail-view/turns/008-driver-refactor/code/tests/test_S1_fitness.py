"""Fitness / DB-invariant tests for S1-file-stock (T8, T9, T10, T11, T12, T13, T15).

All DB tests run against the real paired Lakebase branch -- no mocks.
"""

import uuid
import threading

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal

_client = TestClient(app)


def _make_sku() -> str:
    return f"SKU-{uuid.uuid4().hex[:12]}"


def _make_loc() -> str:
    return f"LOC-{uuid.uuid4().hex[:8]}"


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
# T8: invalid/missing field returns error payload naming the offending field
# ---------------------------------------------------------------------------

def test_T8_missing_field_error_names_offending_field():
    """POST /api/stock with a missing required field returns an error that names it (NFR-F1-6)."""
    # Omit 'quantity' -- the error must mention 'quantity', not just 'bad request'.
    response = _client.post(
        "/api/stock",
        json={
            "sku": _make_sku(),
            "location": _make_loc(),
            # quantity intentionally omitted
            "inventory_code": "BATCH-001",
        },
    )
    assert response.status_code in (400, 422), (
        f"Expected 400/422 for missing quantity, got {response.status_code}"
    )
    body = response.text.lower()
    assert "quantity" in body, (
        f"Error response does not name the offending field 'quantity' (NFR-F1-6). "
        f"Got: {response.text}"
    )


# ---------------------------------------------------------------------------
# T9: service rejects negative/overcommitting quantity; no row persisted
# ---------------------------------------------------------------------------

def test_T9_service_rejects_negative_quantity():
    """POST /api/stock with quantity < 0 is rejected; no row is stored (NFR-F1-2)."""
    sku = _make_sku()
    location = _make_loc()
    session = SessionLocal()
    try:
        response = _client.post(
            "/api/stock",
            json={
                "sku": sku,
                "location": location,
                "quantity": -5,
                "inventory_code": "BATCH-NEG",
            },
        )
        assert response.status_code in (400, 422), (
            f"Expected rejection (400/422) for negative quantity, got {response.status_code}: {response.text}"
        )
        # Verify no row was persisted.
        rows = session.execute(
            sa.text("SELECT 1 FROM stock_records WHERE sku = :sku AND location = :location"),
            {"sku": sku, "location": location},
        ).fetchall()
        assert len(rows) == 0, (
            f"Negative-quantity write must not persist any row (NFR-F1-2); found {len(rows)} row(s)."
        )
    finally:
        _cleanup(session, sku, location)
        session.close()


# ---------------------------------------------------------------------------
# T10: duplicate (sku, location) at DB level raises unique-constraint violation
# ---------------------------------------------------------------------------

def test_T10_unique_constraint_sku_location():
    """Inserting two rows with the same (sku, location) raises IntegrityError (PI1)."""
    sku = _make_sku()
    location = _make_loc()
    session = SessionLocal()
    try:
        # First insert.
        session.execute(
            sa.text(
                "DELETE FROM stock_records WHERE sku = :sku AND location = :location"
            ),
            {"sku": sku, "location": location},
        )
        session.execute(
            sa.text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, 10, 'BATCH-DUP')"
            ),
            {"sku": sku, "location": location},
        )
        session.commit()

        # Second insert must violate the unique constraint.
        with pytest.raises(IntegrityError):
            session.execute(
                sa.text(
                    "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                    "VALUES (:sku, :location, 20, 'BATCH-DUP2')"
                ),
                {"sku": sku, "location": location},
            )
            session.commit()
    finally:
        session.rollback()
        _cleanup(session, sku, location)
        session.close()


# ---------------------------------------------------------------------------
# T11: NOT NULL constraint on quantity, sku, location, inventory_code
# ---------------------------------------------------------------------------

def test_T11_not_null_constraint_quantity():
    """INSERT with NULL quantity is rejected by NOT NULL DB constraint (PI2)."""
    sku = _make_sku()
    location = _make_loc()
    session = SessionLocal()
    try:
        session.execute(
            sa.text("DELETE FROM stock_records WHERE sku = :sku AND location = :location"),
            {"sku": sku, "location": location},
        )
        session.commit()
        with pytest.raises(IntegrityError):
            session.execute(
                sa.text(
                    "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                    "VALUES (:sku, :location, NULL, 'BATCH-NULL')"
                ),
                {"sku": sku, "location": location},
            )
            session.commit()
    finally:
        session.rollback()
        _cleanup(session, sku, location)
        session.close()


# ---------------------------------------------------------------------------
# T12: CHECK (quantity >= 0) constraint
# ---------------------------------------------------------------------------

def test_T12_check_constraint_quantity_non_negative():
    """INSERT with quantity = -1 is rejected by CHECK (quantity >= 0) constraint (PI3)."""
    sku = _make_sku()
    location = _make_loc()
    session = SessionLocal()
    try:
        session.execute(
            sa.text("DELETE FROM stock_records WHERE sku = :sku AND location = :location"),
            {"sku": sku, "location": location},
        )
        session.commit()
        with pytest.raises(IntegrityError):
            session.execute(
                sa.text(
                    "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                    "VALUES (:sku, :location, -1, 'BATCH-NEG')"
                ),
                {"sku": sku, "location": location},
            )
            session.commit()
    finally:
        session.rollback()
        _cleanup(session, sku, location)
        session.close()


# ---------------------------------------------------------------------------
# T13: upsert for colliding (sku, location) runs atomically; one row remains
# ---------------------------------------------------------------------------

def test_T13_upsert_atomic_single_row():
    """Concurrent repeat-file for same (sku, location) resolves to exactly one row (PI4)."""
    sku = _make_sku()
    location = _make_loc()
    results = []
    errors = []

    def file_stock(qty: int):
        try:
            r = _client.post(
                "/api/stock",
                json={
                    "sku": sku,
                    "location": location,
                    "quantity": qty,
                    "inventory_code": "BATCH-CONCURRENT",
                },
            )
            results.append(r.status_code)
        except Exception as exc:
            errors.append(str(exc))

    # Fire two concurrent requests for the same key.
    t1 = threading.Thread(target=file_stock, args=(10,))
    t2 = threading.Thread(target=file_stock, args=(20,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    session = SessionLocal()
    try:
        assert not errors, f"Unexpected errors during concurrent filing: {errors}"
        # Both requests should succeed (200/201).
        for code in results:
            assert code in (200, 201), f"Expected 200/201, got {code}"
        # Exactly one row in the DB.
        rows = session.execute(
            sa.text(
                "SELECT quantity FROM stock_records "
                "WHERE sku = :sku AND location = :location"
            ),
            {"sku": sku, "location": location},
        ).fetchall()
        assert len(rows) == 1, (
            f"Concurrent upsert must resolve to exactly 1 row (PI4); found {len(rows)}."
        )
    finally:
        _cleanup(session, sku, location)
        session.close()


# ---------------------------------------------------------------------------
# T15: upsert preserves original created_at (immutable audit timestamp, NFR-F1-1/R1)
# ---------------------------------------------------------------------------

def test_T15_upsert_preserves_created_at():
    """Re-filing an existing (sku, location) must not change the original created_at (NFR-F1-1)."""
    sku = _make_sku()
    location = _make_loc()
    session = SessionLocal()
    try:
        # First write.
        r1 = _client.post(
            "/api/stock",
            json={
                "sku": sku,
                "location": location,
                "quantity": 10,
                "inventory_code": "BATCH-AUDIT",
            },
        )
        assert r1.status_code in (200, 201), f"First write failed: {r1.status_code} {r1.text}"

        # Capture the original created_at from the DB.
        row1 = session.execute(
            sa.text(
                "SELECT created_at FROM stock_records "
                "WHERE sku = :sku AND location = :location"
            ),
            {"sku": sku, "location": location},
        ).fetchone()
        assert row1 is not None, "Row not found after first write"
        original_created_at = row1.created_at

        # Second write (upsert).
        r2 = _client.post(
            "/api/stock",
            json={
                "sku": sku,
                "location": location,
                "quantity": 50,
                "inventory_code": "BATCH-AUDIT",
            },
        )
        assert r2.status_code in (200, 201), f"Second write failed: {r2.status_code} {r2.text}"
        session.expire_all()  # Force re-read.

        row2 = session.execute(
            sa.text(
                "SELECT created_at FROM stock_records "
                "WHERE sku = :sku AND location = :location"
            ),
            {"sku": sku, "location": location},
        ).fetchone()
        assert row2 is not None, "Row not found after second write"
        assert row2.created_at == original_created_at, (
            f"created_at must be immutable on upsert (NFR-F1-1). "
            f"Original: {original_created_at}, after upsert: {row2.created_at}."
        )
    finally:
        _cleanup(session, sku, location)
        session.close()
