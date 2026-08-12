"""pytest-bdd step definitions for S3-view-sku-detail.feature.

T31 – AC1: GET /stock/<sku> returns every location for the SKU with correct quantities.
T32 – AC1: GET /stock/<sku> returns no entries for a different SKU seeded in the same run.
T37 – AC2: GET /stock/<sku> returns the tracking code exactly as filed via POST /stock.
T39 – AC3: GET /stock/<sku> returns HTTP 200 with par_level null when not recorded.

Real paired-branch database only (DATABASE_URL from env); no mocks.
Per-run-unique keys via uuid to prevent key collisions across runs.
"""

import uuid

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from pytest_bdd import given, scenarios, then, when

from app.main import app

scenarios("../features/S3-view-sku-detail.feature")


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


@given("a SKU holds stock at two locations with unique per-run keys", target_fixture="ctx")
def given_sku_two_locations(api_client, db_session):
    """File one SKU at two distinct locations via POST /stock."""
    run_id = uuid.uuid4().hex[:10].upper()
    sku = f"SKU-S3-{run_id}"
    records = [
        {"sku": sku, "location": f"LOC-S3-{run_id}-A", "quantity": 7},
        {"sku": sku, "location": f"LOC-S3-{run_id}-B", "quantity": 13},
    ]
    for rec in records:
        db_session.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": rec["sku"], "loc": rec["location"]},
        )
    db_session.commit()
    for rec in records:
        resp = api_client.post("/api/stock", json=rec)
        assert resp.status_code in (200, 201), (
            f"Setup POST failed for {rec}: {resp.status_code} {resp.text}"
        )
    return {"sku": sku, "records": records, "client": api_client}


@given("two distinct SKUs each hold stock with unique per-run keys", target_fixture="ctx")
def given_two_distinct_skus(api_client, db_session):
    """File two different SKUs each at one location via POST /stock."""
    run_id = uuid.uuid4().hex[:10].upper()
    sku_a = f"SKU-S3A-{run_id}"
    sku_b = f"SKU-S3B-{run_id}"
    records = [
        {"sku": sku_a, "location": f"LOC-S3A-{run_id}", "quantity": 5},
        {"sku": sku_b, "location": f"LOC-S3B-{run_id}", "quantity": 9},
    ]
    for rec in records:
        db_session.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": rec["sku"], "loc": rec["location"]},
        )
    db_session.commit()
    for rec in records:
        resp = api_client.post("/api/stock", json=rec)
        assert resp.status_code in (200, 201), (
            f"Setup POST failed for {rec}: {resp.status_code} {resp.text}"
        )
    return {"sku_a": sku_a, "sku_b": sku_b, "records": records, "client": api_client}


@given(
    "a SKU holds stock at a location with batch_number and serial_number filed via POST",
    target_fixture="ctx",
)
def given_sku_with_batch_serial(api_client, db_session):
    """File one SKU with inventory_code via POST /stock (S2 head: combined code)."""
    run_id = uuid.uuid4().hex[:10].upper()
    sku = f"SKU-S3T-{run_id}"
    inventory_code = f"LOC-S3T-{run_id}-BATCH-{run_id}-SN-{run_id}"
    record = {
        "sku": sku,
        "location": f"LOC-S3T-{run_id}",
        "quantity": 3,
        "inventory_code": inventory_code,
    }
    db_session.execute(
        sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
        {"sku": record["sku"], "loc": record["location"]},
    )
    db_session.commit()
    resp = api_client.post("/api/stock", json=record)
    assert resp.status_code in (200, 201), (
        f"Setup POST failed for {record}: {resp.status_code} {resp.text}"
    )
    return {"sku": sku, "inventory_code": inventory_code, "record": record, "client": api_client}


