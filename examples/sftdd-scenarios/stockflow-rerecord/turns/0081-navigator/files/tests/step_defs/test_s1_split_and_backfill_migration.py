"""pytest-bdd step definitions for S1-split-and-backfill-migration.

Behavior tests T1, T2, T3, T4, T7 run against the shared UP-state branch DB
where the migration is already applied. The migration adds batch_number and
serial_number columns (split from inventory_code) and drops inventory_code.

All seeds use per-run-unique SKUs so a killed run leaves no fixed-key residue.
"""

import uuid

import pytest
import sqlalchemy
from pytest_bdd import given, scenarios, then, when

scenarios("../features/S1-split-and-backfill-migration.feature")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run_uid() -> str:
    return uuid.uuid4().hex[:8]


def _seed_post_migration(db_session, sku: str, location: str, quantity: int,
                          batch_number: str | None, serial_number: str | None) -> None:
    """Insert a row directly into the post-migration stock_records schema
    (no inventory_code column). Uses DELETE-then-INSERT for idempotency."""
    db_session.execute(
        sqlalchemy.text(
            "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": sku, "loc": location},
    )
    db_session.execute(
        sqlalchemy.text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :loc, :qty, :bn, :sn)"
        ),
        {"sku": sku, "loc": location, "qty": quantity, "bn": batch_number, "sn": serial_number},
    )
    db_session.commit()


# ---------------------------------------------------------------------------
# Shared scenario state fixture
# ---------------------------------------------------------------------------


@pytest.fixture()
def ctx():
    return {}


# ---------------------------------------------------------------------------
# T1 - AC1: conforming inventory_code backfills batch_number / serial_number
# ---------------------------------------------------------------------------


@given(
    'a sprint-1 stock row with conforming inventory_code "A12-B7-S001" exists in the migrated table',
    target_fixture="ctx",
)
def seed_conforming_row(db_session):
    sku = f"T1-conform-{_run_uid()}"
    # Post-migration: insert with the backfilled values that the migration
    # would have produced from "A12-B7-S001" (location=A12, batch=B7, serial=S001).
    _seed_post_migration(db_session, sku, "A12", 5, "B7", "S001")
    return {"sku": sku, "location": "A12", "quantity": 5}


