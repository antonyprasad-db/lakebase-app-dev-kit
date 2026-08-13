"""Step definitions for S3-inspect-sku-detail, run against the real paired
Lakebase branch DB (never a mock). Binds tests/features/S3-inspect-sku-detail.feature.

Read path exercised end to end: GET /api/stock-records/{sku} (app/routes) ->
StockService -> StockRepository, per architecture.md's canonical layering.
"""

import pytest
from sqlalchemy import text
from pytest_bdd import scenarios, given, when, then, parsers

scenarios("../features/S3-inspect-sku-detail.feature")

_TEST_SKUS = ["SKU-800", "SKU-810", "SKU-820", "SKU-830", "SKU-840"]


def _split_code(inventory_code: str) -> tuple[str, str | None]:
    """Mirror the split migration's rule at the glue layer: split the
    scenario's combined code label into (batch_number, serial_number). The
    split-code migration (S1-split-code-migration, AC1) retired the combined
    inventory_code column end-to-end; the api-boundary now uses
    batch_number/serial_number directly."""
    parts = inventory_code.split("-", 1)
    return parts[0], (parts[1] if len(parts) > 1 else None)


def _delete_test_rows(db_session):
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
            "batch_number": _split_code(inventory_code)[0],
            "serial_number": _split_code(inventory_code)[1],
        },
    )
    assert response.status_code in (200, 201), response.text


@given(
    parsers.parse(
        'a stock record was filed for sku "{sku}" at location "{location}" '
        'with quantity {quantity:d} and inventory_code "{inventory_code}" and no par level tracked'
    )
)
def a_stock_record_was_filed_with_no_par_level(client, sku, location, quantity, inventory_code):
    response = client.post(
        "/api/stock-records",
        json={
            "sku": sku,
            "location": location,
            "quantity": quantity,
            "batch_number": _split_code(inventory_code)[0],
            "serial_number": _split_code(inventory_code)[1],
        },
    )
    assert response.status_code in (200, 201), response.text


@given(
    parsers.parse(
        'a stock record was filed for sku "{sku}" at location "{location}" '
        'with quantity {quantity:d} and inventory_code "{inventory_code}" and par level {par_level:d}'
    )
)
def a_stock_record_was_filed_with_par_level(
    client, db_session, sku, location, quantity, inventory_code, par_level
):
    response = client.post(
        "/api/stock-records",
        json={
            "sku": sku,
            "location": location,
            "quantity": quantity,
            "batch_number": _split_code(inventory_code)[0],
            "serial_number": _split_code(inventory_code)[1],
        },
    )
    assert response.status_code in (200, 201), response.text
    db_session.execute(
        text(
            "UPDATE stock_records SET par_level = :par_level "
            "WHERE sku = :sku AND location = :location"
        ),
        {"par_level": par_level, "sku": sku, "location": location},
    )
    db_session.commit()


# ── When ─────────────────────────────────────────────────────────────────


@when(parsers.parse('the team member opens the detail view for sku "{sku}"'), target_fixture="response")
def the_team_member_opens_the_detail_view(client, sku):
    return client.get(f"/api/stock-records/{sku}")


# ── Then ─────────────────────────────────────────────────────────────────


def _records(response):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/json"), response.headers
    return response.json()["records"]


@then(parsers.parse('the detail view lists a row for location "{location}" with quantity {quantity:d}'))
def the_detail_view_lists_a_row_with_quantity(response, location, quantity):
    rows = _records(response)
    matching = [row for row in rows if row["location"] == location and row["quantity"] == quantity]
    assert matching, f"no row for location={location!r} quantity={quantity!r} in {rows!r}"


@then(parsers.parse('the detail view does not list any row for sku "{sku}"'))
def the_detail_view_does_not_list_any_row_for_sku(response, sku):
    rows = _records(response)
    leaked = [row for row in rows if row.get("sku") == sku]
    assert not leaked, f"row(s) for sku={sku!r} leaked into the detail view: {leaked!r}"


@then(
    parsers.parse(
        'the detail view lists a row for location "{location}" with inventory code "{inventory_code}"'
    )
)
def the_detail_view_lists_a_row_with_inventory_code(response, location, inventory_code):
    batch_number, serial_number = _split_code(inventory_code)
    rows = _records(response)
    matching = [
        row
        for row in rows
        if row["location"] == location
        and row["batch_number"] == batch_number
        and row["serial_number"] == serial_number
    ]
    assert matching, f"no row for location={location!r} inventory_code={inventory_code!r} in {rows!r}"


@then(parsers.parse('the detail view row for location "{location}" shows par level as "{label}"'))
def the_detail_view_row_shows_par_level_label(response, location, label):
    rows = _records(response)
    matching = [row for row in rows if row["location"] == location]
    assert matching, f"no row for location={location!r} in {rows!r}"
    row = matching[0]
    assert row["par_level"] is None, f"expected par_level null for a not-tracked row, got {row!r}"
    assert row["par_level_display"] == label, row


@then(parsers.parse("the detail view row for location \"{location}\" shows par level {par_level:d}"))
def the_detail_view_row_shows_par_level_value(response, location, par_level):
    rows = _records(response)
    matching = [row for row in rows if row["location"] == location]
    assert matching, f"no row for location={location!r} in {rows!r}"
    row = matching[0]
    assert row["par_level"] == par_level, row
    assert row["par_level_display"] == str(par_level), row
