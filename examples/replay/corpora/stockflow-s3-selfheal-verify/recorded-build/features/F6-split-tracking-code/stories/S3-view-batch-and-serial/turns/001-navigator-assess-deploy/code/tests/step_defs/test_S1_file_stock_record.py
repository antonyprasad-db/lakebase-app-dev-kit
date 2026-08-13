"""Step definitions for S1-file-stock-record, run against the real paired
Lakebase branch DB (never a mock). Binds tests/features/S1-file-stock-record.feature.

The split-code migration (S1-split-code-migration, AC1) retired the combined
inventory_code column end-to-end; the api-boundary/service/repository now use
batch_number/serial_number directly. The feature file's Gherkin wording still
reads "inventory_code" (an unchanged scenario-level label), so these steps
split that label into batch_number/serial_number at the glue layer and drive
the API/DB with the current split-column contract.
"""

import pytest
from sqlalchemy import text
from pytest_bdd import scenarios, given, when, then, parsers

scenarios("../features/S1-file-stock-record.feature")

_TEST_SKUS = ["SKU-100", "SKU-200", "SKU-300", "SKU-400", "SKU-500"]


def _split_code(inventory_code: str) -> tuple[str, str | None]:
    """Mirror the split migration's rule at the glue layer: split the
    scenario's combined code label into (batch_number, serial_number)."""
    parts = inventory_code.split("-", 1)
    return parts[0], (parts[1] if len(parts) > 1 else None)


def _delete_test_rows(db_session):
    """FK-aware targeted DELETE so these scenarios are re-runnable against the
    shared branch without tripping PI1's unique(sku, location) constraint."""
    try:
        for sku in _TEST_SKUS:
            db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        db_session.commit()
    except Exception:
        db_session.rollback()


@pytest.fixture(autouse=True)
def _clean_stock_records(db_session):
    _delete_test_rows(db_session)
    yield
    _delete_test_rows(db_session)


# ── Given ────────────────────────────────────────────────────────────────


@given(parsers.parse('no stock record exists for sku "{sku}" at location "{location}"'))
def no_stock_record_exists(db_session, sku, location):
    row = db_session.execute(
        text("SELECT 1 FROM stock_records WHERE sku = :sku AND location = :location"),
        {"sku": sku, "location": location},
    ).fetchone()
    assert row is None


@given(
    parsers.parse(
        'a stock record was filed for sku "{sku}" at location "{location}" '
        'with quantity {quantity:d} and inventory_code "{inventory_code}"'
    )
)
def a_stock_record_was_filed(client, sku, location, quantity, inventory_code):
    batch_number, serial_number = _split_code(inventory_code)
    response = client.post(
        "/api/stock-records",
        json={
            "sku": sku,
            "location": location,
            "quantity": quantity,
            "batch_number": batch_number,
            "serial_number": serial_number,
        },
    )
    assert response.status_code in (200, 201), response.text


# ── When ─────────────────────────────────────────────────────────────────


@when(
    parsers.parse(
        'the team member files sku "{sku}" at location "{location}" '
        'with quantity {quantity:d} and inventory_code "{inventory_code}"'
    ),
    target_fixture="response",
)
def the_team_member_files(client, sku, location, quantity, inventory_code):
    batch_number, serial_number = _split_code(inventory_code)
    return client.post(
        "/api/stock-records",
        json={
            "sku": sku,
            "location": location,
            "quantity": quantity,
            "batch_number": batch_number,
            "serial_number": serial_number,
        },
    )


@when(
    parsers.parse('the team member retrieves the stock record for sku "{sku}" at location "{location}"'),
    target_fixture="response",
)
def the_team_member_retrieves(client, sku, location):
    return client.get(f"/api/stock-records/{sku}/{location}")


# ── Then ─────────────────────────────────────────────────────────────────


@then(
    parsers.parse(
        'the response confirms the filed record with sku "{sku}", location "{location}", '
        "quantity {quantity:d}, and inventory_code \"{inventory_code}\""
    )
)
def response_confirms_filed_record(response, sku, location, quantity, inventory_code):
    batch_number, serial_number = _split_code(inventory_code)
    assert response.status_code in (200, 201), response.text
    assert response.headers["content-type"].startswith("application/json"), response.headers
    body = response.json()
    assert body["sku"] == sku
    assert body["location"] == location
    assert body["quantity"] == quantity
    assert body["batch_number"] == batch_number
    assert body["serial_number"] == serial_number


@then(
    parsers.parse(
        'the response returns sku "{sku}", location "{location}", '
        "quantity {quantity:d}, and inventory_code \"{inventory_code}\""
    )
)
def response_returns_exact_record(response, sku, location, quantity, inventory_code):
    batch_number, serial_number = _split_code(inventory_code)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["sku"] == sku
    assert body["location"] == location
    assert body["quantity"] == quantity
    assert body["batch_number"] == batch_number
    assert body["serial_number"] == serial_number


@then(
    parsers.parse(
        'a stock record exists in the database for sku "{sku}" at location "{location}" '
        "with quantity {quantity:d} and inventory_code \"{inventory_code}\""
    )
)
def stock_record_exists_in_db(db_session, sku, location, quantity, inventory_code):
    batch_number, serial_number = _split_code(inventory_code)
    row = db_session.execute(
        text(
            "SELECT quantity, batch_number, serial_number FROM stock_records "
            "WHERE sku = :sku AND location = :location"
        ),
        {"sku": sku, "location": location},
    ).fetchone()
    assert row is not None
    assert row[0] == quantity
    assert row[1] == batch_number
    assert row[2] == serial_number


@then(parsers.parse('no stock record exists in the database for sku "{sku}" at location "{location}"'))
def no_stock_record_in_db(db_session, sku, location):
    row = db_session.execute(
        text("SELECT 1 FROM stock_records WHERE sku = :sku AND location = :location"),
        {"sku": sku, "location": location},
    ).fetchone()
    assert row is None


@then(
    parsers.parse(
        "exactly one stock record exists in the database for sku \"{sku}\" at location "
        '"{location}" and it holds quantity {quantity:d}'
    )
)
def exactly_one_stock_record(db_session, sku, location, quantity):
    rows = db_session.execute(
        text("SELECT quantity FROM stock_records WHERE sku = :sku AND location = :location"),
        {"sku": sku, "location": location},
    ).fetchall()
    assert len(rows) == 1, rows
    assert rows[0][0] == quantity


@then(parsers.parse('the response rejects the filing with an inline error naming the "{field}" field'))
def response_rejects_with_field_named_error(response, field):
    assert response.status_code in (400, 422), response.text
    assert response.headers["content-type"].startswith("application/json"), response.headers
    body = response.json()
    assert body.get("field") == field, body
    assert field in body.get("message", ""), body


@then("the response is not an error page")
def response_is_not_an_error_page(response):
    assert response.status_code < 400, response.text
    assert response.headers["content-type"].startswith("application/json"), response.headers
