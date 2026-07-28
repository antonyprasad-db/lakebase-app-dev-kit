"""pytest-bdd step definitions for S2-stock-by-location-table.

T13 - AC1: the read boundary returns a JSON array with one entry per stock record
           seeded across locations on the real branch DB.
T16 - AC3: a location with no stock records returns an empty JSON array (not 404).
"""

import uuid

import pytest
from pytest_bdd import given, scenarios, then, when
from fastapi.testclient import TestClient
import sqlalchemy

from app.main import app

scenarios("../features/S2-stock-by-location-table.feature")

_client = TestClient(app)


# ---------------------------------------------------------------------------
# Shared per-scenario state
# ---------------------------------------------------------------------------


@pytest.fixture()
def ctx():
    return {}


# ---------------------------------------------------------------------------
# T13 - 3 seeded rows at a unique location -> JSON array with 3 entries
# ---------------------------------------------------------------------------


@given(
    "3 stock records are seeded at a unique test location on the branch DB",
    target_fixture="ctx",
)
def seed_three_records(db_session):
    run_id = uuid.uuid4().hex[:8]
    location = f"BIN-T13-{run_id}"
    skus = [f"T13-SKU-A-{run_id}", f"T13-SKU-B-{run_id}", f"T13-SKU-C-{run_id}"]
    quantities = [10, 20, 30]

    for sku, qty in zip(skus, quantities):
        db_session.execute(
            sqlalchemy.text(
                "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        )
    db_session.commit()

    for sku, qty in zip(skus, quantities):
        db_session.execute(
            sqlalchemy.text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code)"
                " VALUES (:sku, :loc, :qty, :ic)"
            ),
            {"sku": sku, "loc": location, "qty": qty, "ic": f"IC-{sku}"},
        )
    db_session.commit()

    return {
        "location": location,
        "skus": skus,
        "quantities": quantities,
        "response": None,
    }


@when("the operator requests the stock listing for that location")
def request_stock_listing(ctx):
    resp = _client.get(f"/api/stock?location={ctx['location']}")
    ctx["response"] = resp


@then(
    "the response is a JSON array with one entry per seeded record each carrying sku location and quantity"
)
def assert_json_array_with_all_records(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200, got {resp.status_code}: {resp.text}"
    )
    content_type = resp.headers.get("content-type", "")
    assert "application/json" in content_type, (
        f"Expected application/json, got Content-Type: {content_type}"
    )
    data = resp.json()
    assert isinstance(data, list), f"Expected a JSON array, got: {type(data)}"
    assert len(data) == 3, (
        f"Expected 3 entries (one per seeded record), got {len(data)}: {data}"
    )
    returned_skus = {item["sku"] for item in data}
    for item in data:
        assert "sku" in item, f"Entry missing 'sku' key: {item}"
        assert "location" in item, f"Entry missing 'location' key: {item}"
        assert "quantity" in item, f"Entry missing 'quantity' key: {item}"
        assert item["location"] == ctx["location"], (
            f"Entry location mismatch: {item['location']} != {ctx['location']}"
        )
    for sku in ctx["skus"]:
        assert sku in returned_skus, (
            f"Seeded SKU '{sku}' not found in response: {returned_skus}"
        )


# ---------------------------------------------------------------------------
# T16 - empty location returns 200 with empty JSON array, not 404
# ---------------------------------------------------------------------------


@given(
    "a unique location with no stock records on the branch DB",
    target_fixture="ctx",
)
def empty_location(db_session):
    run_id = uuid.uuid4().hex[:8]
    location = f"BIN-T16-EMPTY-{run_id}"
    db_session.execute(
        sqlalchemy.text(
            "DELETE FROM stock_records WHERE location = :loc"
        ),
        {"loc": location},
    )
    db_session.commit()
    return {"location": location, "response": None}


@then(
    "the response status is 200 and the body is an empty JSON array"
)
def assert_empty_json_array(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 for empty location (never 404), got {resp.status_code}: {resp.text}"
    )
    content_type = resp.headers.get("content-type", "")
    assert "application/json" in content_type, (
        f"Expected application/json, got Content-Type: {content_type}"
    )
    data = resp.json()
    assert isinstance(data, list), f"Expected a JSON array, got: {type(data)}"
    assert data == [], (
        f"Expected empty array for location with no stock records, got: {data}"
    )
