"""pytest-bdd step definitions for S3-view-sku-detail scenarios (T24, T25, T26, T27)."""

import uuid

import pytest
from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S3-view-sku-detail.feature")

PRESENTATION_STRINGS = {"not tracked", "untracked", "n/a", "none", "-", ""}


@pytest.fixture
def ctx():
    return {}


# ── T24: two-location detail ─────────────────────────────────────────────────


@given("a SKU stocked at two locations seeded with unique per-run keys")
def seed_sku_at_two_locations(ctx, client, db_session):
    run_id = uuid.uuid4().hex
    sku = f"SKU-T24-{run_id}"
    ctx["sku"] = sku
    ctx["locations"] = [
        {"sku": sku, "location": f"LOC-T24-A-{run_id}", "quantity": 10},
        {"sku": sku, "location": f"LOC-T24-B-{run_id}", "quantity": 20},
    ]
    for rec in ctx["locations"]:
        resp = client.post("/api/stock/file", json=rec)
        assert resp.status_code in (200, 201), f"Seed failed: {resp.text}"

    yield

    for rec in ctx["locations"]:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku AND location = :loc"),
            {"sku": rec["sku"], "loc": rec["location"]},
        )
    db_session.commit()


@when("I GET /api/stock/<sku>")
def get_sku_detail(ctx, client):
    ctx["response"] = client.get(f"/api/stock/{ctx['sku']}")


@then("the response contains exactly one JSON object per seeded location each with location and quantity")
def check_one_object_per_location(ctx):
    assert ctx["response"].status_code == 200, (
        f"Expected 200, got {ctx['response'].status_code}: {ctx['response'].text}"
    )
    body = ctx["response"].json()
    assert isinstance(body, list), f"Expected a JSON array, got: {type(body)}"

    seeded_locations = {rec["location"] for rec in ctx["locations"]}
    response_locations = {item["location"] for item in body if "location" in item}

    # Every seeded location must appear exactly once
    for rec in ctx["locations"]:
        matching = [item for item in body if item.get("location") == rec["location"]]
        assert len(matching) == 1, (
            f"Expected exactly 1 item for location {rec['location']!r}, found {len(matching)}"
        )
        item = matching[0]
        assert "quantity" in item, f"Item for {rec['location']!r} missing 'quantity': {item}"
        assert item["quantity"] == rec["quantity"], (
            f"Expected quantity {rec['quantity']}, got {item['quantity']}"
        )

    # No extra locations beyond the seeded ones for this SKU
    extra = response_locations - seeded_locations
    assert not extra, f"Response contained unexpected locations: {extra}"


# ── T25: tracking code present ───────────────────────────────────────────────


@given("a stock record seeded with a unique per-run key and a non-empty combined tracking code")
def seed_record_with_tracking_code(ctx, client, db_session):
    run_id = uuid.uuid4().hex
    ctx["sku"] = f"SKU-T25-{run_id}"
    ctx["location"] = f"LOC-T25-{run_id}"
    ctx["tracking_code"] = f"TC-{run_id}-BATCH42"
    resp = client.post(
        "/api/stock/file",
        json={
            "sku": ctx["sku"],
            "location": ctx["location"],
            "quantity": 5,
            "tracking_code": ctx["tracking_code"],
        },
    )
    assert resp.status_code in (200, 201), f"Seed failed: {resp.text}"

    yield

    db_session.execute(
        text("DELETE FROM stock_records WHERE sku = :sku AND location = :loc"),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    )
    db_session.commit()


@then("the response contains the record with the combined tracking code matching the seeded value")
def check_tracking_code_in_response(ctx):
    assert ctx["response"].status_code == 200, (
        f"Expected 200, got {ctx['response'].status_code}: {ctx['response'].text}"
    )
    body = ctx["response"].json()
    assert isinstance(body, list), f"Expected a JSON array, got: {type(body)}"

    matching = [item for item in body if item.get("location") == ctx["location"]]
    assert len(matching) == 1, f"Expected 1 item for location, found: {len(matching)}"
    item = matching[0]
    assert "tracking_code" in item, f"'tracking_code' field missing from: {item}"
    assert item["tracking_code"] == ctx["tracking_code"], (
        f"Expected tracking_code {ctx['tracking_code']!r}, got {item['tracking_code']!r}"
    )


# ── T26 / T27: no par level ──────────────────────────────────────────────────


@given("a stock record seeded with a unique per-run key and no par level set")
def seed_record_without_par_level(ctx, client, db_session):
    run_id = uuid.uuid4().hex
    ctx["sku"] = f"SKU-T26-{run_id}"
    ctx["location"] = f"LOC-T26-{run_id}"
    # tracking_code is required by the current boundary; the test asserts on par_level only
    resp = client.post(
        "/api/stock/file",
        json={
            "sku": ctx["sku"],
            "location": ctx["location"],
            "quantity": 3,
            "tracking_code": f"TC-T26-{run_id}",
        },
    )
    assert resp.status_code in (200, 201), f"Seed failed: {resp.text}"

    yield

    db_session.execute(
        text("DELETE FROM stock_records WHERE sku = :sku AND location = :loc"),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    )
    db_session.commit()


@then("the response contains the record with the par level field absent or null")
def check_par_level_absent_or_null(ctx):
    assert ctx["response"].status_code == 200, (
        f"Expected 200, got {ctx['response'].status_code}: {ctx['response'].text}"
    )
    body = ctx["response"].json()
    assert isinstance(body, list), f"Expected a JSON array, got: {type(body)}"

    matching = [item for item in body if item.get("location") == ctx["location"]]
    assert len(matching) == 1, f"Expected 1 item for location, found: {len(matching)}"
    item = matching[0]

    # par_level should either be absent or explicitly null
    par_level = item.get("par_level", None)
    assert par_level is None, (
        f"Expected par_level to be null/absent but got: {par_level!r}"
    )


@then("the par level field in the response is null or absent not a presentation string")
def check_par_level_not_presentation_string(ctx):
    assert ctx["response"].status_code == 200, (
        f"Expected 200, got {ctx['response'].status_code}: {ctx['response'].text}"
    )
    body = ctx["response"].json()
    assert isinstance(body, list), f"Expected a JSON array, got: {type(body)}"

    matching = [item for item in body if item.get("location") == ctx["location"]]
    assert len(matching) == 1, f"Expected 1 item for location, found: {len(matching)}"
    item = matching[0]

    par_level = item.get("par_level", None)
    assert par_level is None, (
        f"Boundary must NOT synthesize a presentation string for untracked par level; "
        f"got {par_level!r} — only null/absent is acceptable"
    )
    # Redundant but explicit: ensure it's not a known presentation string disguised as a value
    if par_level is not None:
        assert str(par_level).strip().lower() not in PRESENTATION_STRINGS, (
            f"Boundary injected a presentation string {par_level!r} into the JSON response"
        )
