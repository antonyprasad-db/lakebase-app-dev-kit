"""pytest-bdd step definitions for S1-file-stock-record scenarios (T9-T11, T13-T16)."""

import uuid

import pytest
from pytest_bdd import given, parsers, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S1-file-stock-record.feature")

FILE_URL = "/api/stock/file"


# ── Shared context fixture ────────────────────────────────────────────────────


@pytest.fixture
def ctx():
    """Mutable dict for sharing state between steps within a scenario."""
    return {}


# ── Given steps ──────────────────────────────────────────────────────────────


@given("a unique new SKU and location for filing")
def unique_sku_and_location(ctx):
    ctx["sku"] = f"SKU-{uuid.uuid4()}"
    ctx["location"] = f"LOC-{uuid.uuid4()}"


@given("a filing payload that omits the SKU field")
def payload_missing_sku(ctx):
    ctx["payload"] = {
        "location": f"LOC-{uuid.uuid4()}",
        "quantity": 10,
        "tracking_code": "TC-001",
    }


@given("a filing payload with a blank tracking_code")
def payload_blank_tracking_code(ctx):
    ctx["payload"] = {
        "sku": ctx["sku"],
        "location": ctx["location"],
        "quantity": 10,
        "tracking_code": "",
    }


@given("an existing stock record with quantity 10 for a unique SKU and location")
def existing_stock_record(ctx, client):
    ctx["sku"] = f"SKU-{uuid.uuid4()}"
    ctx["location"] = f"LOC-{uuid.uuid4()}"
    # Seed via API; if the endpoint is not yet implemented (RED), the POST returns
    # a non-2xx response and the Then assertions will still fail the test as RED.
    client.post(
        FILE_URL,
        json={
            "sku": ctx["sku"],
            "location": ctx["location"],
            "quantity": 10,
            "tracking_code": "TC-SEED",
        },
    )


# ── When steps ───────────────────────────────────────────────────────────────


@when('I POST a valid filing with quantity 50 and tracking code "TC-001"')
def post_valid_filing(ctx, client):
    ctx["response"] = client.post(
        FILE_URL,
        json={
            "sku": ctx["sku"],
            "location": ctx["location"],
            "quantity": 50,
            "tracking_code": "TC-001",
        },
    )


@when("I POST the filing payload")
def post_filing_payload(ctx, client):
    ctx["response"] = client.post(FILE_URL, json=ctx.get("payload", {}))


@when("I POST a second filing for the same SKU and location with quantity 99")
def post_second_filing(ctx, client):
    ctx["response"] = client.post(
        FILE_URL,
        json={
            "sku": ctx["sku"],
            "location": ctx["location"],
            "quantity": 99,
            "tracking_code": "TC-UPDATE",
        },
    )


@when(parsers.re(r"I POST a filing with quantity (?P<qty>-?\d+)"))
def post_filing_with_quantity(ctx, client, qty):
    ctx["response"] = client.post(
        FILE_URL,
        json={
            "sku": ctx["sku"],
            "location": ctx["location"],
            "quantity": int(qty),
            "tracking_code": "TC-TEST",
        },
    )


# ── Then steps ───────────────────────────────────────────────────────────────


@then(parsers.parse("the response status is {status:d}"))
def check_response_status(ctx, status):
    assert ctx["response"].status_code == status, (
        f"Expected {status}, got {ctx['response'].status_code}: {ctx['response'].text}"
    )


@then("the response is an HTTP error")
def check_response_is_error(ctx):
    assert ctx["response"].status_code >= 400, (
        f"Expected HTTP 4xx/5xx, got {ctx['response'].status_code}: {ctx['response'].text}"
    )


@then("the response is successful")
def check_response_is_successful(ctx):
    assert ctx["response"].status_code in (200, 201), (
        f"Expected 200 or 201, got {ctx['response'].status_code}: {ctx['response'].text}"
    )


@then(parsers.parse('the response body names the "{field}" field'))
def check_response_names_field(ctx, field):
    body = ctx["response"].text.lower()
    assert field.lower() in body, (
        f"Expected response body to name field {field!r}, got: {ctx['response'].text}"
    )


@then('the record is stored with quantity 50 and tracking code "TC-001"')
def check_record_stored(ctx, db_session):
    row = db_session.execute(
        text(
            "SELECT quantity, tracking_code FROM stock_records"
            " WHERE sku = :sku AND location = :loc"
        ),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    ).fetchone()
    assert row is not None, (
        f"No record found for sku={ctx['sku']!r}, location={ctx['location']!r}"
    )
    assert row.quantity == 50, f"Expected quantity 50, got {row.quantity}"
    assert row.tracking_code == "TC-001", (
        f"Expected tracking_code 'TC-001', got {row.tracking_code!r}"
    )


@then("the stored quantity for that SKU and location is 99")
def check_stored_quantity_is_99(ctx, db_session):
    row = db_session.execute(
        text("SELECT quantity FROM stock_records WHERE sku = :sku AND location = :loc"),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    ).fetchone()
    assert row is not None, (
        f"No record found for sku={ctx['sku']!r}, location={ctx['location']!r}"
    )
    assert row.quantity == 99, f"Expected quantity 99, got {row.quantity}"


@then("exactly one record exists for that SKU and location in the store")
def check_exactly_one_record(ctx, db_session):
    count = db_session.execute(
        text(
            "SELECT COUNT(*) FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    ).scalar()
    assert count == 1, (
        f"Expected exactly 1 record for sku={ctx['sku']!r}, location={ctx['location']!r},"
        f" found {count}"
    )


@then("no record exists for that SKU and location in the store")
def check_no_record_exists(ctx, db_session):
    count = db_session.execute(
        text(
            "SELECT COUNT(*) FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    ).scalar()
    assert count == 0, (
        f"Expected 0 records for sku={ctx['sku']!r}, location={ctx['location']!r},"
        f" found {count}"
    )
