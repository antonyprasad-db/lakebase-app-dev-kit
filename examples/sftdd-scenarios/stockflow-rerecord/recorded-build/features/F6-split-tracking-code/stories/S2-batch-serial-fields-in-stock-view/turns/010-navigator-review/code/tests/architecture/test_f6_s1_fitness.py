"""Architectural fitness tests for F6-S1-split-and-backfill-migration.

T5  - UNIQUE(sku, location) survived the migration unchanged (PI2).
T6  - batch_number and serial_number carry no NOT NULL constraint (PI3).
T8  - down migration re-adds inventory_code and reconstructs conforming rows
      (PI1 reversibility); isolated ephemeral branch, @pytest.mark.migration.
T9  - every pre-migration row survives alembic upgrade with quantity/sku/location
      intact (PI4 row-survival); isolated ephemeral branch, @pytest.mark.migration.
"""

import uuid
from pathlib import Path

import pytest
import sqlalchemy
from sqlalchemy.exc import IntegrityError

ROOT = Path(__file__).resolve().parents[2]


def _run_uid() -> str:
    return uuid.uuid4().hex[:8]


# ---------------------------------------------------------------------------
# T5 - UNIQUE(sku, location) survives the migration (PI2)
#      Runs on the shared UP-state verify branch.
# ---------------------------------------------------------------------------


def test_T5_unique_sku_location_constraint_survives_migration(db_session):
    """T5 (PI2): inserting two stock_records rows with the same (sku, location)
    raises a unique-constraint IntegrityError, proving UNIQUE(sku, location)
    is still enforced after the F6 migration."""
    sku = f"f6-pi2-sku-{_run_uid()}"
    loc = "BIN-F6-PI2"

    # Idempotent seed: clear any leftover from a prior killed run.
    db_session.execute(
        sqlalchemy.text(
            "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": sku, "loc": loc},
    )
    db_session.commit()

    # Insert first row (post-migration schema: no inventory_code).
    db_session.execute(
        sqlalchemy.text(
            "INSERT INTO stock_records (sku, location, quantity) "
            "VALUES (:sku, :loc, :qty)"
        ),
        {"sku": sku, "loc": loc, "qty": 1},
    )
    db_session.commit()

    # Second insert with the same (sku, location) must raise.
    with pytest.raises(Exception) as exc_info:
        db_session.execute(
            sqlalchemy.text(
                "INSERT INTO stock_records (sku, location, quantity) "
                "VALUES (:sku, :loc, :qty)"
            ),
            {"sku": sku, "loc": loc, "qty": 2},
        )
        db_session.commit()

    db_session.rollback()
    exc_str = str(exc_info.value).lower()
    assert any(kw in exc_str for kw in ("unique", "duplicate", "integrity", "violat")), (
        f"Expected a unique-constraint violation, got: {exc_info.value}"
    )


# ---------------------------------------------------------------------------
# T6 - batch_number and serial_number are nullable (PI3)
#      Runs on the shared UP-state verify branch.
# ---------------------------------------------------------------------------


def test_T6_batch_number_serial_number_are_nullable(db_session):
    """T6 (PI3): inserting a stock_records row with NULL batch_number and
    NULL serial_number commits successfully, proving both columns carry no
    NOT NULL constraint after the migration."""
    sku = f"f6-pi3-sku-{_run_uid()}"
    loc = "BIN-F6-PI3"

    # Idempotent seed.
    db_session.execute(
        sqlalchemy.text(
            "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
        ),
        {"sku": sku, "loc": loc},
    )
    db_session.commit()

    # Insert with explicit NULLs for both new columns -- must not raise.
    db_session.execute(
        sqlalchemy.text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :loc, :qty, NULL, NULL)"
        ),
        {"sku": sku, "loc": loc, "qty": 4},
    )
    db_session.commit()

    # Verify the row is present and both columns are NULL.
    row = db_session.execute(
        sqlalchemy.text(
            "SELECT batch_number, serial_number FROM stock_records "
            "WHERE sku = :sku AND location = :loc"
        ),
        {"sku": sku, "loc": loc},
    ).fetchone()
    assert row is not None, "Row not found after inserting with NULL batch/serial"
    assert row[0] is None, f"batch_number expected NULL, got {row[0]!r}"
    assert row[1] is None, f"serial_number expected NULL, got {row[1]!r}"


# ---------------------------------------------------------------------------
# T8 - down migration reconstructs inventory_code (PI1 reversibility)
#      Isolated ephemeral branch only -- @pytest.mark.migration.
# ---------------------------------------------------------------------------


