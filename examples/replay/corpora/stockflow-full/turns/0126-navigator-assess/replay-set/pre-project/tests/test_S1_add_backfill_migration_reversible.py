"""Migration-reversibility fitness test for S1-add-and-backfill-columns.

T3 – AC1-columns-exist / PI5-migration-reversible:
    After a single-step downgrade (-1) followed by a single-step upgrade (head),
    the stock table has a batch_number column and a serial_number column.

Marked @pytest.mark.migration so the verify harness runs it on its OWN isolated
ephemeral branch — it must NOT share the database with non-migration tests
because it mutates the schema with a downgrade.

SCHEMA-RECREATION assertion only — no data survival (the downgrade step drops
the two new columns; the upgrade re-adds them to an already-present table).
"""

import subprocess
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa

from app.database import engine

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _run_alembic(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["uv", "run", "alembic", *args],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.mark.migration
def test_add_batch_serial_migration_is_reversible():
    """T3: downgrade -1 (drops batch_number + serial_number) then upgrade head
    (re-adds them) leaves the stock table with both columns present.

    The assertion is SCHEMA-RECREATION: after the round-trip, both columns exist
    and are separately addressable by name via sa.inspect.
    """
    # Step 1: downgrade -1  (removes batch_number and serial_number columns)
    down = _run_alembic("downgrade", "-1")
    assert down.returncode == 0, (
        f"alembic downgrade -1 failed:\nstdout: {down.stdout}\nstderr: {down.stderr}"
    )

    # Step 2: upgrade head  (re-adds batch_number and serial_number)
    up = _run_alembic("upgrade", "head")
    assert up.returncode == 0, (
        f"alembic upgrade head failed:\nstdout: {up.stdout}\nstderr: {up.stderr}"
    )

    # Step 3: assert schema is recreated — both new columns must be present.
    insp = sa.inspect(engine)
    assert insp.has_table("stock"), (
        "stock table missing after migration round-trip — "
        "the downgrade overshot to a state that dropped the entire table"
    )

    col_names = {c["name"] for c in insp.get_columns("stock")}

    assert "batch_number" in col_names, (
        f"batch_number column missing from stock table after downgrade -1 + upgrade head. "
        f"Columns present: {sorted(col_names)}"
    )
    assert "serial_number" in col_names, (
        f"serial_number column missing from stock table after downgrade -1 + upgrade head. "
        f"Columns present: {sorted(col_names)}"
    )

    # Confirm both columns are nullable (PI1-batch-serial-nullable).
    cols = {c["name"]: c for c in insp.get_columns("stock")}
    assert cols["batch_number"].get("nullable", True), (
        "batch_number should be NULLABLE after migration recreation"
    )
    assert cols["serial_number"].get("nullable", True), (
        "serial_number should be NULLABLE after migration recreation"
    )

    # Confirm pre-existing required columns survived the round-trip.
    for required in ("id", "sku", "location", "quantity"):
        assert required in col_names, (
            f"Required column '{required}' missing after migration round-trip. "
            f"Columns present: {sorted(col_names)}"
        )

    # Smoke-prove the columns are truly addressable: an insert that sets both to NULL
    # must succeed (nullable constraint) without a column-not-found error.
    test_sku = f"SKU-MIGREV-{uuid.uuid4().hex[:8].upper()}"
    test_loc = f"LOC-MIGREV-{uuid.uuid4().hex[:6].upper()}"
    with engine.connect() as conn:
        conn.execute(sa.text("BEGIN"))
        try:
            conn.execute(
                sa.text(
                    "INSERT INTO stock (sku, location, quantity, batch_number, serial_number) "
                    "VALUES (:sku, :loc, 0, NULL, NULL)"
                ),
                {"sku": test_sku, "loc": test_loc},
            )
        finally:
            conn.execute(sa.text("ROLLBACK"))
