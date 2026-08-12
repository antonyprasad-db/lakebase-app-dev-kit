"""pytest-bdd step definitions for S3-expose-batch-serial-in-stock-ui.feature.

T34 – AC1: detail API returns batch_number as a distinct top-level field with the correct value.
T35 – AC1: detail API returns serial_number as a distinct top-level field with the correct value.
T40 – AC2: list API records contain batch_number as a distinct field.
T41 – AC2: list API records contain serial_number as a distinct field.
T45 – AC3: detail API returns batch_number as JSON null when the DB column is NULL.
T46 – AC3: detail API returns serial_number as JSON null when the DB column is NULL.
T47 – AC3: list API returns null batch/serial with all remaining fields present.
T53 – AC4: detail API response has no inventory_code field.
T54 – AC4: list API records have no inventory_code field.

Real paired-branch database only (DATABASE_URL from env); no mocks.
Per-run-unique keys via uuid to prevent key collisions across runs.
"""

import uuid

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from pytest_bdd import given, scenarios, then, when

from app.main import app

scenarios("../features/S3-expose-batch-serial-in-stock-ui.feature")


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


@given(
    "a stock record with batch_number and serial_number populated exists in the database",
    target_fixture="ctx",
)
def given_stock_record_with_batch_serial(api_client, db_session):
    """Seed one stock record with both batch_number and serial_number set."""
    run_id = uuid.uuid4().hex[:10].upper()
    sku = f"SKU-S3UI-{run_id}"
    location = f"LOC-S3UI-{run_id}"
    batch_number = f"BATCH-{run_id}"
    serial_number = f"SERIAL-{run_id}"
    quantity = 5

    db_session.execute(
        sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
        {"sku": sku, "loc": location},
    )
    db_session.commit()
    db_session.execute(
        sa.text(
            "INSERT INTO stock (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :loc, :qty, :batch, :serial)"
        ),
        {
            "sku": sku,
            "loc": location,
            "qty": quantity,
            "batch": batch_number,
            "serial": serial_number,
        },
    )
    db_session.commit()

    return {
        "sku": sku,
        "location": location,
        "batch_number": batch_number,
        "serial_number": serial_number,
        "quantity": quantity,
        "client": api_client,
    }


@given(
    "stock records with batch_number and serial_number populated exist in the database",
    target_fixture="ctx",
)
def given_multiple_stock_records_with_batch_serial(api_client, db_session):
    """Seed two stock records each with batch_number and serial_number set."""
    run_id = uuid.uuid4().hex[:10].upper()
    records = [
        {
            "sku": f"SKU-S3L-{run_id}-A",
            "location": f"LOC-S3L-{run_id}-A",
            "batch_number": f"BATCH-{run_id}-A",
            "serial_number": f"SERIAL-{run_id}-A",
            "quantity": 3,
        },
        {
            "sku": f"SKU-S3L-{run_id}-B",
            "location": f"LOC-S3L-{run_id}-B",
            "batch_number": f"BATCH-{run_id}-B",
            "serial_number": f"SERIAL-{run_id}-B",
            "quantity": 7,
        },
    ]
    for rec in records:
        db_session.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": rec["sku"], "loc": rec["location"]},
        )
    db_session.commit()
    for rec in records:
        db_session.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :loc, :qty, :batch, :serial)"
            ),
            {
                "sku": rec["sku"],
                "loc": rec["location"],
                "qty": rec["quantity"],
                "batch": rec["batch_number"],
                "serial": rec["serial_number"],
            },
        )
    db_session.commit()

    return {"records": records, "client": api_client}


@given(
    "a stock record whose batch_number is NULL exists in the database",
    target_fixture="ctx",
)
def given_stock_record_null_batch(api_client, db_session):
    """Seed a stock record with batch_number=NULL and serial_number set."""
    run_id = uuid.uuid4().hex[:10].upper()
    sku = f"SKU-S3NBN-{run_id}"
    location = f"LOC-S3NBN-{run_id}"

    db_session.execute(
        sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
        {"sku": sku, "loc": location},
    )
    db_session.commit()
    db_session.execute(
        sa.text(
            "INSERT INTO stock (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :loc, 4, NULL, :serial)"
        ),
        {"sku": sku, "loc": location, "serial": f"SERIAL-{run_id}"},
    )
    db_session.commit()

    return {"sku": sku, "location": location, "client": api_client}


