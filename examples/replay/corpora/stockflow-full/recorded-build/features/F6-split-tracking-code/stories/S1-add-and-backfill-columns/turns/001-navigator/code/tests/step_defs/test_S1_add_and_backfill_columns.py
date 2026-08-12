"""pytest-bdd step definitions for S1-add-and-backfill-columns.feature.

T1 – AC1: batch_number and serial_number are separately addressable columns after migration.
T2 – AC1: location and inventory_code remain present and unchanged after migration.

Real paired-branch database only (DATABASE_URL from env); no mocks.
Per-run-unique keys via uuid to prevent key collisions across runs.
"""

import subprocess
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from pytest_bdd import given, scenarios, then, when

from app.database import engine

scenarios("../features/S1-add-and-backfill-columns.feature")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = str(PROJECT_ROOT / "alembic.ini")


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
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def unique_sku() -> str:
    return f"SKU-S1AC1-{uuid.uuid4().hex[:12].upper()}"


@pytest.fixture()
def unique_location() -> str:
    return f"LOC-S1AC1-{uuid.uuid4().hex[:8].upper()}"


# ---------------------------------------------------------------------------
# T1 – Given / When / Then  (new columns are separately addressable)
# ---------------------------------------------------------------------------


@given(
    "a stock row is seeded on the real branch database",
    target_fixture="seeded_ctx",
)
def given_seeded_row(unique_sku, unique_location):
    """Seed a row with a conforming inventory_code and DELETE it on teardown."""
    sku = unique_sku
    location = unique_location
    inventory_code = f"{location}-BATCH01-SER001"
    with engine.connect() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :qty, :code) "
                "ON CONFLICT (sku, location) DO NOTHING"
            ),
            {"sku": sku, "location": location, "qty": 1, "code": inventory_code},
        )
        conn.commit()
    yield {"sku": sku, "location": location, "inventory_code": inventory_code}
    # Cleanup — best-effort; autouse fixture restores head migration after each test
    with engine.connect() as conn:
        conn.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": location},
        )
        conn.commit()


@when(
    "the add-and-backfill migration is applied to the real branch database",
    target_fixture="seeded_ctx",
)
def when_migration_applied(seeded_ctx):
    """Run alembic upgrade head so the new migration (to be authored) is applied."""
    result = _run_alembic("upgrade", "head")
    assert result.returncode == 0, (
        f"alembic upgrade head failed:\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )
    return seeded_ctx


@then("the seeded row has a batch_number column that is separately addressable")
def then_batch_number_column_exists(seeded_ctx):
    """T1: batch_number must be a real column addressable by name in a SELECT."""
    sku = seeded_ctx["sku"]
    location = seeded_ctx["location"]
    with engine.connect() as conn:
        row = conn.execute(
            sa.text(
                "SELECT batch_number FROM stock WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        ).mappings().fetchone()
    assert row is not None, (
        f"No row found for sku={sku!r}, location={location!r} — "
        "migration may have removed the row or the table"
    )
    # The column exists and is addressable by name — its presence in the mapping is the proof.
    assert "batch_number" in row, (
        "batch_number column not returned by SELECT — "
        "the add-and-backfill migration has not added the column yet"
    )


@then("the seeded row has a serial_number column that is separately addressable")
def then_serial_number_column_exists(seeded_ctx):
    """T1: serial_number must be a real column addressable by name in a SELECT."""
    sku = seeded_ctx["sku"]
    location = seeded_ctx["location"]
    with engine.connect() as conn:
        row = conn.execute(
            sa.text(
                "SELECT serial_number FROM stock WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        ).mappings().fetchone()
    assert row is not None, (
        f"No row found for sku={sku!r}, location={location!r}"
    )
    assert "serial_number" in row, (
        "serial_number column not returned by SELECT — "
        "the add-and-backfill migration has not added the column yet"
    )


# ---------------------------------------------------------------------------
# T2 – Given / When / Then  (location and inventory_code unchanged)
# ---------------------------------------------------------------------------


@given(
    "a stock row is seeded with a known location and inventory_code on the real branch database",
    target_fixture="seeded_ctx",
)
def given_seeded_row_with_known_fields(unique_sku, unique_location):
    """Seed a row whose location and inventory_code values are known upfront."""
    sku = unique_sku
    location = unique_location
    inventory_code = f"{location}-BATCHKNOWN-SERKNOWN"
    with engine.connect() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :qty, :code) "
                "ON CONFLICT (sku, location) DO NOTHING"
            ),
            {"sku": sku, "location": location, "qty": 2, "code": inventory_code},
        )
        conn.commit()
    yield {"sku": sku, "location": location, "inventory_code": inventory_code}
    with engine.connect() as conn:
        conn.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": location},
        )
        conn.commit()


@then("the seeded row has the same location value as before the migration")
def then_location_unchanged(seeded_ctx):
    """T2: location must not be altered or NULL-ed by the migration."""
    sku = seeded_ctx["sku"]
    expected_location = seeded_ctx["location"]
    with engine.connect() as conn:
        row = conn.execute(
            sa.text(
                "SELECT location FROM stock WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": expected_location},
        ).mappings().fetchone()
    assert row is not None, (
        f"Row for sku={sku!r} not found after migration — "
        "the migration must not delete or lose existing rows"
    )
    assert row["location"] == expected_location, (
        f"location changed by migration: expected {expected_location!r}, "
        f"got {row['location']!r}"
    )


@then("the seeded row has the same inventory_code value as before the migration")
def then_inventory_code_unchanged(seeded_ctx):
    """T2: inventory_code is an additive migration — the source column must survive intact."""
    sku = seeded_ctx["sku"]
    location = seeded_ctx["location"]
    expected_code = seeded_ctx["inventory_code"]
    with engine.connect() as conn:
        row = conn.execute(
            sa.text(
                "SELECT inventory_code FROM stock WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        ).mappings().fetchone()
    assert row is not None, (
        f"Row for sku={sku!r}, location={location!r} not found after migration"
    )
    assert row["inventory_code"] == expected_code, (
        f"inventory_code changed by migration: expected {expected_code!r}, "
        f"got {row['inventory_code']!r}"
    )