@pytest.mark.migration
def test_T8_down_migration_reconstructs_inventory_code():
    """T8 (PI1): the down migration re-adds inventory_code and reconstructs it
    as location-batch-serial for conforming rows.

    Mechanism: alembic upgrade head (S1 migration already in the head chain),
    then alembic downgrade -1. After downgrade, inventory_code must exist and
    the conforming row seeded before upgrade must have inventory_code
    reconstructed as '<location>-<batch_number>-<serial_number>'.

    Marked @pytest.mark.migration so the verify harness runs this on its own
    isolated ephemeral branch, never against the shared verify DB.
    """
    import os
    from alembic import command as alembic_command
    from alembic.config import Config as AlembicConfig

    ini_path = str(ROOT / "alembic.ini")
    cfg = AlembicConfig(ini_path)

    # Bring the isolated branch to head (S1 migration applied).
    alembic_command.upgrade(cfg, "head")

    # Seed a conforming row in the post-migration schema.
    from app.database import SessionLocal
    sku = f"t8-conf-{_run_uid()}"
    loc = "LOC-T8"
    batch = "BT8"
    serial = "ST8"

    session = SessionLocal()
    try:
        session.execute(
            sqlalchemy.text(
                "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": loc},
        )
        session.execute(
            sqlalchemy.text(
                "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :loc, :qty, :bn, :sn)"
            ),
            {"sku": sku, "loc": loc, "qty": 10, "bn": batch, "sn": serial},
        )
        session.commit()
    finally:
        session.close()

    # Run the down migration: must not raise.
    alembic_command.downgrade(cfg, "-1")

    # After downgrade: inventory_code must be reconstructed as 'LOC-T8-BT8-ST8'.
    session2 = SessionLocal()
    try:
        row = session2.execute(
            sqlalchemy.text(
                "SELECT inventory_code FROM stock_records "
                "WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": loc},
        ).fetchone()
        assert row is not None, (
            "Conforming row not found after downgrade -- row was dropped"
        )
        expected_code = f"{loc}-{batch}-{serial}"
        assert row[0] == expected_code, (
            f"inventory_code reconstruction failed: expected {expected_code!r}, got {row[0]!r}"
        )
    finally:
        session2.close()

    # Restore to head so this isolated branch ends in a clean state.
    alembic_command.upgrade(cfg, "head")


# ---------------------------------------------------------------------------
# T9 - pre-migration rows survive alembic upgrade (PI4 row-survival)
#      Isolated ephemeral branch only -- @pytest.mark.migration.
# ---------------------------------------------------------------------------


@pytest.mark.migration
def test_T9_row_survival_across_up_migration():
    """T9 (PI4): every pre-migration stock row survives the up migration with
    quantity/sku/location intact; no row is dropped whether or not its code parsed.

    Mechanism: downgrade to the revision BEFORE the S1 migration, seed a mixed
    pre-migration seed (conforming + nonconforming rows) with per-run-unique SKUs,
    run alembic upgrade head, then assert every seeded row is still present
    with its original quantity/sku/location.

    Marked @pytest.mark.migration so the verify harness runs this on its own
    isolated ephemeral branch, never against the shared verify DB.
    """
    from alembic import command as alembic_command
    from alembic.config import Config as AlembicConfig

    ini_path = str(ROOT / "alembic.ini")
    cfg = AlembicConfig(ini_path)

    # Step 1: downgrade one step to reach the pre-S1-migration schema
    # (stock_records with inventory_code, without batch_number/serial_number).
    alembic_command.downgrade(cfg, "-1")

    # Step 2: seed a mixed pre-migration seed using the pre-migration schema.
    from app.database import SessionLocal
    uid = _run_uid()

    # conforming codes: location-batch-serial (parseable into 3 segments)
    conforming = [
        {"sku": f"t9-conf-{uid}-0", "loc": "LOC-A", "qty": 5, "ic": "LOC-A-B1-S1"},
        {"sku": f"t9-conf-{uid}-1", "loc": "LOC-B", "qty": 8, "ic": "LOC-B-B2-S2"},
    ]
    # nonconforming codes: fewer than 3 segments
    nonconforming = [
        {"sku": f"t9-nonconf-{uid}-0", "loc": "LOC-C", "qty": 3, "ic": "NOPARSE"},
        {"sku": f"t9-nonconf-{uid}-1", "loc": "LOC-D", "qty": 1, "ic": "ONLY-TWO"},
    ]
    all_rows = conforming + nonconforming

    session = SessionLocal()
    try:
        for row in all_rows:
            # Idempotent: delete before insert.
            session.execute(
                sqlalchemy.text(
                    "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
                ),
                {"sku": row["sku"], "loc": row["loc"]},
            )
            session.execute(
                sqlalchemy.text(
                    "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                    "VALUES (:sku, :loc, :qty, :ic)"
                ),
                {"sku": row["sku"], "loc": row["loc"], "qty": row["qty"], "ic": row["ic"]},
            )
        session.commit()
    finally:
        session.close()

    # Step 3: run the up migration (adds batch_number/serial_number, backfills, drops inventory_code).
    alembic_command.upgrade(cfg, "head")

    # Step 4: assert every seeded row survived with quantity/sku/location intact.
    session2 = SessionLocal()
    try:
        for row in all_rows:
            found = session2.execute(
                sqlalchemy.text(
                    "SELECT sku, location, quantity FROM stock_records "
                    "WHERE sku = :sku AND location = :loc"
                ),
                {"sku": row["sku"], "loc": row["loc"]},
            ).fetchone()
            assert found is not None, (
                f"Row dropped by migration: sku={row['sku']!r} location={row['loc']!r}"
            )
            assert found[0] == row["sku"], f"sku corrupted: {found[0]!r}"
            assert found[1] == row["loc"], f"location corrupted: {found[1]!r}"
            assert found[2] == row["qty"], (
                f"quantity corrupted for sku={row['sku']!r}: expected {row['qty']}, got {found[2]}"
            )
    finally:
        session2.close()