@given(
    "a stock record whose serial_number is NULL exists in the database",
    target_fixture="ctx",
)
def given_stock_record_null_serial(api_client, db_session):
    """Seed a stock record with serial_number=NULL and batch_number set."""
    run_id = uuid.uuid4().hex[:10].upper()
    sku = f"SKU-S3NSN-{run_id}"
    location = f"LOC-S3NSN-{run_id}"

    db_session.execute(
        sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
        {"sku": sku, "loc": location},
    )
    db_session.commit()
    db_session.execute(
        sa.text(
            "INSERT INTO stock (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :loc, 4, :batch, NULL)"
        ),
        {"sku": sku, "loc": location, "batch": f"BATCH-{run_id}"},
    )
    db_session.commit()

    return {"sku": sku, "location": location, "client": api_client}


@given(
    "a stock record whose batch_number and serial_number are NULL exists in the database",
    target_fixture="ctx",
)
def given_stock_record_null_both(api_client, db_session):
    """Seed a stock record with both batch_number and serial_number NULL."""
    run_id = uuid.uuid4().hex[:10].upper()
    sku = f"SKU-S3NULL-{run_id}"
    location = f"LOC-S3NULL-{run_id}"
    quantity = 6

    db_session.execute(
        sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
        {"sku": sku, "loc": location},
    )
    db_session.commit()
    db_session.execute(
        sa.text(
            "INSERT INTO stock (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :loc, :qty, NULL, NULL)"
        ),
        {"sku": sku, "loc": location, "qty": quantity},
    )
    db_session.commit()

    return {"sku": sku, "location": location, "quantity": quantity, "client": api_client}


# ---------------------------------------------------------------------------
# Whens
# ---------------------------------------------------------------------------


@when("the client GETs the detail API endpoint for that stock record", target_fixture="ctx")
def when_get_stock_detail(api_client, ctx):
    sku = ctx["sku"]
    location = ctx["location"]
    resp = api_client.get(f"/api/stock/{sku}/{location}")
    ctx["response"] = resp
    return ctx


@when("the client GETs the stock list API endpoint", target_fixture="ctx")
def when_get_stock_list(api_client, ctx):
    resp = api_client.get("/api/stock")
    ctx["response"] = resp
    return ctx


# ---------------------------------------------------------------------------
# Thens
# ---------------------------------------------------------------------------


