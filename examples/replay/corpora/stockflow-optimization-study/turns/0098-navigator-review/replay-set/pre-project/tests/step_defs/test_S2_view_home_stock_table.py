"""pytest-bdd step definitions for S2-view-home-stock-table scenarios (T17, T21)."""

import uuid

import pytest
from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S2-view-home-stock-table.feature")

LIST_URL = "/api/stock"


# ── Shared context fixture ────────────────────────────────────────────────────


@pytest.fixture
def ctx():
    """Mutable dict for sharing state between steps within a scenario."""
    return {}


# ── T17: seeded-records listing ───────────────────────────────────────────────


@given("two stock records seeded with unique per-run keys for the table listing")
def seed_two_records_for_listing(ctx, client, db_session):
    """Seed two rows with per-run-unique SKUs/locations; register for cleanup."""
    run_id = uuid.uuid4().hex
    ctx["records"] = [
        {"sku": f"SKU-T17-A-{run_id}", "location": f"LOC-T17-A-{run_id}", "quantity": 10},
        {"sku": f"SKU-T17-B-{run_id}", "location": f"LOC-T17-B-{run_id}", "quantity": 25},
    ]
    for rec in ctx["records"]:
        client.post(
            "/api/stock/file",
            json={**rec, "tracking_code": f"TC-T17-{run_id}"},
        )

    yield

    # Cleanup: remove only the rows this test seeded
    for rec in ctx["records"]:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku AND location = :loc"),
            {"sku": rec["sku"], "loc": rec["location"]},
        )
    db_session.commit()


# ── T21: empty-store listing ──────────────────────────────────────────────────


@given("all stock records are cleared from the store")
def clear_all_stock_records(ctx, db_session):
    """Explicitly clear the whole table so GET /stock can return [] (T21).

    The autouse _restore_migration_head_after_each_test fixture in conftest.py
    restores schema after each test; data seeded by other tests uses per-run
    unique keys and is cleaned up by those tests, so the shared verify DB is
    left clean between runs. Truncating here is the 'explicitly clear the
    aggregate you claim empty' pattern from the test-strategy canon.
    """
    db_session.execute(text("DELETE FROM stock_records"))
    db_session.commit()


# ── Shared When/Then ──────────────────────────────────────────────────────────


@when("I GET /api/stock")
def get_stock_list(ctx, client):
    ctx["response"] = client.get(LIST_URL)


@then("the response contains one JSON object per seeded record carrying sku, location, and quantity fields")
def check_seeded_records_present(ctx):
    assert ctx["response"].status_code == 200, (
        f"Expected 200, got {ctx['response'].status_code}: {ctx['response'].text}"
    )
    body = ctx["response"].json()
    assert isinstance(body, list), f"Expected a JSON array, got: {type(body)}"

    # Index the response by sku for O(1) look-up
    by_sku = {item["sku"]: item for item in body}

    for rec in ctx["records"]:
        assert rec["sku"] in by_sku, (
            f"Expected SKU {rec['sku']!r} in response but it was absent; "
            f"response SKUs: {list(by_sku.keys())}"
        )
        item = by_sku[rec["sku"]]
        assert "location" in item, f"Record for {rec['sku']!r} missing 'location' field: {item}"
        assert "quantity" in item, f"Record for {rec['sku']!r} missing 'quantity' field: {item}"
        assert item["location"] == rec["location"], (
            f"Expected location {rec['location']!r}, got {item['location']!r}"
        )
        assert item["quantity"] == rec["quantity"], (
            f"Expected quantity {rec['quantity']}, got {item['quantity']}"
        )


@then("the response is an empty JSON array")
def check_response_is_empty_array(ctx):
    assert ctx["response"].status_code == 200, (
        f"Expected 200, got {ctx['response'].status_code}: {ctx['response'].text}"
    )
    body = ctx["response"].json()
    assert isinstance(body, list), f"Expected a JSON array, got: {type(body)}"
    assert body == [], f"Expected empty array [], got: {body}"
