"""pytest-bdd step definitions for S3-display-batch-serial-separately (F6).

Scenarios covered:
  T32 – batch_number returned in GET /api/stock list
  T33 – serial_number returned in GET /api/stock list
  T44 – inventory_code absent from GET /api/stock list
  T36 – POST /api/stock persists batch_number
  T37 – POST /api/stock persists serial_number
  T40 – NULL batch_number preserved as explicit null in GET /api/stock list
  T41 – NULL serial_number preserved as explicit null in GET /api/stock list

RED reasons:
  T32/T33/T40/T41/T44: list_all() in StockRepository returns 'tracking_code' not
    batch_number/serial_number → assertion failure on the Then step.
  T36/T37: POST /api/stock endpoint does not exist yet → 404 or missing route.
"""

import uuid

import pytest
from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S3-display-batch-serial-separately.feature")


# ── T32: seeded record with batch_number ─────────────────────────────────────


@given(
    'a stock record seeded with a uuid-suffixed sku and batch_number "B001" for T32',
    target_fixture="t32_ctx",
)
def given_t32_batch(db_session):
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T32-{rid}"
    loc = f"LOC-T32-{rid}"
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 1, 'B001', NULL)"
        ),
        {"sku": sku, "loc": loc},
    )
    db_session.commit()
    yield {"sku": sku, "batch_number": "B001"}
    try:
        db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        db_session.commit()
    except Exception:
        pass


# ── T33: seeded record with serial_number ────────────────────────────────────


@given(
    'a stock record seeded with a uuid-suffixed sku and serial_number "S001" for T33',
    target_fixture="t33_ctx",
)
def given_t33_serial(db_session):
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T33-{rid}"
    loc = f"LOC-T33-{rid}"
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 1, NULL, 'S001')"
        ),
        {"sku": sku, "loc": loc},
    )
    db_session.commit()
    yield {"sku": sku, "serial_number": "S001"}
    try:
        db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        db_session.commit()
    except Exception:
        pass


# ── T44: seeded record to check inventory_code absence ───────────────────────


@given(
    "a stock record seeded with a uuid-suffixed sku for T44",
    target_fixture="t44_ctx",
)
def given_t44_record(db_session):
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T44-{rid}"
    loc = f"LOC-T44-{rid}"
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 1, 'B-T44', 'S-T44')"
        ),
        {"sku": sku, "loc": loc},
    )
    db_session.commit()
    yield {"sku": sku}
    try:
        db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        db_session.commit()
    except Exception:
        pass


# ── T36: POST request context with batch_number ──────────────────────────────


@given(
    'a POST /api/stock request body with a uuid-suffixed sku and batch_number "BATCH-T36"',
    target_fixture="t36_ctx",
)
def given_t36_payload():
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T36-{rid}"
    return {
        "sku": sku,
        "location": f"LOC-T36-{rid}",
        "quantity": 3,
        "batch_number": "BATCH-T36",
        "serial_number": None,
    }


# ── T37: POST request context with serial_number ─────────────────────────────


@given(
    'a POST /api/stock request body with a uuid-suffixed sku and serial_number "SN-T37"',
    target_fixture="t37_ctx",
)
def given_t37_payload():
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T37-{rid}"
    return {
        "sku": sku,
        "location": f"LOC-T37-{rid}",
        "quantity": 3,
        "batch_number": None,
        "serial_number": "SN-T37",
    }


# ── T40: seeded record with NULL batch_number ────────────────────────────────


@given(
    "a stock record seeded with a uuid-suffixed sku and NULL batch_number for T40",
    target_fixture="t40_ctx",
)
def given_t40_null_batch(db_session):
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T40-{rid}"
    loc = f"LOC-T40-{rid}"
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 1, NULL, 'S-T40')"
        ),
        {"sku": sku, "loc": loc},
    )
    db_session.commit()
    yield {"sku": sku}
    try:
        db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        db_session.commit()
    except Exception:
        pass


# ── T41: seeded record with NULL serial_number ───────────────────────────────


@given(
    "a stock record seeded with a uuid-suffixed sku and NULL serial_number for T41",
    target_fixture="t41_ctx",
)
def given_t41_null_serial(db_session):
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T41-{rid}"
    loc = f"LOC-T41-{rid}"
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 1, 'B-T41', NULL)"
        ),
        {"sku": sku, "loc": loc},
    )
    db_session.commit()
    yield {"sku": sku}
    try:
        db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        db_session.commit()
    except Exception:
        pass


# ── When: fetch GET /api/stock list (shared by T32, T33, T44, T40, T41) ──────


@when("the client fetches GET /api/stock", target_fixture="list_response")
def when_fetch_list(client):
    resp = client.get("/api/stock")
    assert resp.status_code == 200, (
        f"Expected 200 from GET /api/stock; got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert isinstance(data, list), f"Expected list from GET /api/stock; got {type(data)}"
    return data


# ── When: submit POST /api/stock for T36 ─────────────────────────────────────


@when(
    "the client submits the POST /api/stock request for T36",
    target_fixture="t36_response",
)
def when_post_t36(t36_ctx, client, db_session):
    resp = client.post("/api/stock", json=t36_ctx)
    assert resp.status_code in (200, 201), (
        f"Expected 200/201 from POST /api/stock; got {resp.status_code}: {resp.text}"
    )
    yield resp
    # Cleanup
    try:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": t36_ctx["sku"]}
        )
        db_session.commit()
    except Exception:
        pass


