"""Pytest-BDD step definitions for S3-sku-detail-view (T24, T27, T29, T31).

Tests run against the real paired Lakebase branch DB; NO mocks.
Each scenario seeds under per-run uuid-suffixed SKU keys and cleans up in finally.
"""

import uuid

import sqlalchemy as sa
from fastapi.testclient import TestClient
from pytest_bdd import given, scenarios, then, when

from app.database import SessionLocal
from app.main import app

scenarios("../features/S3-sku-detail-view.feature")

_client = TestClient(app)


def _make_sku() -> str:
    return f"SKU-S3-{uuid.uuid4().hex[:12]}"


def _make_location() -> str:
    return f"LOC-{uuid.uuid4().hex[:8]}"


def _cleanup_sku(sku: str) -> None:
    """Delete all test rows for the given SKU so no residue remains."""
    session = SessionLocal()
    try:
        session.execute(
            sa.text("DELETE FROM stock_records WHERE sku = :sku"),
            {"sku": sku},
        )
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


# ---------------------------------------------------------------------------
# T24 - AC1: SKU detail returns one entry per seeded location
# ---------------------------------------------------------------------------

@given(
    "a unique uuid-suffixed SKU with stock seeded at two distinct locations",
    target_fixture="detail_multi_ctx",
)
def given_sku_at_two_locations():
    sku = _make_sku()
    loc_a = _make_location()
    loc_b = _make_location()
    records = [
        {"sku": sku, "location": loc_a, "quantity": 10},
        {"sku": sku, "location": loc_b, "quantity": 25},
    ]
    session = SessionLocal()
    try:
        session.execute(
            sa.text("DELETE FROM stock_records WHERE sku = :sku"),
            {"sku": sku},
        )
        for r in records:
            session.execute(
                sa.text(
                    "INSERT INTO stock_records (sku, location, quantity) "
                    "VALUES (:sku, :location, :quantity)"
                ),
                r,
            )
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    return {"sku": sku, "records": records}


@when(
    "I request the SKU detail view for that multi-location sku",
    target_fixture="detail_response",
)
def when_request_sku_detail(detail_multi_ctx):
    sku = detail_multi_ctx["sku"]
    return _client.get(f"/api/stock/sku/{sku}")


@then(
    "the response is a JSON list with one entry per seeded location "
    "each carrying location and quantity"
)
def then_one_entry_per_location(detail_multi_ctx, detail_response):
    sku = detail_multi_ctx["sku"]
    try:
        assert detail_response.status_code == 200, (
            f"Expected 200, got {detail_response.status_code}: {detail_response.text}"
        )
        body = detail_response.json()
        assert isinstance(body, list), f"Expected a JSON list, got {type(body)}: {body}"
        assert len(body) == len(detail_multi_ctx["records"]), (
            f"Expected {len(detail_multi_ctx['records'])} location entries, "
            f"got {len(body)}: {body}"
        )
        by_location = {entry["location"]: entry for entry in body}
        for seeded in detail_multi_ctx["records"]:
            loc = seeded["location"]
            assert loc in by_location, (
                f"Location {loc!r} missing from SKU-detail response"
            )
            assert by_location[loc]["quantity"] == seeded["quantity"], (
                f"quantity mismatch for location {loc!r}: "
                f"got {by_location[loc]['quantity']}, expected {seeded['quantity']}"
            )
    finally:
        _cleanup_sku(sku)


# ---------------------------------------------------------------------------
# T27 - AC2: SKU detail entries carry the inventory_code
# ---------------------------------------------------------------------------

@given(
    "a stock record seeded with a known inventory_code under a unique uuid-suffixed SKU",
    target_fixture="detail_code_ctx",
)
def given_sku_with_known_inventory_code():
    sku = _make_sku()
    loc = _make_location()
    batch_number = f"BT-{uuid.uuid4().hex[:6].upper()}"
    serial_number = f"SR-{uuid.uuid4().hex[:6].upper()}"
    session = SessionLocal()
    try:
        session.execute(
            sa.text("DELETE FROM stock_records WHERE sku = :sku"),
            {"sku": sku},
        )
        session.execute(
            sa.text(
                "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :location, :quantity, :batch_number, :serial_number)"
            ),
            {"sku": sku, "location": loc, "quantity": 5, "batch_number": batch_number, "serial_number": serial_number},
        )
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    return {"sku": sku, "location": loc, "batch_number": batch_number, "serial_number": serial_number}


@when(
    "I request the SKU detail view for that tracked sku",
    target_fixture="detail_code_response",
)
def when_request_sku_detail_for_code(detail_code_ctx):
    sku = detail_code_ctx["sku"]
    return _client.get(f"/api/stock/sku/{sku}")


