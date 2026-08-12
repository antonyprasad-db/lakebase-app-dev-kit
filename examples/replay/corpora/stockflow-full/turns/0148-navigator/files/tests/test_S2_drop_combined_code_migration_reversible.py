"""Migration-reversibility fitness test for S2-drop-combined-code.

T33 – AC3-down-migration-reconstructs-code:
    After a single-step downgrade (-1) followed by a single-step upgrade (head),
    the stock table does NOT have an inventory_code column (the forward schema
    is faithfully recreated).

Marked @pytest.mark.migration so the verify harness runs it on its OWN isolated
ephemeral branch — it must NOT share the database with non-migration tests
because it mutates the schema with a downgrade.

SCHEMA-RECREATION assertion only — no data survival.  The downgrade restores
inventory_code; the upgrade drops it again.  After the round-trip, inventory_code
must be absent and batch_number / serial_number must remain present.
"""

import subprocess
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
def test_drop_inventory_code_migration_is_reversible():
    """T33: downgrade -1 then upgrade head leaves inventory_code absent.

    S2 upgrade drops inventory_code.  A downgrade -1 restores it, and a
    subsequent upgrade head re-drops it.  After the round-trip the forward
    schema must be faithfully recreated: inventory_code absent, batch_number
    and serial_number present.
    """
    # Step 1: downgrade -1  (undoes S2: restores inventory_code)
    down = _run_alembic("downgrade", "-1")
    assert down.returncode == 0, (
        f"alembic downgrade -1 failed:\nstdout: {down.stdout}\nstderr: {down.stderr}"
    )

    # Step 2: upgrade head  (re-applies S2: drops inventory_code again)
    up = _run_alembic("upgrade", "head")
    assert up.returncode == 0, (
        f"alembic upgrade head failed:\nstdout: {up.stdout}\nstderr: {up.stderr}"
    )

    # Step 3: assert the forward schema is faithfully recreated.
    insp = sa.inspect(engine)
    assert insp.has_table("stock"), (
        "stock table missing after migration round-trip — "
        "the downgrade overshot to a state that dropped the entire table"
    )

    col_names = {c["name"] for c in insp.get_columns("stock")}

    # PRIMARY assertion: inventory_code must be absent (S2 drop was re-applied).
    assert "inventory_code" not in col_names, (
        f"inventory_code column is present in the stock table after downgrade -1 + "
        f"upgrade head — the S2 upgrade migration did not faithfully recreate the "
        f"forward schema.  Columns present: {sorted(col_names)}"
    )

    # Guard: the split-tracking columns must survive the round-trip.
    assert "batch_number" in col_names, (
        f"batch_number column missing from stock table after migration round-trip. "
        f"Columns present: {sorted(col_names)}"
    )
    assert "serial_number" in col_names, (
        f"serial_number column missing from stock table after migration round-trip. "
        f"Columns present: {sorted(col_names)}"
    )

    # Guard: pre-existing required columns must survive the round-trip.
    for required in ("id", "sku", "location", "quantity"):
        assert required in col_names, (
            f"Required column '{required}' missing after migration round-trip. "
            f"Columns present: {sorted(col_names)}"
        )
