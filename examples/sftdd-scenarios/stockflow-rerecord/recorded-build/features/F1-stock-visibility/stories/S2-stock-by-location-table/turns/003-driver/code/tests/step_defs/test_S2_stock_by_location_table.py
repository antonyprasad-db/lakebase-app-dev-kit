"""Pytest-BDD step definitions for S2-stock-by-location-table (T18, T22).

Tests run against the real paired Lakebase branch DB; NO mocks.
Each scenario seeds under per-run uuid-suffixed keys and cleans up in finally.
"""

import uuid

import sqlalchemy as sa
from fastapi.testclient import TestClient
from pytest_bdd import given, scenarios, then, when

from app.database import SessionLocal
from app.main import app

scenarios("../features/S2-stock-by-location-table.feature")

_client = TestClient(app)


def _make_sku() -> str:
    return f"SKU-{uuid.uuid4().hex[:12]}"


def _make_location() -> str:
    return f"LOC-{uuid.uuid4().hex[:8]}"


def _cleanup_location(location: str) -> None:
    """Delete all test rows for the given location so no residue remains."""
    session = SessionLocal()
    try:
        session.execute(
            sa.text("DELETE FROM stock_records WHERE location = :location"),
            {"location": location},
        )
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


# ---------------------------------------------------------------------------
# T18 - AC1: stock-by-location list returns one entry per seeded row
# ---------------------------------------------------------------------------

@given(
    "two stock records seeded at a unique uuid-suffixed location",
    target_fixture="list_ctx",
)
def given_two_seeded_records():
    location = _make_location()
    records = [
        {"sku": _make_sku(), "location": location, "quantity": 10},
        {"sku": _make_sku(), "location": location, "quantity": 25},
    ]
    session = SessionLocal()
    try:
        # Idempotent seed: delete any residue for this location first.
        session.execute(
            sa.text("DELETE FROM stock_records WHERE location = :location"),
            {"location": location},
        )
        for r in records:
            session.execute(
                sa.text(
                    "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                    "VALUES (:sku, :location, :quantity, 'SEED-S2')"
                ),
                r,
            )
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    return {"location": location, "records": records}


@when(
    "I request the stock list for that seeded location",
    target_fixture="list_response",
)
def when_request_stock_list(list_ctx):
    return _client.get(f"/api/stock/location/{list_ctx['location']}")


@then(
    "the response is a JSON collection with one entry per seeded row "
    "carrying sku, location, and quantity"
)
def then_collection_matches_seeded_rows(list_ctx, list_response):
    location = list_ctx["location"]
    try:
        assert list_response.status_code == 200, (
            f"Expected 200, got {list_response.status_code}: {list_response.text}"
        )
        body = list_response.json()
        assert isinstance(body, list), f"Expected a JSON list, got {type(body)}: {body}"
        assert len(body) == len(list_ctx["records"]), (
            f"Expected {len(list_ctx['records'])} entries, got {len(body)}"
        )
        # Build a keyed map for assertion (order is not part of this contract).
        by_sku = {entry["sku"]: entry for entry in body}
        for seeded in list_ctx["records"]:
            sku = seeded["sku"]
            assert sku in by_sku, f"Seeded SKU {sku!r} not present in response"
            entry = by_sku[sku]
            assert entry["location"] == location, (
                f"Entry for {sku!r} has location {entry['location']!r}, expected {location!r}"
            )
            assert entry["quantity"] == seeded["quantity"], (
                f"Entry for {sku!r} has quantity {entry['quantity']}, expected {seeded['quantity']}"
            )
    finally:
        _cleanup_location(location)


# ---------------------------------------------------------------------------
# T22 - AC3: empty location returns empty JSON collection with HTTP 200
# ---------------------------------------------------------------------------

@given(
    "a unique uuid-suffixed location with no seeded stock records",
    target_fixture="empty_ctx",
)
def given_empty_location():
    location = _make_location()
    # Ensure no residue from a prior interrupted run.
    session = SessionLocal()
    try:
        session.execute(
            sa.text("DELETE FROM stock_records WHERE location = :location"),
            {"location": location},
        )
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    return {"location": location}


@when(
    "I request the stock list for that empty location",
    target_fixture="empty_response",
)
def when_request_empty_location(empty_ctx):
    return _client.get(f"/api/stock/location/{empty_ctx['location']}")


@then("the response is an empty JSON collection with HTTP 200")
def then_empty_collection_200(empty_ctx, empty_response):
    location = empty_ctx["location"]
    try:
        assert empty_response.status_code == 200, (
            f"Expected 200 for empty location, got {empty_response.status_code}: "
            f"{empty_response.text}"
        )
        body = empty_response.json()
        assert isinstance(body, list), (
            f"Expected a JSON list for empty location, got {type(body)}: {body}"
        )
        assert len(body) == 0, (
            f"Expected empty list for location with no records, got {len(body)} entries"
        )
    finally:
        _cleanup_location(location)
