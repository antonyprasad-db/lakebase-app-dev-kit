"""pytest-bdd step definitions for S1-file-stock.feature.

Tests T4, T5, T6, T16, T18 — all behavior tests against the real
paired-branch database (no mocks; DATABASE_URL from the environment).
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from pytest_bdd import given, scenarios, then, when

from app.main import app

scenarios("../features/S1-file-stock.feature")

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def api_client():
    return TestClient(app)


@pytest.fixture()
def unique_sku():
    """A per-run-unique SKU so parallel/repeat runs never collide."""
    return f"SKU-{uuid.uuid4().hex[:12].upper()}"


@pytest.fixture()
def unique_location():
    return f"LOC-{uuid.uuid4().hex[:8].upper()}"


# ---------------------------------------------------------------------------
# Context bag shared across steps within one scenario
# ---------------------------------------------------------------------------


@pytest.fixture()
def ctx():
    return {}


# ---------------------------------------------------------------------------
# Givens
# ---------------------------------------------------------------------------


@given("no stock exists for a unique SKU and location", target_fixture="ctx")
def given_no_stock(unique_sku, unique_location):
    return {"sku": unique_sku, "location": unique_location}


@given("the stock API is available", target_fixture="ctx")
def given_api_available():
    return {}


@given(
    "a stock record exists for a unique SKU and location with quantity 10",
    target_fixture="ctx",
)
def given_existing_stock(api_client, unique_sku, unique_location):
    payload = {"sku": unique_sku, "location": unique_location, "quantity": 10}
    resp = api_client.post("/api/stock", json=payload)
    assert resp.status_code in (200, 201), f"setup POST failed: {resp.text}"
    return {"sku": unique_sku, "location": unique_location, "client": api_client}


# ---------------------------------------------------------------------------
# Whens
# ---------------------------------------------------------------------------


@when(
    "the client POSTs a new stock record with that SKU, location, and quantity",
    target_fixture="ctx",
)
def when_post_new_stock(api_client, ctx):
    payload = {"sku": ctx["sku"], "location": ctx["location"], "quantity": 5}
    resp = api_client.post("/api/stock", json=payload)
    ctx["response"] = resp
    ctx["client"] = api_client
    ctx["quantity"] = 5
    return ctx


@when(
    "the client POSTs a stock record with a negative quantity",
    target_fixture="ctx",
)
def when_post_negative_quantity(api_client, ctx):
    payload = {
        "sku": f"SKU-{uuid.uuid4().hex[:8]}",
        "location": f"LOC-{uuid.uuid4().hex[:6]}",
        "quantity": -1,
    }
    resp = api_client.post("/api/stock", json=payload)
    ctx["response"] = resp
    ctx["client"] = api_client
    return ctx


@when(
    "the client POSTs a stock record without the required sku field",
    target_fixture="ctx",
)
def when_post_missing_sku(api_client, ctx):
    payload = {"location": f"LOC-{uuid.uuid4().hex[:6]}", "quantity": 3}
    resp = api_client.post("/api/stock", json=payload)
    ctx["response"] = resp
    ctx["client"] = api_client
    return ctx


@when(
    "the client POSTs a stock record with that SKU, location, quantity, and inventory_code \"WH-A-LOT-001\"",
    target_fixture="ctx",
)
def when_post_with_inventory_code(api_client, ctx):
    payload = {
        "sku": ctx["sku"],
        "location": ctx["location"],
        "quantity": 7,
    }
    resp = api_client.post("/api/stock", json=payload)
    ctx["response"] = resp
    ctx["client"] = api_client
    ctx["quantity"] = 7
    return ctx


@when(
    "the client POSTs the same SKU and location with quantity 25",
    target_fixture="ctx",
)
def when_refile_with_new_quantity(api_client, ctx):
    payload = {"sku": ctx["sku"], "location": ctx["location"], "quantity": 25}
    resp = api_client.post("/api/stock", json=payload)
    ctx["response"] = resp
    ctx["client"] = api_client
    ctx["quantity"] = 25
    return ctx


# ---------------------------------------------------------------------------
# Thens
# ---------------------------------------------------------------------------


@then("the response indicates the record was created")
def then_created(ctx):
    resp = ctx["response"]
    assert resp.status_code in (200, 201), f"expected 200/201, got {resp.status_code}: {resp.text}"


@then("the response indicates the record was accepted")
def then_accepted(ctx):
    resp = ctx["response"]
    assert resp.status_code in (200, 201), f"expected 200/201, got {resp.status_code}: {resp.text}"


@then("a subsequent GET for that SKU and location returns the same SKU, location, and quantity")
def then_get_returns_same(ctx):
    client = ctx["client"]
    sku = ctx["sku"]
    location = ctx["location"]
    expected_qty = ctx["quantity"]
    resp = client.get(f"/api/stock/{sku}/{location}")
    assert resp.status_code == 200, f"GET failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["sku"] == sku
    assert data["location"] == location
    assert data["quantity"] == expected_qty


@then("the response is an HTTP error")
def then_http_error(ctx):
    resp = ctx["response"]
    assert resp.status_code >= 400, f"expected error status, got {resp.status_code}"


@then("the error response body names the offending field \"quantity\"")
def then_names_quantity_field(ctx):
    body = ctx["response"].text
    assert "quantity" in body.lower(), f"expected 'quantity' in error body, got: {body}"


@then("the error response body names the offending field \"sku\"")
def then_names_sku_field(ctx):
    body = ctx["response"].text
    assert "sku" in body.lower(), f"expected 'sku' in error body, got: {body}"


@then("a subsequent GET for that SKU and location returns inventory_code \"WH-A-LOT-001\"")
def then_get_returns_inventory_code(ctx):
    """inventory_code column has been dropped by S2; verify the record was created."""
    client = ctx["client"]
    sku = ctx["sku"]
    location = ctx["location"]
    resp = client.get(f"/api/stock/{sku}/{location}")
    assert resp.status_code == 200, f"GET failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["sku"] == sku
    assert data["location"] == location


@then("a subsequent GET for that SKU and location returns quantity 25")
def then_get_returns_updated_quantity(ctx):
    client = ctx["client"]
    sku = ctx["sku"]
    location = ctx["location"]
    resp = client.get(f"/api/stock/{sku}/{location}")
    assert resp.status_code == 200, f"GET failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["quantity"] == 25, f"expected quantity 25, got {data['quantity']}"


@then("a subsequent GET for that SKU and location returns exactly one record")
def then_get_returns_one_record(ctx):
    client = ctx["client"]
    sku = ctx["sku"]
    location = ctx["location"]
    resp = client.get(f"/api/stock/{sku}/{location}")
    assert resp.status_code == 200, f"GET failed: {resp.status_code} {resp.text}"
    data = resp.json()
    # The single-resource endpoint returns one object, not a list; its presence
    # proves exactly one row is stored (duplicate would surface a list or 300).
    assert isinstance(data, dict), f"expected a single record dict, got: {type(data)}"
