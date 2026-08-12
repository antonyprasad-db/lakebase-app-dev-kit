"""pytest-bdd step definitions for S2-view-home-stock-table.feature.

T22 – AC3: GET /stock returns empty JSON array when no records filed.
T21 – AC1: GET /stock returns one object per filed record with sku, location, quantity.

Real paired-branch database only (DATABASE_URL from env); no mocks.
Per-run-unique keys via uuid to prevent key collisions across runs.
"""

import uuid

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from pytest_bdd import given, scenarios, then, when

from app.main import app

scenarios("../features/S2-view-home-stock-table.feature")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def api_client():
    return TestClient(app)


@pytest.fixture()
def ctx():
    return {}


# ---------------------------------------------------------------------------
# Givens
# ---------------------------------------------------------------------------


@given("no stock records have been filed in the system", target_fixture="ctx")
def given_no_stock_records(db_session):
    """Own the state: remove all rows so the list endpoint returns empty."""
    db_session.execute(sa.text("DELETE FROM stock"))
    db_session.commit()
    return {"seeded_skus": []}


@given("stock records have been filed with unique per-run keys", target_fixture="ctx")
def given_stock_records_filed(api_client, db_session):
    """File two stock records with per-run-unique SKUs so the list is non-empty.

    Idempotent: cleans pre-existing rows for these keys before inserting.
    """
    run_id = uuid.uuid4().hex[:10].upper()
    records = [
        {"sku": f"SKU-S2-{run_id}-A", "location": f"LOC-{run_id}-A", "quantity": 5},
        {"sku": f"SKU-S2-{run_id}-B", "location": f"LOC-{run_id}-B", "quantity": 12},
    ]
    seeded_skus = []
    for rec in records:
        # Remove the fixed key if a prior killed run left it.
        db_session.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": rec["sku"], "loc": rec["location"]},
        )
        db_session.commit()
        resp = api_client.post("/api/stock", json=rec)
        assert resp.status_code in (200, 201), (
            f"Setup POST failed for {rec}: {resp.status_code} {resp.text}"
        )
        seeded_skus.append(rec["sku"])
    return {"seeded_skus": seeded_skus, "seeded_records": records, "client": api_client}


# ---------------------------------------------------------------------------
# Whens
# ---------------------------------------------------------------------------


@when("the client GETs the stock list endpoint", target_fixture="ctx")
def when_get_stock_list(api_client, ctx):
    resp = api_client.get("/api/stock")
    ctx["response"] = resp
    ctx["client"] = api_client
    return ctx


# ---------------------------------------------------------------------------
# Thens
# ---------------------------------------------------------------------------


@then("the response is 200 OK with a JSON array")
def then_200_json_array(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"GET /api/stock expected 200, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert isinstance(data, list), (
        f"GET /api/stock must return a JSON array, got {type(data).__name__!r}: {data!r}"
    )


@then("the JSON array is empty")
def then_json_array_empty(ctx):
    data = ctx["response"].json()
    assert data == [], (
        f"GET /api/stock must return [] when no stock records exist, got {data!r}"
    )


@then("the JSON array contains one object per filed record with sku, location, and quantity fields")
def then_json_array_has_required_fields(ctx):
    data = ctx["response"].json()
    seeded_skus = ctx.get("seeded_skus", [])
    seeded_records = ctx.get("seeded_records", [])

    # Assert at least the seeded records are present.
    assert len(data) >= len(seeded_skus), (
        f"Expected at least {len(seeded_skus)} records in response, got {len(data)}: {data!r}"
    )

    # Filter to our seeded rows by SKU for precise assertions.
    returned_by_sku = {item["sku"]: item for item in data if item.get("sku") in seeded_skus}

    for rec in seeded_records:
        sku = rec["sku"]
        assert sku in returned_by_sku, (
            f"Seeded SKU {sku!r} not found in GET /api/stock response. "
            f"Returned SKUs: {list(returned_by_sku.keys())!r}"
        )
        item = returned_by_sku[sku]
        assert "sku" in item, f"Record for {sku!r} missing 'sku' field: {item!r}"
        assert "location" in item, f"Record for {sku!r} missing 'location' field: {item!r}"
        assert "quantity" in item, f"Record for {sku!r} missing 'quantity' field: {item!r}"
        assert item["sku"] == rec["sku"], (
            f"sku mismatch: expected {rec['sku']!r}, got {item['sku']!r}"
        )
        assert item["location"] == rec["location"], (
            f"location mismatch: expected {rec['location']!r}, got {item['location']!r}"
        )
        assert item["quantity"] == rec["quantity"], (
            f"quantity mismatch: expected {rec['quantity']!r}, got {item['quantity']!r}"
        )