@then("the JSON response contains batch_number as a distinct top-level field with its correct value")
def then_response_has_batch_number(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from detail endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert "batch_number" in data, (
        "batch_number must be a distinct top-level field in the detail API response. "
        f"Got keys: {list(data.keys())!r}"
    )
    assert data["batch_number"] == ctx["batch_number"], (
        f"batch_number value mismatch: expected {ctx['batch_number']!r}, "
        f"got {data['batch_number']!r}"
    )


@then("the JSON response contains serial_number as a distinct top-level field with its correct value")
def then_response_has_serial_number(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from detail endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert "serial_number" in data, (
        "serial_number must be a distinct top-level field in the detail API response. "
        f"Got keys: {list(data.keys())!r}"
    )
    assert data["serial_number"] == ctx["serial_number"], (
        f"serial_number value mismatch: expected {ctx['serial_number']!r}, "
        f"got {data['serial_number']!r}"
    )


@then("each seeded record in the JSON response contains batch_number as a distinct field")
def then_list_records_have_batch_number(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from list endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert isinstance(data, list), (
        f"Expected a JSON array from the list API, got {type(data).__name__!r}"
    )
    by_key = {(r.get("sku"), r.get("location")): r for r in data}
    for seeded in ctx["records"]:
        key = (seeded["sku"], seeded["location"])
        assert key in by_key, (
            f"Seeded record {key!r} not found in list API response."
        )
        record = by_key[key]
        assert "batch_number" in record, (
            f"batch_number must be a distinct field in the list API response record {key!r}. "
            f"Got keys: {list(record.keys())!r}"
        )


@then("each seeded record in the JSON response contains serial_number as a distinct field")
def then_list_records_have_serial_number(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from list endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert isinstance(data, list), (
        f"Expected a JSON array from the list API, got {type(data).__name__!r}"
    )
    by_key = {(r.get("sku"), r.get("location")): r for r in data}
    for seeded in ctx["records"]:
        key = (seeded["sku"], seeded["location"])
        assert key in by_key, (
            f"Seeded record {key!r} not found in list API response."
        )
        record = by_key[key]
        assert "serial_number" in record, (
            f"serial_number must be a distinct field in the list API response record {key!r}. "
            f"Got keys: {list(record.keys())!r}"
        )


@then("batch_number is present in the JSON response as null rather than absent or an error")
def then_batch_number_is_null(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from detail endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert "batch_number" in data, (
        "batch_number must be present as JSON null when the DB column is NULL — "
        f"must NOT be omitted. Got keys: {list(data.keys())!r}"
    )
    assert data["batch_number"] is None, (
        f"batch_number must be JSON null, got {data['batch_number']!r}"
    )


@then("serial_number is present in the JSON response as null rather than absent or an error")
def then_serial_number_is_null(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from detail endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert "serial_number" in data, (
        "serial_number must be present as JSON null when the DB column is NULL — "
        f"must NOT be omitted. Got keys: {list(data.keys())!r}"
    )
    assert data["serial_number"] is None, (
        f"serial_number must be JSON null, got {data['serial_number']!r}"
    )


@then(
    "batch_number and serial_number are null in the seeded record and the remaining fields are still present"
)
def then_list_null_batch_serial_full_record(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from list endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert isinstance(data, list), (
        f"Expected a JSON array from the list API, got {type(data).__name__!r}"
    )
    sku = ctx["sku"]
    location = ctx["location"]
    my_record = next(
        (r for r in data if r.get("sku") == sku and r.get("location") == location),
        None,
    )
    assert my_record is not None, (
        f"Seeded record (sku={sku!r}, location={location!r}) not found in list API response."
    )
    assert "batch_number" in my_record, (
        "batch_number must be present (as JSON null) in the list record — "
        f"must NOT be omitted. Got keys: {list(my_record.keys())!r}"
    )
    assert my_record["batch_number"] is None, (
        f"batch_number must be JSON null, got {my_record['batch_number']!r}"
    )
    assert "serial_number" in my_record, (
        "serial_number must be present (as JSON null) in the list record — "
        f"must NOT be omitted. Got keys: {list(my_record.keys())!r}"
    )
    assert my_record["serial_number"] is None, (
        f"serial_number must be JSON null, got {my_record['serial_number']!r}"
    )
    for required_field in ("sku", "location", "quantity"):
        assert required_field in my_record, (
            f"Field {required_field!r} must still be present in the list record "
            "when batch_number and serial_number are null."
        )


@then("the JSON response does not contain an inventory_code field")
def then_response_has_no_inventory_code(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from detail endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert "inventory_code" not in data, (
        "inventory_code must NOT appear in the detail API response — "
        "it has been replaced by the discrete batch_number and serial_number fields (AC4). "
        f"Got keys: {list(data.keys())!r}"
    )


@then("no record in the JSON response contains an inventory_code field")
def then_list_no_inventory_code(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from list endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert isinstance(data, list), (
        f"Expected a JSON array from the list API, got {type(data).__name__!r}"
    )
    violations = [r for r in data if "inventory_code" in r]
    assert not violations, (
        "inventory_code must NOT appear in any list API response record — "
        "it has been replaced by batch_number and serial_number (AC4). "
        f"Found inventory_code in {len(violations)} record(s) with SKUs: "
        f"{[r.get('sku') for r in violations]!r}"
    )
