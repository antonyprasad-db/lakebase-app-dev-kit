"""pytest-bdd step definitions for S2-view-home-stock-table scenarios (T17, T21)."""

import uuid

import pytest
from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S2-view-home-stock-table.feature")

STOCK_URL = "/stock"
FILE_URL = "/api/stock/file"


@pytest.fixture
def ctx():
    return {}


# ── Given ────────────────────────────────────────────────────────────────────


@given("one or more stock records seeded with unique per-run keys")
def seed_stock_records(ctx, client, db_session):
    skus = [f"SKU-{uuid.uuid4()}", f"SKU-{uuid.uuid4()}"]
    loc = f"LOC-{uuid.uuid4()}"
    ctx["seeded_skus"] = skus
    ctx["seeded_location"] = loc
    for i, sku in enumerate(skus):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity)"
                " VALUES (:sku, :loc, :qty)"
                " ON CONFLICT (sku, location) DO UPDATE SET quantity = EXCLUDED.quantity"
            ),
            {"sku": sku, "loc": loc, "qty": (i + 1) * 10},
        )
    db_session.commit()


@given("no stock records exist for the test run keys")
def no_stock_records(ctx):
    # T21: the endpoint must return [] when the table is empty relative to any
    # query; we assert on an empty array response – Driver implements GET /stock
    # returning all records, and this test depends on running against a clean
    # branch DB (or the endpoint being absent, which also fails the 200 check).
    ctx["seeded_skus"] = []


# ── When ─────────────────────────────────────────────────────────────────────


@when("I GET /stock")
def get_stock(ctx, client):
    ctx["response"] = client.get(STOCK_URL)


# ── Then ─────────────────────────────────────────────────────────────────────


@then("the response is a JSON array with one object per seeded record")
def check_array_length(ctx):
    assert ctx["response"].status_code == 200, (
        f"Expected 200, got {ctx['response'].status_code}: {ctx['response'].text}"
    )
    data = ctx["response"].json()
    assert isinstance(data, list), f"Expected a JSON array, got: {type(data)}"
    seeded_skus = set(ctx["seeded_skus"])
    returned_skus = {item["sku"] for item in data if "sku" in item}
    assert seeded_skus.issubset(returned_skus), (
        f"Seeded SKUs {seeded_skus} not all present in response SKUs {returned_skus}"
    )


@then("each object carries sku, location, and quantity fields")
def check_fields(ctx):
    data = ctx["response"].json()
    for item in data:
        for field in ("sku", "location", "quantity"):
            assert field in item, f"Field {field!r} missing from record: {item}"


@then("the response is an empty JSON array")
def check_empty_array(ctx):
    assert ctx["response"].status_code == 200, (
        f"Expected 200, got {ctx['response'].status_code}: {ctx['response'].text}"
    )
    data = ctx["response"].json()
    assert isinstance(data, list), f"Expected a JSON array, got: {type(data)}"
    assert len(data) == 0, f"Expected empty array, got {len(data)} records"
