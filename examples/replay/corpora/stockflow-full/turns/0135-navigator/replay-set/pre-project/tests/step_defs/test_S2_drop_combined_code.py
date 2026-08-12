"""pytest-bdd step definitions for S2-drop-combined-code.feature.

T23 – AC1-column-dropped: after the S2 drop migration is applied against the real
      branch database (seeded with a uuid-suffixed stock row), the inventory_code
      column is absent from the stock table schema and batch_number remains.

Real paired-branch database only (DATABASE_URL from env); no mocks.
Per-run-unique keys via uuid prevent key collisions across runs.
"""

import subprocess
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from pytest_bdd import given, scenarios, then, when

from app.database import engine

scenarios("../features/S2-drop-combined-code.feature")

PROJECT_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run_alembic(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["uv", "run", "alembic", *args],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


# ---------------------------------------------------------------------------
# T23 – Given  (seed a uuid-suffixed row; inventory_code already dropped by S2)
# ---------------------------------------------------------------------------


@pytest.fixture()
def unique_sku_t23() -> str:
    return f"SKU-S2AC1-{uuid.uuid4().hex[:12].upper()}"


@pytest.fixture()
def unique_location_t23() -> str:
    return f"LOC-S2AC1-{uuid.uuid4().hex[:8].upper()}"


@given(
    "a stock row with a uuid-suffixed sku is seeded on the real branch database before the S2 drop migration",
    target_fixture="seeded_ctx_t23",
)
def given_stock_row_seeded_before_drop(unique_sku_t23, unique_location_t23):
    """Seed one stock row with a per-run-unique (sku, location) pair.

    inventory_code has already been dropped by S2; the row is seeded without it.
    """
    sku = unique_sku_t23
    location = unique_location_t23

    with engine.connect() as conn:
        conn.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": location},
        )
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity) "
                "VALUES (:sku, :loc, 1)"
            ),
            {"sku": sku, "loc": location},
        )
        conn.commit()

    yield {"sku": sku, "location": location}

    # Cleanup — the column may already be gone after the S2 migration runs;
    # delete by sku/location only (both survive the drop migration per AC1).
    try:
        with engine.connect() as conn:
            conn.execute(
                sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
                {"sku": sku, "loc": location},
            )
            conn.commit()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# T23 – When  (apply the S2 drop migration)
# ---------------------------------------------------------------------------


@when("the S2 drop migration is applied to the real branch database")
def when_s2_drop_migration_applied():
    """Run `alembic upgrade head` to apply the S2 drop migration (GREEN: migration exists)."""
    result = _run_alembic("upgrade", "head")
    assert result.returncode == 0, (
        f"alembic upgrade head failed:\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )
    # Dispose pooled connections so sa.inspect sees the post-migration schema.
    engine.dispose()


# ---------------------------------------------------------------------------
# T23 / T24 – Then  (schema shape assertions after S2 drop migration)
# ---------------------------------------------------------------------------


@then("the batch_number column is present in the stock table schema")
def then_batch_number_column_present():
    """T24: after the S2 drop migration, batch_number must remain in the
    stock table's column list — the migration only removes inventory_code.

    Goes RED if the migration accidentally drops batch_number alongside
    inventory_code (e.g. an overly broad DROP COLUMN statement).
    """
    insp = sa.inspect(engine)
    assert insp.has_table("stock"), (
        "stock table is missing after the S2 drop migration"
    )
    col_names = {c["name"] for c in insp.get_columns("stock")}
    assert "batch_number" in col_names, (
        f"batch_number column is absent from the stock table after the S2 drop "
        f"migration.  The S2 migration must only drop inventory_code, leaving "
        f"batch_number intact.  Columns currently present: {sorted(col_names)}"
    )


@then("the serial_number column is present in the stock table schema")
def then_serial_number_column_present():
    """T25: after the S2 drop migration, serial_number must remain in the
    stock table's column list — the migration only removes inventory_code.

    Goes RED if the migration accidentally drops serial_number alongside
    inventory_code (e.g. an overly broad DROP COLUMN statement).
    """
    insp = sa.inspect(engine)
    assert insp.has_table("stock"), (
        "stock table is missing after the S2 drop migration"
    )
    col_names = {c["name"] for c in insp.get_columns("stock")}
    assert "serial_number" in col_names, (
        f"serial_number column is absent from the stock table after the S2 drop "
        f"migration.  The S2 migration must only drop inventory_code, leaving "
        f"serial_number intact.  Columns currently present: {sorted(col_names)}"
    )


@then("the location column is present in the stock table schema")
def then_location_column_present():
    """T26: after the S2 drop migration, location must remain in the stock
    table's column list — the migration only removes inventory_code.

    Goes RED if the migration accidentally drops location alongside
    inventory_code (e.g. an overly broad DROP COLUMN statement).
    """
    insp = sa.inspect(engine)
    assert insp.has_table("stock"), (
        "stock table is missing after the S2 drop migration"
    )
    col_names = {c["name"] for c in insp.get_columns("stock")}
    assert "location" in col_names, (
        f"location column is absent from the stock table after the S2 drop "
        f"migration.  The S2 migration must only drop inventory_code, leaving "
        f"location intact.  Columns currently present: {sorted(col_names)}"
    )


@then("the inventory_code column is absent from the stock table schema")
def then_inventory_code_column_absent(seeded_ctx_t23):
    """T23: after the S2 drop migration, inventory_code must not appear in the
    stock table's column list.

    The assertion is on SCHEMA SHAPE (sa.inspect column names), not row data —
    consistent with the AC1-column-dropped architectural note that the Infra layer
    contract is verified by inspecting column presence on the paired Lakebase branch.
    """
    insp = sa.inspect(engine)
    assert insp.has_table("stock"), (
        "stock table is missing after the S2 drop migration — "
        "the migration must only DROP the inventory_code column, not the whole table"
    )

    col_names = {c["name"] for c in insp.get_columns("stock")}

    assert "inventory_code" not in col_names, (
        f"inventory_code column is still present in the stock table after the S2 drop "
        f"migration.  The S2 migration must issue DROP COLUMN inventory_code.  "
        f"Columns currently present: {sorted(col_names)}"
    )
