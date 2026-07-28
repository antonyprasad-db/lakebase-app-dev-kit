"""pytest-bdd step definitions for S3-sku-detail-view.

T19 - AC1: the detail read boundary returns JSON with the SKU appearing once
           and one entry per location, each carrying location and quantity, sourced
           from the real branch DB through repository and service grouping.

T21 - AC2: the detail boundary includes the tracking_code field in each location
           entry when the stock_records row carries a tracking code.

T23 - AC3: the detail boundary emits tracking_code as an explicit null (key
           present, value null) for a row with no tracking detail, without erroring.
"""

import uuid

import pytest
import sqlalchemy
from fastapi.testclient import TestClient
from pytest_bdd import given, scenarios, then, when

from app.main import app

scenarios("../features/S3-sku-detail-view.feature")

_client = TestClient(app)


# ---------------------------------------------------------------------------
# Per-scenario state container
# ---------------------------------------------------------------------------


@pytest.fixture()
def ctx():
    return {}


# ---------------------------------------------------------------------------
# T19 - AC1: multi-location SKU returns one entry per location
# ---------------------------------------------------------------------------


@given(
    "a SKU is seeded at 2 unique locations on the branch DB",
    target_fixture="ctx",
)
def seed_sku_at_two_locations(db_session):
    run_id = uuid.uuid4().hex[:8]
    sku = f"T19-SKU-{run_id}"
    locations = [f"BIN-T19-A-{run_id}", f"BIN-T19-B-{run_id}"]
    quantities = [11, 22]

    for loc in locations:
        db_session.execute(
            sqlalchemy.text(
                "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": loc},
        )
    db_session.commit()

    for loc, qty in zip(locations, quantities):
        db_session.execute(
            sqlalchemy.text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code)"
                " VALUES (:sku, :loc, :qty, :ic)"
            ),
            {"sku": sku, "loc": loc, "qty": qty, "ic": f"IC-{run_id}"},
        )
    db_session.commit()

    return {
        "sku": sku,
        "locations": locations,
        "quantities": quantities,
        "response": None,
    }


@when("the operator requests the SKU detail view")
def request_sku_detail(ctx):
    resp = _client.get(f"/api/stock/detail/{ctx['sku']}")
    ctx["response"] = resp


@then(
    "the response is JSON with the SKU appearing once and one entry per location"
    " each carrying location and quantity"
)
def assert_sku_detail_json(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from SKU detail endpoint, got {resp.status_code}: {resp.text}"
    )
    content_type = resp.headers.get("content-type", "")
    assert "application/json" in content_type, (
        f"Expected application/json, got Content-Type: {content_type}"
    )
    data = resp.json()

    # SKU appears once at the top level
    assert "sku" in data, f"Response missing 'sku' key: {data}"
    assert data["sku"] == ctx["sku"], (
        f"Expected sku={ctx['sku']}, got {data['sku']}"
    )

    # One entry per location
    assert "locations" in data, f"Response missing 'locations' key: {data}"
    entries = data["locations"]
    assert isinstance(entries, list), f"'locations' must be a list, got: {type(entries)}"
    assert len(entries) == len(ctx["locations"]), (
        f"Expected {len(ctx['locations'])} location entries, got {len(entries)}: {entries}"
    )

    returned_locs = {e["location"] for e in entries}
    for loc in ctx["locations"]:
        assert loc in returned_locs, (
            f"Seeded location '{loc}' missing from response entries: {returned_locs}"
        )

    for entry in entries:
        assert "location" in entry, f"Entry missing 'location' key: {entry}"
        assert "quantity" in entry, f"Entry missing 'quantity' key: {entry}"


# ---------------------------------------------------------------------------
# T21 - AC2: tracking code is included in the location entry JSON
# ---------------------------------------------------------------------------


@given(
    "a stock record with a tracking code is seeded on the branch DB",
    target_fixture="ctx",
)
def seed_record_with_tracking_code(db_session):
    run_id = uuid.uuid4().hex[:8]
    sku = f"T21-SKU-{run_id}"
    location = f"BIN-T21-{run_id}"
    tracking_code = f"BATCH-{run_id}"

    db_session.execute(
        sqlalchemy.text(
            "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": sku, "loc": location},
    )
    db_session.commit()

    db_session.execute(
        sqlalchemy.text(
            "INSERT INTO stock_records (sku, location, quantity, inventory_code, tracking_code)"
            " VALUES (:sku, :loc, :qty, :ic, :tc)"
        ),
        {"sku": sku, "loc": location, "qty": 5, "ic": f"IC-{run_id}", "tc": tracking_code},
    )
    db_session.commit()

    return {
        "sku": sku,
        "location": location,
        "tracking_code": tracking_code,
        "response": None,
    }


@then("the response includes that tracking code in the JSON for the location entry")
def assert_tracking_code_in_entry(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from SKU detail endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    entries = data.get("locations", [])
    assert entries, f"Expected at least one location entry, got: {data}"

    matching = [e for e in entries if e.get("location") == ctx["location"]]
    assert matching, (
        f"No entry found for location '{ctx['location']}' in: {entries}"
    )
    entry = matching[0]
    assert "tracking_code" in entry, (
        f"Entry missing 'tracking_code' key: {entry}"
    )
    assert entry["tracking_code"] == ctx["tracking_code"], (
        f"Expected tracking_code={ctx['tracking_code']!r}, got {entry['tracking_code']!r}"
    )


# ---------------------------------------------------------------------------
# T23 - AC3: null tracking detail is emitted as an explicit null key
# ---------------------------------------------------------------------------


@given(
    "a stock record with a null tracking detail is seeded on the branch DB",
    target_fixture="ctx",
)
def seed_record_with_null_tracking(db_session):
    run_id = uuid.uuid4().hex[:8]
    sku = f"T23-SKU-{run_id}"
    location = f"BIN-T23-{run_id}"

    db_session.execute(
        sqlalchemy.text(
            "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": sku, "loc": location},
    )
    db_session.commit()

    # Seed without tracking_code so it stays NULL in the DB
    db_session.execute(
        sqlalchemy.text(
            "INSERT INTO stock_records (sku, location, quantity, inventory_code)"
            " VALUES (:sku, :loc, :qty, :ic)"
        ),
        {"sku": sku, "loc": location, "qty": 3, "ic": f"IC-{run_id}"},
    )
    db_session.commit()

    return {
        "sku": sku,
        "location": location,
        "response": None,
    }


@then("the response includes the tracking_code key set to null for that entry")
def assert_null_tracking_code_is_explicit(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from SKU detail endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    entries = data.get("locations", [])
    assert entries, f"Expected at least one location entry, got: {data}"

    matching = [e for e in entries if e.get("location") == ctx["location"]]
    assert matching, (
        f"No entry for location '{ctx['location']}' in: {entries}"
    )
    entry = matching[0]

    # The key must be present -- not omitted -- and its value must be null/None
    assert "tracking_code" in entry, (
        "Entry is missing the 'tracking_code' key entirely; "
        "the boundary must emit it as null, not omit it"
    )
    assert entry["tracking_code"] is None, (
        f"Expected tracking_code=null for an untracked entry, got: {entry['tracking_code']!r}"
    )