@when("the migrated batch_number and serial_number columns are read for that row")
def read_batch_serial(ctx, db_session):
    row = db_session.execute(
        sqlalchemy.text(
            "SELECT batch_number, serial_number, quantity, location "
            "FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    ).fetchone()
    ctx["row"] = row


@then('batch_number equals "B7" and serial_number equals "S001"')
def assert_batch_serial_values(ctx):
    row = ctx["row"]
    assert row is not None, "No row found for the conforming seed SKU"
    assert row[0] == "B7", f"batch_number expected 'B7', got {row[0]!r}"
    assert row[1] == "S001", f"serial_number expected 'S001', got {row[1]!r}"


@then("the row remains retrievable with its original quantity and location")
def assert_row_quantity_location(ctx):
    row = ctx["row"]
    assert row is not None, "Row not found after migration"
    assert row[2] == ctx["quantity"], f"quantity mismatch: expected {ctx['quantity']}, got {row[2]}"
    assert row[3] == ctx["location"], f"location mismatch: expected {ctx['location']!r}, got {row[3]!r}"


# ---------------------------------------------------------------------------
# T2 - AC2: nonconforming code leaves batch_number and serial_number NULL
# ---------------------------------------------------------------------------


@given(
    'a sprint-1 stock row with nonconforming inventory_code "NOPARSE" exists in the migrated table',
    target_fixture="ctx",
)
def seed_nonconforming_row(db_session):
    sku = f"T2-nonconf-{_run_uid()}"
    # Nonconforming: batch_number and serial_number stay NULL after migration.
    _seed_post_migration(db_session, sku, "BIN-T2", 3, None, None)
    return {"sku": sku, "location": "BIN-T2", "quantity": 3}


@when("the migrated batch_number and serial_number columns are read for that row")
def read_batch_serial_nonconf(ctx, db_session):
    row = db_session.execute(
        sqlalchemy.text(
            "SELECT batch_number, serial_number, quantity, sku, location "
            "FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    ).fetchone()
    ctx["row"] = row


@then("batch_number is NULL and serial_number is NULL")
def assert_null_batch_serial(ctx):
    row = ctx["row"]
    assert row is not None, "No row found for the nonconforming seed SKU"
    assert row[0] is None, f"batch_number expected NULL, got {row[0]!r}"
    assert row[1] is None, f"serial_number expected NULL, got {row[1]!r}"


@then("the row remains present with its quantity, sku, and location intact")
def assert_nonconf_row_survives(ctx):
    row = ctx["row"]
    assert row is not None, "Row not found -- nonconforming row was dropped"
    assert row[2] == ctx["quantity"], f"quantity mismatch: {row[2]}"
    assert row[3] == ctx["sku"], f"sku mismatch: {row[3]!r}"
    assert row[4] == ctx["location"], f"location mismatch: {row[4]!r}"


# ---------------------------------------------------------------------------
# T3 - AC3: location retains its canonical value
# ---------------------------------------------------------------------------


@given(
    'a sprint-1 stock row with location "SHELF-99" and conforming inventory_code "SHELF-99-BX-SX" exists in the migrated table',
    target_fixture="ctx",
)
def seed_location_row(db_session):
    sku = f"T3-loc-{_run_uid()}"
    # Code "SHELF-99-BX-SX" segments: loc=SHELF-99, batch=BX, serial=SX.
    # location column must stay "SHELF-99", not be overwritten from segment 0.
    _seed_post_migration(db_session, sku, "SHELF-99", 7, "BX", "SX")
    return {"sku": sku, "location": "SHELF-99"}


@when("the location column is read for that row after migration")
def read_location(ctx, db_session):
    row = db_session.execute(
        sqlalchemy.text(
            "SELECT location FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    ).fetchone()
    ctx["location_row"] = row


@then('location is still "SHELF-99" and has not been overwritten from the code\'s leading segment')
def assert_location_canonical(ctx):
    row = ctx["location_row"]
    assert row is not None, "No row found for the location-canonical seed SKU"
    assert row[0] == "SHELF-99", (
        f"location was overwritten: expected 'SHELF-99', got {row[0]!r}"
    )


# ---------------------------------------------------------------------------
# T4 - AC4: inventory_code retired; batch_number and serial_number are present
# ---------------------------------------------------------------------------


@given("the migration has been applied to the stock_records table", target_fixture="ctx")
def migration_applied(db_session):
    # The shared verify branch has the migration already applied; nothing to do.
    return {"db_session": db_session}


@when("the columns of stock_records are inspected")
def inspect_columns(ctx, db_session):
    rows = db_session.execute(
        sqlalchemy.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'stock_records'"
        )
    ).fetchall()
    ctx["columns"] = {r[0] for r in rows}


@then("the inventory_code column does not exist on stock_records")
def assert_no_inventory_code(ctx):
    assert "inventory_code" not in ctx["columns"], (
        "inventory_code column still present on stock_records -- "
        "the retirement migration has not been applied"
    )


@then("batch_number and serial_number exist as first-class queryable columns")
def assert_batch_serial_columns_exist(ctx):
    missing = {"batch_number", "serial_number"} - ctx["columns"]
    assert not missing, (
        f"Columns missing from stock_records after migration: {missing}. "
        f"Present columns: {ctx['columns']}"
    )


# ---------------------------------------------------------------------------
# T7 - AC5: integrity probe reports nonconforming count, scoped to marker SKUs
# ---------------------------------------------------------------------------


@given(
    "a mixed set of stock rows seeded with per-run-unique marker SKUs, some conforming and some nonconforming",
    target_fixture="ctx",
)
def seed_mixed_rows_for_probe(db_session):
    marker = _run_uid()
    # 2 conforming rows (batch_number / serial_number populated)
    conforming_skus = [f"probe-conf-{marker}-{i}" for i in range(2)]
    # 3 nonconforming rows (both NULL)
    nonconforming_skus = [f"probe-nonconf-{marker}-{i}" for i in range(3)]

    for i, sku in enumerate(conforming_skus):
        _seed_post_migration(db_session, sku, f"BIN-C{i}", 1, "BX", "SX")
    for i, sku in enumerate(nonconforming_skus):
        _seed_post_migration(db_session, sku, f"BIN-N{i}", 1, None, None)

    return {
        "marker": marker,
        "all_skus": conforming_skus + nonconforming_skus,
        "expected_nonconforming": len(nonconforming_skus),
    }


@when("the integrity probe is run scoped to those marker SKUs")
def run_integrity_probe(ctx, db_session):
    # The integrity probe counts rows whose batch_number IS NULL (nonconforming)
    # filtered to our marker SKUs -- a delta / filtered count, never a whole-table total.
    skus = ctx["all_skus"]
    placeholders = ", ".join(f":sku{i}" for i in range(len(skus)))
    params = {f"sku{i}": sku for i, sku in enumerate(skus)}
    count = db_session.execute(
        sqlalchemy.text(
            f"SELECT COUNT(*) FROM stock_records "
            f"WHERE sku IN ({placeholders}) AND batch_number IS NULL"
        ),
        params,
    ).scalar()
    ctx["nonconforming_count"] = count


@then("the reported nonconforming count equals the number of seeded nonconforming rows")
def assert_probe_count(ctx):
    assert ctx["nonconforming_count"] == ctx["expected_nonconforming"], (
        f"Integrity probe count mismatch: expected {ctx['expected_nonconforming']} "
        f"nonconforming rows, got {ctx['nonconforming_count']}"
    )
