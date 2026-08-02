"""Pytest-BDD step definitions for S1-file-stock (T1, T2, T3).

Tests run against the real paired Lakebase branch DB; NO mocks.
Each scenario seeds under a per-run uuid-suffixed key and cleans up in finally.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from pytest_bdd import given, scenarios, then, when

from app.main import app
from app.database import SessionLocal

scenarios("../features/S1-file-stock.feature")

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_client = TestClient(app)


def _make_unique_sku() -> str:
    return f"SKU-{uuid.uuid4().hex[:12]}"


def _make_unique_location() -> str:
    return f"LOC-{uuid.uuid4().hex[:8]}"


def _cleanup(sku: str, location: str) -> None:
    """Delete the test row if it exists so no fixed-key residue remains."""
    session = SessionLocal()
    try:
        session.execute(
            # Raw DELETE so cleanup works even before the ORM model exists.
            __import__("sqlalchemy").text(
                "DELETE FROM stock_records WHERE sku = :sku AND location = :location"
            ),
            {"sku": sku, "location": location},
        )
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


# ---------------------------------------------------------------------------
# T1 - Filing a stock level durably persists a stock_records row
# ---------------------------------------------------------------------------

@pytest.fixture()
def t1_context():
    return {}


@given("a unique SKU suffixed with a uuid and a warehouse location", target_fixture="file_ctx")
def given_unique_sku_location():
    return {
        "sku": _make_unique_sku(),
        "location": _make_unique_location(),
        "quantity": 42,
        "inventory_code": "BATCH-001/SERIAL-XYZ",
    }


@when("I post the stock level with a quantity and inventory_code to the file-stock endpoint")
def when_post_stock_level(file_ctx):
    response = _client.post(
        "/api/stock",
        json={
            "sku": file_ctx["sku"],
            "location": file_ctx["location"],
            "quantity": file_ctx["quantity"],
            "inventory_code": file_ctx["inventory_code"],
        },
    )
    file_ctx["response"] = response


@then("the branch DB contains exactly one stock_records row capturing that sku, location, quantity, and inventory_code")
def then_row_persisted(file_ctx):
    sku = file_ctx["sku"]
    location = file_ctx["location"]
    try:
        assert file_ctx["response"].status_code in (200, 201), (
            f"Expected 200/201, got {file_ctx['response'].status_code}: {file_ctx['response'].text}"
        )
        session = SessionLocal()
        try:
            import sqlalchemy as sa
            rows = session.execute(
                sa.text(
                    "SELECT sku, location, quantity, inventory_code "
                    "FROM stock_records WHERE sku = :sku AND location = :location"
                ),
                {"sku": sku, "location": location},
            ).fetchall()
            assert len(rows) == 1, f"Expected 1 row, found {len(rows)}"
            row = rows[0]
            assert row.sku == sku
            assert row.location == location
            assert row.quantity == file_ctx["quantity"]
            assert row.inventory_code == file_ctx["inventory_code"]
        finally:
            session.close()
    finally:
        _cleanup(sku, location)


# ---------------------------------------------------------------------------
# T2 - Retrieving a previously filed stock record reads back stored values
# ---------------------------------------------------------------------------

@given("a stock record previously filed under a unique uuid-suffixed sku and location", target_fixture="retrieve_ctx")
def given_previously_filed_record():
    ctx = {
        "sku": _make_unique_sku(),
        "location": _make_unique_location(),
        "quantity": 99,
        "inventory_code": "BATCH-RETRIEVE/SER-001",
    }
    # Seed via idempotent DELETE + INSERT so re-runs on a reused branch are safe.
    import sqlalchemy as sa
    session = SessionLocal()
    try:
        session.execute(
            sa.text(
                "DELETE FROM stock_records WHERE sku = :sku AND location = :location"
            ),
            {"sku": ctx["sku"], "location": ctx["location"]},
        )
        session.execute(
            sa.text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :quantity, :inventory_code)"
            ),
            ctx,
        )
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    return ctx


@when("I retrieve that stock record via the read endpoint")
def when_retrieve_record(retrieve_ctx):
    response = _client.get(
        f"/api/stock/{retrieve_ctx['sku']}/{retrieve_ctx['location']}"
    )
    retrieve_ctx["response"] = response


@then("the response contains the exact quantity and inventory_code that were filed")
def then_read_back_exact(retrieve_ctx):
    sku = retrieve_ctx["sku"]
    location = retrieve_ctx["location"]
    try:
        assert retrieve_ctx["response"].status_code == 200, (
            f"Expected 200, got {retrieve_ctx['response'].status_code}: {retrieve_ctx['response'].text}"
        )
        data = retrieve_ctx["response"].json()
        assert data["quantity"] == retrieve_ctx["quantity"], (
            f"quantity mismatch: {data['quantity']} != {retrieve_ctx['quantity']}"
        )
        assert data["inventory_code"] == retrieve_ctx["inventory_code"], (
            f"inventory_code mismatch: {data['inventory_code']} != {retrieve_ctx['inventory_code']}"
        )
    finally:
        _cleanup(sku, location)


# ---------------------------------------------------------------------------
# T3 - Filing stock a second time updates in place (collision resolution)
# ---------------------------------------------------------------------------

@given("a stock record already filed under a unique uuid-suffixed sku and location", target_fixture="upsert_ctx")
def given_already_filed_record():
    ctx = {
        "sku": _make_unique_sku(),
        "location": _make_unique_location(),
        "original_quantity": 10,
        "updated_quantity": 25,
        "inventory_code": "BATCH-UPSERT/SER-001",
    }
    # File the first record via the API so the full stack is exercised.
    response = _client.post(
        "/api/stock",
        json={
            "sku": ctx["sku"],
            "location": ctx["location"],
            "quantity": ctx["original_quantity"],
            "inventory_code": ctx["inventory_code"],
        },
    )
    assert response.status_code in (200, 201), (
        f"Setup failed: {response.status_code} {response.text}"
    )
    return ctx


@when("I file stock again for that same sku and location pair with a new quantity")
def when_file_stock_again(upsert_ctx):
    response = _client.post(
        "/api/stock",
        json={
            "sku": upsert_ctx["sku"],
            "location": upsert_ctx["location"],
            "quantity": upsert_ctx["updated_quantity"],
            "inventory_code": upsert_ctx["inventory_code"],
        },
    )
    upsert_ctx["response"] = response


@then("exactly one stock_records row exists for that pair with the updated quantity and no error is surfaced")
def then_single_row_updated(upsert_ctx):
    sku = upsert_ctx["sku"]
    location = upsert_ctx["location"]
    try:
        assert upsert_ctx["response"].status_code in (200, 201), (
            f"Expected 200/201, got {upsert_ctx['response'].status_code}: {upsert_ctx['response'].text}"
        )
        import sqlalchemy as sa
        session = SessionLocal()
        try:
            rows = session.execute(
                sa.text(
                    "SELECT sku, location, quantity FROM stock_records "
                    "WHERE sku = :sku AND location = :location"
                ),
                {"sku": sku, "location": location},
            ).fetchall()
            assert len(rows) == 1, f"Expected exactly 1 row after upsert, found {len(rows)}"
            assert rows[0].quantity == upsert_ctx["updated_quantity"], (
                f"Expected updated quantity {upsert_ctx['updated_quantity']}, got {rows[0].quantity}"
            )
        finally:
            session.close()
    finally:
        _cleanup(sku, location)
