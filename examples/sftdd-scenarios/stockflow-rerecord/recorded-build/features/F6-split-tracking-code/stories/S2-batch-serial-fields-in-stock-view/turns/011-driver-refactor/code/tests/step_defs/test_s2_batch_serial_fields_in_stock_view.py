"""pytest-bdd step definitions for S2-batch-serial-fields-in-stock-view.

T11 - AC1: the app/routes stock detail payload carries batch_number and
           serial_number as two distinct fields for a populated row (real branch
           UP-state).

T13 - AC2: the app/routes stock detail payload emits JSON null for an unpopulated
           batch_number/serial_number, passing the NULL through untouched (real
           branch UP-state).

T15 - AC3: the app/routes stock detail payload contains no inventory_code key,
           proving the retired combined-code column is not serialized (real branch
           UP-state).

All three run against the shared UP-state Lakebase branch (databricks_postgres via
DATABASE_URL, migrations applied, no mock/stub/in-memory DB).
"""

import uuid

import pytest
import sqlalchemy
from fastapi.testclient import TestClient
from pytest_bdd import given, scenarios, then, when

from app.main import app

scenarios("../features/S2-batch-serial-fields-in-stock-view.feature")

_client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run_uid() -> str:
    return uuid.uuid4().hex[:8]


def _seed_with_batch_serial(db_session, sku: str, location: str,
                             batch_number: str, serial_number: str) -> None:
    """Idempotent seed: DELETE then INSERT with both batch and serial populated."""
    db_session.execute(
        sqlalchemy.text(
            "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": sku, "loc": location},
    )
    db_session.execute(
        sqlalchemy.text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, :qty, :bn, :sn)"
        ),
        {"sku": sku, "loc": location, "qty": 10, "bn": batch_number, "sn": serial_number},
    )
    db_session.commit()


def _seed_with_null_batch_serial(db_session, sku: str, location: str) -> None:
    """Idempotent seed: DELETE then INSERT with both batch and serial as NULL."""
    db_session.execute(
        sqlalchemy.text(
            "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": sku, "loc": location},
    )
    db_session.execute(
        sqlalchemy.text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, :qty, NULL, NULL)"
        ),
        {"sku": sku, "loc": location, "qty": 5},
    )
    db_session.commit()


# ---------------------------------------------------------------------------
# Per-scenario state container
# ---------------------------------------------------------------------------


@pytest.fixture()
def ctx():
    return {}


# ---------------------------------------------------------------------------
# T11 / T15 shared Given: a row with batch and serial populated
# ---------------------------------------------------------------------------


@given(
    "a stock record with batch number and serial number is seeded on the branch DB",
    target_fixture="ctx",
)
def seed_record_with_batch_serial(db_session):
    uid = _run_uid()
    sku = f"T11-SKU-{uid}"
    location = f"BIN-T11-{uid}"
    batch_number = f"BATCH-{uid}"
    serial_number = f"SER-{uid}"
    _seed_with_batch_serial(db_session, sku, location, batch_number, serial_number)
    return {
        "sku": sku,
        "location": location,
        "batch_number": batch_number,
        "serial_number": serial_number,
        "response": None,
    }


# ---------------------------------------------------------------------------
# T13 Given: a row with NULL batch and serial
# ---------------------------------------------------------------------------


@given(
    "a stock record with null batch_number and null serial_number is seeded on the branch DB",
    target_fixture="ctx",
)
def seed_record_with_null_batch_serial(db_session):
    uid = _run_uid()
    sku = f"T13-SKU-{uid}"
    location = f"BIN-T13-{uid}"
    _seed_with_null_batch_serial(db_session, sku, location)
    return {
        "sku": sku,
        "location": location,
        "response": None,
    }


# ---------------------------------------------------------------------------
# Shared When
# ---------------------------------------------------------------------------


@when("the operator requests the stock detail for that SKU")
def request_stock_detail(ctx):
    resp = _client.get(f"/api/stock/detail/{ctx['sku']}")
    ctx["response"] = resp


# ---------------------------------------------------------------------------
# T11 - response payload carries batch_number and serial_number as distinct fields
# ---------------------------------------------------------------------------


@then("the response payload carries batch_number and serial_number as two distinct fields")
def assert_batch_serial_distinct_fields(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from stock detail endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    entries = data.get("locations", [])
    matching = [e for e in entries if e.get("location") == ctx["location"]]
    assert matching, (
        f"No entry for location '{ctx['location']}' in response: {entries}"
    )
    entry = matching[0]

    # batch_number and serial_number must exist as distinct top-level keys in the entry.
    assert "batch_number" in entry, (
        f"Entry missing 'batch_number' key -- boundary has not been updated for S2: {entry}"
    )
    assert "serial_number" in entry, (
        f"Entry missing 'serial_number' key -- boundary has not been updated for S2: {entry}"
    )

    # Each must carry its own persisted value, not a combined or swapped value.
    assert entry["batch_number"] == ctx["batch_number"], (
        f"batch_number mismatch: expected {ctx['batch_number']!r}, got {entry['batch_number']!r}"
    )
    assert entry["serial_number"] == ctx["serial_number"], (
        f"serial_number mismatch: expected {ctx['serial_number']!r}, got {entry['serial_number']!r}"
    )


# ---------------------------------------------------------------------------
# T13 - response payload emits null for unpopulated batch/serial
# ---------------------------------------------------------------------------


@then("the response payload emits null for both batch_number and serial_number")
def assert_null_batch_serial_payload(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from stock detail endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    entries = data.get("locations", [])
    matching = [e for e in entries if e.get("location") == ctx["location"]]
    assert matching, (
        f"No entry for location '{ctx['location']}' in response: {entries}"
    )
    entry = matching[0]

    # Both keys must be present with JSON null values -- not omitted, not empty string.
    assert "batch_number" in entry, (
        "Entry missing 'batch_number' key; boundary must emit it as null, not omit it"
    )
    assert "serial_number" in entry, (
        "Entry missing 'serial_number' key; boundary must emit it as null, not omit it"
    )
    assert entry["batch_number"] is None, (
        f"Expected batch_number=null for a nonconforming row, got: {entry['batch_number']!r}"
    )
    assert entry["serial_number"] is None, (
        f"Expected serial_number=null for a nonconforming row, got: {entry['serial_number']!r}"
    )


# ---------------------------------------------------------------------------
# T15 - response payload contains no inventory_code key
# ---------------------------------------------------------------------------


@then("the response payload contains no inventory_code key")
def assert_no_inventory_code_key(ctx):
    resp = ctx["response"]
    assert resp.status_code == 200, (
        f"Expected 200 from stock detail endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    entries = data.get("locations", [])
    matching = [e for e in entries if e.get("location") == ctx["location"]]
    assert matching, (
        f"No entry for location '{ctx['location']}' in response: {entries}"
    )
    entry = matching[0]

    assert "inventory_code" not in entry, (
        f"inventory_code key still present in boundary payload -- "
        f"the retired combined-code column must not be serialized (S2/AC3): {entry}"
    )
