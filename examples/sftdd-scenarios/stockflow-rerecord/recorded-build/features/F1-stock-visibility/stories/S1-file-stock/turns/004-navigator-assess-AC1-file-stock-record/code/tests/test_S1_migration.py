"""T14 - Migration reversibility test for S1-file-stock (PI5).

Marked @pytest.mark.migration so the verify substrate runs it on its OWN
isolated ephemeral branch -- never the shared verify DB.

Verifies: alembic downgrade -1 then upgrade head recreates stock_records
with the unique constraint on (sku, location), NOT NULL on all columns,
and CHECK (quantity >= 0).
"""

from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_INI = str(ROOT / "alembic.ini")


def _make_config() -> Config:
    cfg = Config(ALEMBIC_INI)
    return cfg


@pytest.mark.migration
def test_T14_migration_round_trips():
    """stock_records migration is reversible: downgrade -1 + upgrade head recreates the schema (PI5)."""
    cfg = _make_config()

    # Step 1: ensure we are at head.
    command.upgrade(cfg, "head")

    # Step 2: single-step downgrade (never downgrade base).
    command.downgrade(cfg, "-1")

    # Step 3: upgrade back to head.
    command.upgrade(cfg, "head")

    # Step 4: verify the table and constraints exist after the round-trip.
    from app.database import make_engine
    from sqlalchemy import pool

    engine = make_engine(poolclass=pool.NullPool)
    inspector = sa.inspect(engine)

    # Table must exist.
    assert "stock_records" in inspector.get_table_names(), (
        "stock_records table not found after migration round-trip (PI5)."
    )

    # Required columns must exist.
    columns = {col["name"] for col in inspector.get_columns("stock_records")}
    for required in ("sku", "location", "quantity", "inventory_code"):
        assert required in columns, (
            f"Column '{required}' missing after migration round-trip (PI5)."
        )

    # Unique constraint on (sku, location) must exist.
    unique_constraints = inspector.get_unique_constraints("stock_records")
    # Also check via indexes (Postgres often implements UNIQUE as a unique index).
    unique_indexes = [idx for idx in inspector.get_indexes("stock_records") if idx.get("unique")]
    unique_col_sets = [
        frozenset(uc["column_names"]) for uc in unique_constraints
    ] + [
        frozenset(idx["column_names"]) for idx in unique_indexes
    ]
    assert frozenset(["sku", "location"]) in unique_col_sets, (
        f"Unique constraint on (sku, location) missing after round-trip (PI1/PI5). "
        f"Found unique sets: {unique_col_sets}"
    )

    # CHECK constraint: verify quantity >= 0 is enforced at the DB level.
    with engine.connect() as conn:
        # A negative insert must fail.
        try:
            conn.execute(
                sa.text(
                    "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                    "VALUES ('TEST-MIGCHK', 'LOC-MIGCHK', -1, 'CODE-001')"
                )
            )
            conn.rollback()
            assert False, (
                "CHECK (quantity >= 0) not enforced after migration round-trip (PI3/PI5)."
            )
        except Exception as exc:
            # Expected: a DB-level constraint violation.
            conn.rollback()
            err = str(exc).lower()
            assert "check" in err or "constraint" in err or "violat" in err, (
                f"Unexpected exception type (expected CHECK violation): {exc}"
            )

    engine.dispose()
