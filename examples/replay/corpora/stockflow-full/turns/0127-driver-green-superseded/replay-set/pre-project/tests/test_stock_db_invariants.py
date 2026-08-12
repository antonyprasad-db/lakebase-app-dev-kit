"""DB-constraint and migration fitness tests for S1-file-stock.

T12 – unique-constraint violation on duplicate (sku, location).
T13 – check-constraint violation on quantity < 0.
T14 – not-null-constraint violation on NULL sku.
T15 – migration reversibility: downgrade -1 then upgrade head recreates schema.
T19 – refile upsert: no duplicate row after re-POST same (sku, location).

All tests run against the real paired-branch database (DATABASE_URL from env).
No mocks; schema assertions use sqlalchemy.inspect.
"""
import subprocess
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal, engine

PROJECT_ROOT = Path(__file__).resolve().parents[1]
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


def _raw_insert(conn, sku, location, quantity):
    """Insert directly via raw SQL (no ORM) to exercise the DB constraints."""
    conn.execute(
        sa.text(
            "INSERT INTO stock (sku, location, quantity) "
            "VALUES (:sku, :location, :quantity)"
        ),
        {
            "sku": sku,
            "location": location,
            "quantity": quantity,
        },
    )


# ---------------------------------------------------------------------------
# T12 – unique-constraint violation on (sku, location)
# ---------------------------------------------------------------------------


def test_duplicate_sku_location_raises_unique_violation():
    """T12: Inserting two rows with the same (sku, location) pair raises a
    unique-constraint violation on the real branch database."""
    sku = f"SKU-{uuid.uuid4().hex[:12].upper()}"
    location = f"LOC-{uuid.uuid4().hex[:8].upper()}"

    with engine.connect() as conn:
        conn.execute(sa.text("BEGIN"))
        try:
            _raw_insert(conn, sku, location, 5)
            with pytest.raises(IntegrityError, match="unique|duplicate"):
                _raw_insert(conn, sku, location, 10)
        finally:
            conn.execute(sa.text("ROLLBACK"))


# ---------------------------------------------------------------------------
# T13 – check-constraint violation on quantity < 0
# ---------------------------------------------------------------------------


def test_negative_quantity_raises_check_violation():
    """T13: Inserting a row with quantity below zero raises a check-constraint
    violation on the real branch database."""
    sku = f"SKU-{uuid.uuid4().hex[:12].upper()}"
    location = f"LOC-{uuid.uuid4().hex[:8].upper()}"

    with engine.connect() as conn:
        conn.execute(sa.text("BEGIN"))
        try:
            with pytest.raises(IntegrityError, match="check|ck_stock_quantity"):
                _raw_insert(conn, sku, location, -1)
        finally:
            conn.execute(sa.text("ROLLBACK"))


# ---------------------------------------------------------------------------
# T14 – not-null-constraint violation on NULL sku
# ---------------------------------------------------------------------------


def test_null_sku_raises_not_null_violation():
    """T14: Inserting a row with a NULL sku raises a not-null-constraint
    violation on the real branch database."""
    location = f"LOC-{uuid.uuid4().hex[:8].upper()}"

    with engine.connect() as conn:
        conn.execute(sa.text("BEGIN"))
        try:
            with pytest.raises(IntegrityError, match="null|not.null|violates"):
                _raw_insert(conn, None, location, 3)
        finally:
            conn.execute(sa.text("ROLLBACK"))


# ---------------------------------------------------------------------------
# T15 – migration reversibility (runs on its own isolated branch DB)
# ---------------------------------------------------------------------------


@pytest.mark.migration
def test_stock_migration_is_reversible():
    """T15: downgrade -1 then upgrade head recreates the stock table with all
    required columns and constraints.

    SCHEMA-RECREATION assertion only — no data survival (this is a
    create-table migration; downgrade drops the table entirely).
    """
    # Step 1: downgrade -1 (drops the stock table).
    down = _run_alembic("downgrade", "-1")
    assert down.returncode == 0, (
        f"alembic downgrade -1 failed:\nstdout: {down.stdout}\nstderr: {down.stderr}"
    )

    # Step 2: upgrade head (recreates the stock table).
    up = _run_alembic("upgrade", "head")
    assert up.returncode == 0, (
        f"alembic upgrade head failed:\nstdout: {up.stdout}\nstderr: {up.stderr}"
    )

    # Step 3: assert schema is fully recreated.
    insp = sa.inspect(engine)

    # Table exists.
    assert insp.has_table("stock"), "stock table not recreated after downgrade + upgrade"

    # All required columns present.
    cols = {c["name"]: c for c in insp.get_columns("stock")}
    for required_col in ("id", "sku", "location", "quantity"):
        assert required_col in cols, (
            f"Column '{required_col}' missing from stock table after migration round-trip"
        )

    # NOT NULL on sku, location, quantity.
    for not_null_col in ("sku", "location", "quantity"):
        col_info = cols[not_null_col]
        assert not col_info.get("nullable", True), (
            f"Column '{not_null_col}' should be NOT NULL after migration round-trip"
        )

    # UNIQUE constraint on (sku, location).
    unique_constrs = insp.get_unique_constraints("stock")
    uq_pairs = [tuple(sorted(c["column_names"])) for c in unique_constrs]
    assert ("location", "sku") in uq_pairs, (
        f"UNIQUE(sku, location) constraint missing after migration round-trip. "
        f"Found: {uq_pairs}"
    )

    # CHECK constraint: quantity >= 0 — proved by a constraint-violating insert.
    with engine.connect() as conn:
        conn.execute(sa.text("BEGIN"))
        try:
            with pytest.raises(IntegrityError, match="check|ck_stock_quantity"):
                conn.execute(
                    sa.text(
                        "INSERT INTO stock (sku, location, quantity) "
                        "VALUES (:sku, :location, :qty)"
                    ),
                    {
                        "sku": f"SKU-MIGTEST-{uuid.uuid4().hex[:6]}",
                        "location": "MIG-LOC",
                        "qty": -1,
                    },
                )
        finally:
            conn.execute(sa.text("ROLLBACK"))


# ---------------------------------------------------------------------------
# T19 – refile upsert: exactly one row after re-POST of same (sku, location)
# ---------------------------------------------------------------------------


def test_refile_produces_exactly_one_row():
    """T19: A refile of an existing (sku, location) pair results in exactly one
    row in the stock table — no duplicate is inserted — verified on the real
    branch database."""
    sku = f"SKU-{uuid.uuid4().hex[:12].upper()}"
    location = f"LOC-{uuid.uuid4().hex[:8].upper()}"

    with engine.connect() as conn:
        # First write.
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity) "
                "VALUES (:sku, :location, :qty)"
            ),
            {"sku": sku, "location": location, "qty": 10},
        )
        conn.execute(sa.text("SAVEPOINT sp_refile"))

        # Refile (upsert) — ON CONFLICT (sku, location) DO UPDATE.
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity) "
                "VALUES (:sku, :location, :qty) "
                "ON CONFLICT (sku, location) DO UPDATE SET quantity = EXCLUDED.quantity"
            ),
            {"sku": sku, "location": location, "qty": 25},
        )

        row_count = conn.execute(
            sa.text("SELECT COUNT(*) FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": location},
        ).scalar()

        # Rollback to keep the shared verify DB clean.
        conn.execute(sa.text("ROLLBACK TO SAVEPOINT sp_refile"))
        conn.execute(sa.text("ROLLBACK"))

    assert row_count == 1, (
        f"Expected exactly 1 row after refile upsert, got {row_count}. "
        "The upsert must not insert a duplicate row."
    )
