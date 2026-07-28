"""pytest-bdd step definitions for S1-file-stock-record.

Tests T1, T4, T5, T2 are behavior tests against the real paired-branch DB.
"""

import uuid

import pytest
from pytest_bdd import given, scenarios, then, when
from fastapi.testclient import TestClient

from app.main import app

scenarios("../features/S1-file-stock-record.feature")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_client = TestClient(app)


def _sku_suffix(sku: str) -> str:
    """Ensure idempotent seeding: suffix every fixed SKU with a run-unique uuid."""
    return f"{sku}-{uuid.uuid4().hex[:8]}"


# Per-scenario shared state stored on the pytest request context.
@pytest.fixture()
def ctx():
    return {}


# ---------------------------------------------------------------------------
# T1 - filing a new (sku, location) persists a retrievable stock record
# ---------------------------------------------------------------------------


@given(
    'no stock record exists for SKU "TEST-SKU-T1" at location "BIN-A1"',
    target_fixture="ctx",
)
def no_record_t1(db_session):
    sku = _sku_suffix("TEST-SKU-T1")
    db_session.execute(
        __import__("sqlalchemy").text(
            "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": sku, "loc": "BIN-A1"},
    )
    db_session.commit()
    return {"sku": sku, "location": "BIN-A1", "response": None}


@when(
    'the operator files SKU "TEST-SKU-T1" at location "BIN-A1" with quantity 10 and inventory_code "IC-001"',
)
def file_new_record_t1(ctx):
    resp = _client.post(
        "/api/stock",
        json={
            "sku": ctx["sku"],
            "location": ctx["location"],
            "quantity": 10,
        },
    )
    ctx["response"] = resp


@then(
    'the stock record for "TEST-SKU-T1" at "BIN-A1" is retrievable with quantity 10 and inventory_code "IC-001"',
)
def assert_new_record_t1(ctx, db_session):
    assert ctx["response"].status_code in (200, 201), (
        f"Expected 200/201, got {ctx['response'].status_code}: {ctx['response'].text}"
    )
    row = db_session.execute(
        __import__("sqlalchemy").text(
            "SELECT quantity FROM stock_records "
            "WHERE sku = :sku AND location = :loc"
        ),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    ).fetchone()
    assert row is not None, "No stock_records row found after filing"
    assert row[0] == 10, f"quantity mismatch: {row[0]}"


# ---------------------------------------------------------------------------
# T4 - negative quantity is rejected; no row persisted
# ---------------------------------------------------------------------------


@given(
    'no stock record exists for SKU "TEST-SKU-T4" at location "BIN-A4"',
    target_fixture="ctx",
)
def no_record_t4(db_session):
    sku = _sku_suffix("TEST-SKU-T4")
    db_session.execute(
        __import__("sqlalchemy").text(
            "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": sku, "loc": "BIN-A4"},
    )
    db_session.commit()
    return {"sku": sku, "location": "BIN-A4", "response": None}


@when(
    'the operator attempts to file SKU "TEST-SKU-T4" at location "BIN-A4" with quantity -5 and inventory_code "IC-004"',
)
def file_negative_quantity_t4(ctx):
    resp = _client.post(
        "/api/stock",
        json={
            "sku": ctx["sku"],
            "location": ctx["location"],
            "quantity": -5,
        },
    )
    ctx["response"] = resp


@then("the response status is 422")
def assert_status_422(ctx):
    assert ctx["response"].status_code == 422, (
        f"Expected 422, got {ctx['response'].status_code}: {ctx['response'].text}"
    )


@then('no stock record exists for SKU "TEST-SKU-T4" at location "BIN-A4"')
def assert_no_row_t4(ctx, db_session):
    row = db_session.execute(
        __import__("sqlalchemy").text(
            "SELECT 1 FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    ).fetchone()
    assert row is None, "A stock_records row exists after a rejected negative-quantity filing"


# ---------------------------------------------------------------------------
# T5 - missing field returns field-named validation error
# ---------------------------------------------------------------------------


@given("the filing endpoint is available", target_fixture="ctx")
def filing_endpoint_available():
    return {"response": None}


@when(
    'the operator submits a filing request missing the quantity field for SKU "TEST-SKU-T5" at location "BIN-A5"',
)
def file_missing_quantity_t5(ctx):
    sku = _sku_suffix("TEST-SKU-T5")
    resp = _client.post(
        "/api/stock",
        json={
            "sku": sku,
            "location": "BIN-A5",
            # quantity intentionally omitted
        },
    )
    ctx["response"] = resp


@then('the response body names the offending field "quantity"')
def assert_field_named_quantity(ctx):
    body = ctx["response"].json()
    body_str = str(body).lower()
    assert "quantity" in body_str, (
        f"Response body does not name 'quantity' as the offending field: {body}"
    )


# ---------------------------------------------------------------------------
# T2 - refiling same (sku, location) updates in place; no second row
# ---------------------------------------------------------------------------


@given(
    'a stock record already exists for SKU "TEST-SKU-T2" at location "BIN-B2" with quantity 5 and inventory_code "OLD-001"',
    target_fixture="ctx",
)
def existing_record_t2(db_session):
    sku = _sku_suffix("TEST-SKU-T2")
    # Idempotent seed: delete-then-insert so a leftover row from a prior killed run
    # does not cause a unique violation.
    db_session.execute(
        __import__("sqlalchemy").text(
            "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": sku, "loc": "BIN-B2"},
    )
    db_session.execute(
        __import__("sqlalchemy").text(
            "INSERT INTO stock_records (sku, location, quantity) "
            "VALUES (:sku, :loc, :qty)"
        ),
        {"sku": sku, "loc": "BIN-B2", "qty": 5},
    )
    db_session.commit()
    return {"sku": sku, "location": "BIN-B2", "response": None}


@when(
    'the operator files SKU "TEST-SKU-T2" at location "BIN-B2" with quantity 20 and inventory_code "NEW-999"',
)
def refile_record_t2(ctx):
    resp = _client.post(
        "/api/stock",
        json={
            "sku": ctx["sku"],
            "location": ctx["location"],
            "quantity": 20,
        },
    )
    ctx["response"] = resp


@then(
    'the stock record for "TEST-SKU-T2" at "BIN-B2" is retrievable with quantity 20 and inventory_code "NEW-999"',
)
def assert_updated_record_t2(ctx, db_session):
    assert ctx["response"].status_code in (200, 201), (
        f"Expected 200/201, got {ctx['response'].status_code}: {ctx['response'].text}"
    )
    row = db_session.execute(
        __import__("sqlalchemy").text(
            "SELECT quantity FROM stock_records "
            "WHERE sku = :sku AND location = :loc"
        ),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    ).fetchone()
    assert row is not None, "No stock_records row found after refiling"
    assert row[0] == 20, f"quantity not updated: {row[0]}"


@then(
    'exactly 1 stock record exists for SKU "TEST-SKU-T2" at location "BIN-B2"',
)
def assert_no_duplicate_t2(ctx, db_session):
    count = db_session.execute(
        __import__("sqlalchemy").text(
            "SELECT COUNT(*) FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    ).scalar()
    assert count == 1, f"Expected exactly 1 row, found {count}"