@given(
    "a SKU holds stock at a location with no par level recorded",
    target_fixture="ctx",
)
def given_sku_no_par_level(api_client, db_session):
    """File one SKU without a par_level via POST /stock."""
    run_id = uuid.uuid4().hex[:10].upper()
    sku = f"SKU-S3P-{run_id}"
    record = {
        "sku": sku,
        "location": f"LOC-S3P-{run_id}",
        "quantity": 6,
    }
    db_session.execute(
        sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
        {"sku": record["sku"], "loc": record["location"]},
    )
    db_session.commit()
    resp = api_client.post("/api/stock", json=record)
    assert resp.status_code in (200, 201), (
        f"Setup POST failed for {record}: {resp.status_code} {resp.text}"
    )
    return {"sku": sku, "record": record, "client": api_client}


# ---------------------------------------------------------------------------
# Whens
# ---------------------------------------------------------------------------


@when("the client GETs the SKU detail endpoint for that SKU", target_fixture="ctx")
def when_get_sku_detail(api_client, ctx):
    sku = ctx.get("sku") or ctx.get("sku_a")
    resp = api_client.get(f"/api/stock/{sku}")
    ctx["response"] = resp
    return ctx


@when("the client GETs the SKU detail endpoint for the first SKU", target_fixture="ctx")
def when_get_sku_detail_first(api_client, ctx):
    sku = ctx["sku_a"]
    resp = api_client.get(f"/api/stock/{sku}")
    ctx["response"] = resp
    return ctx


# ---------------------------------------------------------------------------
# Thens
# ---------------------------------------------------------------------------


@then("the response is 200 OK with a JSON array")
def then_200_json_array(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert isinstance(data, list), (
        f"Expected a JSON array, got {type(data).__name__!r}: {data!r}"
    )


@then("the array contains one entry per location with the correct quantity")
def then_array_has_all_locations(ctx):
    data = ctx["response"].json()
    records = ctx["records"]
    assert len(data) == len(records), (
        f"Expected {len(records)} entries for SKU, got {len(data)}: {data!r}"
    )
    by_location = {item["location"]: item for item in data}
    for rec in records:
        loc = rec["location"]
        assert loc in by_location, (
            f"Location {loc!r} missing from SKU detail response. Got: {list(by_location)!r}"
        )
        assert by_location[loc]["quantity"] == rec["quantity"], (
            f"Quantity mismatch for {loc!r}: expected {rec['quantity']}, "
            f"got {by_location[loc]['quantity']}"
        )


@then("the array contains no entries for the second SKU")
def then_array_has_no_second_sku(ctx):
    data = ctx["response"].json()
    sku_b = ctx["sku_b"]
    contaminated = [item for item in data if item.get("sku") == sku_b]
    assert contaminated == [], (
        f"SKU detail for first SKU must not include entries for {sku_b!r}. "
        f"Found: {contaminated!r}"
    )


@then("each entry in the array carries batch_number and serial_number exactly as filed")
def then_array_has_batch_serial(ctx):
    """Superseded to S2: GET /stock/<sku> now returns inventory_code (combined code).
    Assert inventory_code is returned exactly as filed."""
    data = ctx["response"].json()
    inventory_code = ctx["inventory_code"]
    assert len(data) >= 1, f"Expected at least one entry in SKU detail response, got: {data!r}"
    for entry in data:
        assert entry.get("inventory_code") == inventory_code, (
            f"inventory_code mismatch: expected {inventory_code!r}, "
            f"got {entry.get('inventory_code')!r} in {entry!r}"
        )


@then("each entry in the array has par_level equal to null")
def then_array_par_level_null(ctx):
    data = ctx["response"].json()
    assert len(data) >= 1, f"Expected at least one entry in SKU detail response, got: {data!r}"
    for entry in data:
        assert "par_level" in entry, (
            f"Entry missing 'par_level' key (must be present, not omitted): {entry!r}"
        )
        assert entry["par_level"] is None, (
            f"par_level must be null when not recorded, got {entry['par_level']!r}: {entry!r}"
        )