# ── When: submit POST /api/stock for T37 ─────────────────────────────────────


@when(
    "the client submits the POST /api/stock request for T37",
    target_fixture="t37_response",
)
def when_post_t37(t37_ctx, client, db_session):
    resp = client.post("/api/stock", json=t37_ctx)
    assert resp.status_code in (200, 201), (
        f"Expected 200/201 from POST /api/stock; got {resp.status_code}: {resp.text}"
    )
    yield resp
    try:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": t37_ctx["sku"]}
        )
        db_session.commit()
    except Exception:
        pass


# ── Then: T32 batch_number in list ───────────────────────────────────────────


@then('the list response contains a row for T32 with batch_number equal to "B001"')
def then_t32_batch(t32_ctx, list_response):
    sku = t32_ctx["sku"]
    matching = [r for r in list_response if r.get("sku") == sku]
    assert matching, f"No list row found for sku={sku!r}; rows: {list_response}"
    row = matching[0]
    assert "batch_number" in row, (
        f"Row for sku={sku!r} must contain 'batch_number'; got keys: {sorted(row.keys())}"
    )
    assert row["batch_number"] == "B001", (
        f"batch_number mismatch for T32: expected 'B001', got {row['batch_number']!r}"
    )


# ── Then: T33 serial_number in list ──────────────────────────────────────────


@then('the list response contains a row for T33 with serial_number equal to "S001"')
def then_t33_serial(t33_ctx, list_response):
    sku = t33_ctx["sku"]
    matching = [r for r in list_response if r.get("sku") == sku]
    assert matching, f"No list row found for sku={sku!r}; rows: {list_response}"
    row = matching[0]
    assert "serial_number" in row, (
        f"Row for sku={sku!r} must contain 'serial_number'; got keys: {sorted(row.keys())}"
    )
    assert row["serial_number"] == "S001", (
        f"serial_number mismatch for T33: expected 'S001', got {row['serial_number']!r}"
    )


# ── Then: T44 no inventory_code in list ──────────────────────────────────────


@then("no record in the list response for T44 contains an inventory_code field")
def then_t44_no_inventory_code(t44_ctx, list_response):
    sku = t44_ctx["sku"]
    matching = [r for r in list_response if r.get("sku") == sku]
    assert matching, f"No list row found for sku={sku!r}; rows: {list_response}"
    for row in matching:
        assert "inventory_code" not in row, (
            f"Row for sku={sku!r} must NOT contain 'inventory_code'; "
            f"got keys: {sorted(row.keys())}"
        )


# ── Then: T36 persisted batch_number ─────────────────────────────────────────


@then('the persisted record for T36 has batch_number equal to "BATCH-T36"')
def then_t36_batch_persisted(t36_ctx, t36_response, db_session):
    sku = t36_ctx["sku"]
    row = db_session.execute(
        text("SELECT batch_number FROM stock_records WHERE sku = :sku"), {"sku": sku}
    ).fetchone()
    assert row is not None, f"No row found in DB for sku={sku!r} after POST"
    assert row[0] == "BATCH-T36", (
        f"batch_number mismatch for T36: expected 'BATCH-T36', got {row[0]!r}"
    )


# ── Then: T37 persisted serial_number ────────────────────────────────────────


@then('the persisted record for T37 has serial_number equal to "SN-T37"')
def then_t37_serial_persisted(t37_ctx, t37_response, db_session):
    sku = t37_ctx["sku"]
    row = db_session.execute(
        text("SELECT serial_number FROM stock_records WHERE sku = :sku"), {"sku": sku}
    ).fetchone()
    assert row is not None, f"No row found in DB for sku={sku!r} after POST"
    assert row[0] == "SN-T37", (
        f"serial_number mismatch for T37: expected 'SN-T37', got {row[0]!r}"
    )


# ── Then: T40 NULL batch_number in list ──────────────────────────────────────


@then("the list response contains a row for T40 where batch_number is explicitly null")
def then_t40_null_batch(t40_ctx, list_response):
    sku = t40_ctx["sku"]
    matching = [r for r in list_response if r.get("sku") == sku]
    assert matching, f"No list row found for sku={sku!r}; rows: {list_response}"
    row = matching[0]
    assert "batch_number" in row, (
        f"Row for sku={sku!r} must contain 'batch_number' key (even if null); "
        f"got keys: {sorted(row.keys())}"
    )
    assert row["batch_number"] is None, (
        f"batch_number for T40 must be null; got {row['batch_number']!r}"
    )


# ── Then: T41 NULL serial_number in list ─────────────────────────────────────


@then("the list response contains a row for T41 where serial_number is explicitly null")
def then_t41_null_serial(t41_ctx, list_response):
    sku = t41_ctx["sku"]
    matching = [r for r in list_response if r.get("sku") == sku]
    assert matching, f"No list row found for sku={sku!r}; rows: {list_response}"
    row = matching[0]
    assert "serial_number" in row, (
        f"Row for sku={sku!r} must contain 'serial_number' key (even if null); "
        f"got keys: {sorted(row.keys())}"
    )
    assert row["serial_number"] is None, (
        f"serial_number for T41 must be null; got {row['serial_number']!r}"
    )