@then("each entry in the SKU-detail response carries the matching inventory_code")
def then_entries_carry_inventory_code(detail_code_ctx, detail_code_response):
    sku = detail_code_ctx["sku"]
    try:
        assert detail_code_response.status_code == 200, (
            f"Expected 200, got {detail_code_response.status_code}: "
            f"{detail_code_response.text}"
        )
        body = detail_code_response.json()
        assert isinstance(body, list), f"Expected a JSON list, got {type(body)}: {body}"
        assert len(body) >= 1, f"Expected at least 1 entry, got 0: {body}"
        entry = body[0]
        assert "batch_number" in entry, (
            f"SKU-detail entry missing 'batch_number' field: {entry}"
        )
        assert "serial_number" in entry, (
            f"SKU-detail entry missing 'serial_number' field: {entry}"
        )
        assert entry["batch_number"] == detail_code_ctx["batch_number"], (
            f"batch_number mismatch: got {entry['batch_number']!r}, "
            f"expected {detail_code_ctx['batch_number']!r}"
        )
        assert entry["serial_number"] == detail_code_ctx["serial_number"], (
            f"serial_number mismatch: got {entry['serial_number']!r}, "
            f"expected {detail_code_ctx['serial_number']!r}"
        )
    finally:
        _cleanup_sku(sku)


# ---------------------------------------------------------------------------
# T29 - AC3: absent par_level maps to explicit null in the DTO
# ---------------------------------------------------------------------------

@given(
    "a unique uuid-suffixed SKU whose stock record has no par_level set",
    target_fixture="detail_par_ctx",
)
def given_sku_with_null_par_level():
    sku = _make_sku()
    loc = _make_location()
    session = SessionLocal()
    try:
        session.execute(
            sa.text("DELETE FROM stock_records WHERE sku = :sku"),
            {"sku": sku},
        )
        session.execute(
            sa.text(
                "INSERT INTO stock_records (sku, location, quantity) "
                "VALUES (:sku, :location, :quantity)"
            ),
            {"sku": sku, "location": loc, "quantity": 7},
        )
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    return {"sku": sku, "location": loc}


@when(
    "I request the SKU detail view for that untracked-par sku",
    target_fixture="detail_par_response",
)
def when_request_sku_detail_for_par(detail_par_ctx):
    sku = detail_par_ctx["sku"]
    return _client.get(f"/api/stock/sku/{sku}")


@then(
    "the SKU-detail response carries par_level as an explicit null for each entry"
)
def then_par_level_is_explicit_null(detail_par_ctx, detail_par_response):
    sku = detail_par_ctx["sku"]
    try:
        assert detail_par_response.status_code == 200, (
            f"Expected 200, got {detail_par_response.status_code}: "
            f"{detail_par_response.text}"
        )
        body = detail_par_response.json()
        assert isinstance(body, list), f"Expected a JSON list, got {type(body)}: {body}"
        assert len(body) >= 1, (
            f"Expected at least 1 entry for SKU with no par_level, got 0"
        )
        for entry in body:
            assert "par_level" in entry, (
                f"SKU-detail entry missing 'par_level' field entirely: {entry}. "
                "The service must explicitly include par_level:null in the DTO."
            )
            assert entry["par_level"] is None, (
                f"Expected par_level to be null for a record with no par_level, "
                f"got {entry['par_level']!r}"
            )
    finally:
        _cleanup_sku(sku)


# ---------------------------------------------------------------------------
# T31 - AC4: SKU with zero stock returns empty list with HTTP 200
# ---------------------------------------------------------------------------

@given(
    "a unique uuid-suffixed SKU with zero stock records at any location",
    target_fixture="detail_empty_ctx",
)
def given_sku_with_no_stock():
    sku = _make_sku()
    # Ensure no residue from any prior interrupted run.
    session = SessionLocal()
    try:
        session.execute(
            sa.text("DELETE FROM stock_records WHERE sku = :sku"),
            {"sku": sku},
        )
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    return {"sku": sku}


@when(
    "I request the SKU detail view for that sku with no stock",
    target_fixture="detail_empty_response",
)
def when_request_sku_detail_empty(detail_empty_ctx):
    sku = detail_empty_ctx["sku"]
    return _client.get(f"/api/stock/sku/{sku}")


@then("the SKU-detail response is an empty JSON list with HTTP 200")
def then_empty_list_200(detail_empty_ctx, detail_empty_response):
    try:
        assert detail_empty_response.status_code == 200, (
            f"Expected 200 for SKU with no stock, "
            f"got {detail_empty_response.status_code}: {detail_empty_response.text}"
        )
        body = detail_empty_response.json()
        assert isinstance(body, list), (
            f"Expected a JSON list for SKU with no stock, got {type(body)}: {body}"
        )
        assert len(body) == 0, (
            f"Expected empty list for SKU with no stock records, "
            f"got {len(body)} entries"
        )
    finally:
        # No rows seeded; nothing to clean up.
        pass
