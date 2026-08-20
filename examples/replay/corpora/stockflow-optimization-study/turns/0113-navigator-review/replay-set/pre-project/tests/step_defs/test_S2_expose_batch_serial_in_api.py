"""pytest-bdd step definitions for S2-expose-batch-serial-in-api (F6).

Scenarios covered:
  T20 – batch_number field returned when set
  T22 – serial_number field returned when set
  T24 – NULL batch_number preserved as explicit null
  T25 – NULL serial_number preserved as explicit null
  T27 – inventory_code field absent from response

All seeds use per-run-unique SKUs and clean up in fixture teardown so that
repeated runs against the shared Lakebase branch never collide.

RED reason (pre-S1 migration): the INSERT references batch_number/serial_number
columns that do not yet exist → ProgrammingError at the seed step.
RED reason (post-S1, pre-S2 implementation): the INSERT succeeds but
GET /api/stock/{sku} returns tracking_code rather than batch_number/serial_number
→ assertion failure on the Then step.
"""
import uuid

from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S2-expose-batch-serial-in-api.feature")


# ── Given: stock record with batch_number set (T20) ───────────────────────────


@given(
    "a stock record whose batch_number is set to a known value",
    target_fixture="stock_ctx",
)
def given_batch_set(db_session):
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T20-{rid}"
    loc = f"LOC-T20-{rid}"
    batch = f"BATCH-T20-{rid}"
    serial = f"SN-T20-{rid}"
    # Idempotent seed: remove any prior run's row before inserting.
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
    # batch_number / serial_number are added by the S1 migration.
    # This INSERT raises ProgrammingError ("column batch_number does not exist")
    # until S1 is applied → RED.
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 5, :batch, :serial)"
        ),
        {"sku": sku, "loc": loc, "batch": batch, "serial": serial},
    )
    db_session.commit()
    yield {"sku": sku, "batch_number": batch, "serial_number": serial}
    try:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku}
        )
        db_session.commit()
    except Exception:
        pass


# ── Given: stock record with serial_number set (T22) ─────────────────────────


@given(
    "a stock record whose serial_number is set to a known value",
    target_fixture="stock_ctx",
)
def given_serial_set(db_session):
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T22-{rid}"
    loc = f"LOC-T22-{rid}"
    batch = f"BATCH-T22-{rid}"
    serial = f"SN-T22-{rid}"
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 5, :batch, :serial)"
        ),
        {"sku": sku, "loc": loc, "batch": batch, "serial": serial},
    )
    db_session.commit()
    yield {"sku": sku, "batch_number": batch, "serial_number": serial}
    try:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku}
        )
        db_session.commit()
    except Exception:
        pass


# ── Given: stock record with NULL batch_number and serial_number (T24, T25) ──


@given(
    "a stock record whose batch_number and serial_number are NULL",
    target_fixture="stock_ctx",
)
def given_null_batch_serial(db_session):
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T24-{rid}"
    loc = f"LOC-T24-{rid}"
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 5, NULL, NULL)"
        ),
        {"sku": sku, "loc": loc},
    )
    db_session.commit()
    yield {"sku": sku, "batch_number": None, "serial_number": None}
    try:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku}
        )
        db_session.commit()
    except Exception:
        pass


# ── Given: any stock record exists (T27) ─────────────────────────────────────


@given("a stock record exists in the database", target_fixture="stock_ctx")
def given_record_exists(db_session):
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T27-{rid}"
    loc = f"LOC-T27-{rid}"
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
    # Use the post-S1 schema (batch_number / serial_number columns).
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 1, :batch, :serial)"
        ),
        {"sku": sku, "loc": loc, "batch": f"B-T27-{rid}", "serial": f"S-T27-{rid}"},
    )
    db_session.commit()
    yield {"sku": sku}
    try:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku}
        )
        db_session.commit()
    except Exception:
        pass


# ── When: API client fetches the record ──────────────────────────────────────


@when(
    "an API client fetches that stock record by SKU",
    target_fixture="response_ctx",
)
def when_fetch_stock(stock_ctx, client):
    sku = stock_ctx["sku"]
    resp = client.get(f"/api/stock/{sku}")
    assert resp.status_code == 200, (
        f"Expected 200 from GET /api/stock/{sku}; got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert isinstance(data, list) and len(data) >= 1, (
        f"Expected at least one record for sku={sku!r}; got: {data}"
    )
    return {"record": data[0], "stock_ctx": stock_ctx}


# ── Then: batch_number present and matches seeded value (T20) ─────────────────


@then("the response contains a batch_number field equal to the seeded batch value")
def then_batch_number_matches(response_ctx):
    record = response_ctx["record"]
    expected = response_ctx["stock_ctx"]["batch_number"]
    assert "batch_number" in record, (
        f"Response record must contain 'batch_number'; got keys: {sorted(record.keys())}"
    )
    assert record["batch_number"] == expected, (
        f"batch_number mismatch: expected {expected!r}, got {record['batch_number']!r}"
    )


# ── Then: serial_number present and matches seeded value (T22) ────────────────


@then("the response contains a serial_number field equal to the seeded serial value")
def then_serial_number_matches(response_ctx):
    record = response_ctx["record"]
    expected = response_ctx["stock_ctx"]["serial_number"]
    assert "serial_number" in record, (
        f"Response record must contain 'serial_number'; got keys: {sorted(record.keys())}"
    )
    assert record["serial_number"] == expected, (
        f"serial_number mismatch: expected {expected!r}, got {record['serial_number']!r}"
    )


# ── Then: batch_number is present and explicitly null (T24) ───────────────────


@then("the response body includes batch_number present and set to null")
def then_batch_null(response_ctx):
    record = response_ctx["record"]
    assert "batch_number" in record, (
        "Response must include 'batch_number' key with explicit null, not omit it; "
        f"got keys: {sorted(record.keys())}"
    )
    assert record["batch_number"] is None, (
        f"batch_number must be null for a NULL-batch record; got {record['batch_number']!r}"
    )


# ── Then: serial_number is present and explicitly null (T25) ──────────────────


@then("the response body includes serial_number present and set to null")
def then_serial_null(response_ctx):
    record = response_ctx["record"]
    assert "serial_number" in record, (
        "Response must include 'serial_number' key with explicit null, not omit it; "
        f"got keys: {sorted(record.keys())}"
    )
    assert record["serial_number"] is None, (
        f"serial_number must be null for a NULL-serial record; got {record['serial_number']!r}"
    )


# ── Then: inventory_code absent from response (T27) ───────────────────────────


@then("the response body does not contain an inventory_code field")
def then_no_inventory_code(response_ctx):
    record = response_ctx["record"]
    assert "inventory_code" not in record, (
        "Response must NOT contain the retired 'inventory_code' field; "
        f"got keys: {sorted(record.keys())}"
    )
