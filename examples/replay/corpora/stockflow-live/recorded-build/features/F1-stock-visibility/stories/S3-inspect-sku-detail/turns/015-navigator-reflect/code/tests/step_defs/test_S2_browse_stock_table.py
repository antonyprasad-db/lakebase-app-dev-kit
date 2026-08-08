"""Step definitions for S2-browse-stock-table, run against the real paired
Lakebase branch DB (never a mock). Binds tests/features/S2-browse-stock-table.feature.

Read path exercised end to end: GET /api/stock-records (app/routes) ->
StockService -> StockRepository, per architecture.md.
"""

import pytest
from sqlalchemy import text
from pytest_bdd import scenarios, given, when, then, parsers

scenarios("../features/S2-browse-stock-table.feature")

_TEST_SKUS = ["SKU-600", "SKU-700"]
_TEST_LOCATIONS = ["Z9"]


def _delete_test_rows(db_session):
    try:
        for sku in _TEST_SKUS:
            db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        for location in _TEST_LOCATIONS:
            db_session.execute(
                text("DELETE FROM stock_records WHERE location = :location"), {"location": location}
            )
        db_session.commit()
    except Exception:
        db_session.rollback()


@pytest.fixture(autouse=True)
def _clean_stock_records(db_session):
    _delete_test_rows(db_session)
    yield
    _delete_test_rows(db_session)


# ── Given ────────────────────────────────────────────────────────────────


@given(
    parsers.parse(
        'a stock record was filed for sku "{sku}" at location "{location}" '
        'with quantity {quantity:d} and inventory_code "{inventory_code}"'
    )
)
def a_stock_record_was_filed(client, sku, location, quantity, inventory_code):
    response = client.post(
        "/api/stock-records",
        json={
            "sku": sku,
            "location": location,
            "quantity": quantity,
            "inventory_code": inventory_code,
        },
    )
    assert response.status_code in (200, 201), response.text


@given(parsers.parse('no stock records exist for location "{location}"'))
def no_stock_records_exist_for_location(db_session, location):
    row = db_session.execute(
        text("SELECT 1 FROM stock_records WHERE location = :location"),
        {"location": location},
    ).fetchone()
    assert row is None


# ── When ─────────────────────────────────────────────────────────────────


@when("the team member opens the home stock-by-location table", target_fixture="response")
def the_team_member_opens_the_home_table(client):
    return client.get("/api/stock-records")


@when(
    parsers.parse('the team member views the stock table for location "{location}"'),
    target_fixture="response",
)
def the_team_member_views_the_table_for_location(client, location):
    return client.get("/api/stock-records", params={"location": location})


# ── Then ─────────────────────────────────────────────────────────────────


@then(
    parsers.parse(
        'the table lists a row for sku "{sku}" at location "{location}" with quantity {quantity:d}'
    )
)
def the_table_lists_a_row(response, sku, location, quantity):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/json"), response.headers
    body = response.json()
    rows = body["records"]
    matching = [
        row
        for row in rows
        if row["sku"] == sku and row["location"] == location and row["quantity"] == quantity
    ]
    assert matching, f"no row for sku={sku!r} location={location!r} quantity={quantity!r} in {rows!r}"


@then(parsers.parse('the table shows the message "{message}" instead of a blank page'))
def the_table_shows_the_empty_state_message(response, message):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/json"), response.headers
    body = response.json()
    assert body["records"] == [], body
    assert body.get("message") == message, body
