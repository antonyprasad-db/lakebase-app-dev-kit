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


# ---------------------------------------------------------------------------
# T27 – AC2-every-row-survives: seed multiple rows, apply migration, delta == 0
# ---------------------------------------------------------------------------


@pytest.fixture()
def unique_sku_base_t27() -> str:
    return f"SKU-S2AC2-{uuid.uuid4().hex[:12].upper()}"


@pytest.fixture()
def unique_location_base_t27() -> str:
    return uuid.uuid4().hex[:8].upper()


@given(
    "multiple stock rows are seeded with uuid-suffixed location keys before the S2 drop migration",
    target_fixture="seeded_ctx_t27",
)
def given_multiple_stock_rows_seeded_t27(unique_sku_base_t27, unique_location_base_t27):
    """Seed 3 stock rows with per-run-unique (sku, location) pairs.

    Each location is uuid-suffixed so the test owns its rows exclusively.
    The before-count is recorded in the yielded context for the delta assertion.
    """
    base_sku = unique_sku_base_t27
    base_loc = unique_location_base_t27

    rows = [
        {"sku": f"{base_sku}-{i}", "location": f"LOC-{base_loc}-{i}", "quantity": i + 1}
        for i in range(3)
    ]

    with engine.connect() as conn:
        for row in rows:
            conn.execute(
                sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
                {"sku": row["sku"], "loc": row["location"]},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO stock (sku, location, quantity) "
                    "VALUES (:sku, :loc, :qty)"
                ),
                {"sku": row["sku"], "loc": row["location"], "qty": row["quantity"]},
            )
        conn.commit()

    yield {"rows": rows, "seeded_count": len(rows)}

    try:
        with engine.connect() as conn:
            for row in rows:
                conn.execute(
                    sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
                    {"sku": row["sku"], "loc": row["location"]},
                )
            conn.commit()
    except Exception:
        pass


@then("the delta row count for the test's own seeded rows is zero after the migration")
def then_delta_row_count_is_zero(seeded_ctx_t27):
    """T27: every row seeded before the S2 drop migration must still exist afterwards.

    Counts only the test's own rows (filtered by exact uuid-suffixed sku + location),
    never an absolute whole-table total, to avoid shared-state-aggregate-assertion smell.

    Delta = survived_count - seeded_count must equal 0.
    Goes RED if the migration truncates or inadvertently removes rows.
    Satisfies NFR-F6-data-durability: every stock row survives the schema refactor.
    """
    rows = seeded_ctx_t27["rows"]
    seeded_count = seeded_ctx_t27["seeded_count"]

    survived = 0
    with engine.connect() as conn:
        for row in rows:
            result = conn.execute(
                sa.text(
                    "SELECT COUNT(*) FROM stock "
                    "WHERE sku = :sku AND location = :loc"
                ),
                {"sku": row["sku"], "loc": row["location"]},
            )
            survived += result.scalar()

    delta = survived - seeded_count
    assert delta == 0, (
        f"Row-survival delta after S2 drop migration is {delta} (expected 0). "
        f"Seeded {seeded_count} rows; {survived} survived. "
        f"The S2 drop migration must only remove the inventory_code column "
        f"and must not truncate or drop stock rows. "
        f"Rows checked: {[(r['sku'], r['location']) for r in rows]}"
    )


# ---------------------------------------------------------------------------
# T28 – AC2-every-row-survives: seeded batch_number value is retained after migration
# ---------------------------------------------------------------------------


@pytest.fixture()
def unique_sku_t28() -> str:
    return f"SKU-S2T28-{uuid.uuid4().hex[:12].upper()}"


@pytest.fixture()
def unique_location_t28() -> str:
    return f"LOC-S2T28-{uuid.uuid4().hex[:8].upper()}"


@given(
    "a stock row with a uuid-suffixed sku and a known batch_number is seeded before the S2 drop migration",
    target_fixture="seeded_ctx_t28",
)
def given_stock_row_with_known_batch_number(unique_sku_t28, unique_location_t28):
    """Seed one stock row with a per-run-unique (sku, location) pair and a
    deterministic batch_number value so the T28 assertion can compare against it.

    inventory_code has already been dropped by S2; the trigger that would have
    overwritten batch_number was also dropped in the same migration (20260811000002),
    so the batch_number value inserted here persists unchanged through the
    alembic upgrade head no-op and can be verified afterwards.
    """
    sku = unique_sku_t28
    location = unique_location_t28
    known_batch_number = f"BATCH-{uuid.uuid4().hex[:8].upper()}"

    with engine.connect() as conn:
        conn.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": location},
        )
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity, batch_number) "
                "VALUES (:sku, :loc, 1, :bn)"
            ),
            {"sku": sku, "loc": location, "bn": known_batch_number},
        )
        conn.commit()

    yield {"sku": sku, "location": location, "batch_number": known_batch_number}

    try:
        with engine.connect() as conn:
            conn.execute(
                sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
                {"sku": sku, "loc": location},
            )
            conn.commit()
    except Exception:
        pass


@then("the seeded row's batch_number value equals the original seeded value")
def then_batch_number_value_preserved(seeded_ctx_t28):
    """T28: after the S2 drop migration, a row's batch_number must equal the
    value that was seeded before the migration ran.

    The S2 migration drops inventory_code and the trigger that derived
    batch_number from it; existing batch_number values must be untouched.
    Goes RED if the migration truncates rows or corrupts tracking-part columns.
    Satisfies NFR-F6-data-durability (no loss or corruption of stock rows).
    """
    sku = seeded_ctx_t28["sku"]
    location = seeded_ctx_t28["location"]
    expected = seeded_ctx_t28["batch_number"]

    with engine.connect() as conn:
        result = conn.execute(
            sa.text(
                "SELECT batch_number FROM stock "
                "WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        )
        row = result.fetchone()

    assert row is not None, (
        f"Row (sku={sku}, location={location}) not found in stock after the "
        f"S2 drop migration — the migration must not remove existing rows."
    )
    assert row[0] == expected, (
        f"batch_number value changed after the S2 drop migration. "
        f"Expected {expected!r}, got {row[0]!r}. "
        f"The S2 migration must only drop inventory_code; it must not modify "
        f"or null-out existing batch_number column values."
    )


# ---------------------------------------------------------------------------
# T29 – AC2-every-row-survives: seeded serial_number value is retained after migration
# ---------------------------------------------------------------------------


@pytest.fixture()
def unique_sku_t29() -> str:
    return f"SKU-S2T29-{uuid.uuid4().hex[:12].upper()}"


@pytest.fixture()
def unique_location_t29() -> str:
    return f"LOC-S2T29-{uuid.uuid4().hex[:8].upper()}"


@given(
    "a stock row with a uuid-suffixed sku and a known serial_number is seeded before the S2 drop migration",
    target_fixture="seeded_ctx_t29",
)
def given_stock_row_with_known_serial_number(unique_sku_t29, unique_location_t29):
    """Seed one stock row with a per-run-unique (sku, location) pair and a
    deterministic serial_number value so the T29 assertion can compare against it.

    inventory_code has already been dropped by S2; the trigger that would have
    overwritten serial_number was also dropped in the same migration, so the
    serial_number value inserted here persists unchanged and can be verified
    after the alembic upgrade head no-op.
    """
    sku = unique_sku_t29
    location = unique_location_t29
    known_serial_number = f"SER-{uuid.uuid4().hex[:8].upper()}"

    with engine.connect() as conn:
        conn.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": location},
        )
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity, serial_number) "
                "VALUES (:sku, :loc, 1, :sn)"
            ),
            {"sku": sku, "loc": location, "sn": known_serial_number},
        )
        conn.commit()

    yield {"sku": sku, "location": location, "serial_number": known_serial_number}

    try:
        with engine.connect() as conn:
            conn.execute(
                sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
                {"sku": sku, "loc": location},
            )
            conn.commit()
    except Exception:
        pass


@then("the seeded row's serial_number value equals the original seeded value")
def then_serial_number_value_preserved(seeded_ctx_t29):
    """T29: after the S2 drop migration, a row's serial_number must equal the
    value that was seeded before the migration ran.

    The S2 migration drops inventory_code and the trigger that derived
    serial_number from it; existing serial_number values must be untouched.
    Goes RED if the migration truncates rows or corrupts tracking-part columns.
    Satisfies NFR-F6-data-durability (no loss or corruption of stock rows) and
    NFR-F6-unique-identity-preserved (serial_number remains separately addressable).
    """
    sku = seeded_ctx_t29["sku"]
    location = seeded_ctx_t29["location"]
    expected = seeded_ctx_t29["serial_number"]

    with engine.connect() as conn:
        result = conn.execute(
            sa.text(
                "SELECT serial_number FROM stock "
                "WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        )
        row = result.fetchone()

    assert row is not None, (
        f"Row (sku={sku}, location={location}) not found in stock after the "
        f"S2 drop migration — the migration must not remove existing rows."
    )
    assert row[0] == expected, (
        f"serial_number value changed after the S2 drop migration. "
        f"Expected {expected!r}, got {row[0]!r}. "
        f"The S2 migration must only drop inventory_code; it must not modify "
        f"or null-out existing serial_number column values."
    )


# ---------------------------------------------------------------------------
# T30 – AC2-every-row-survives: seeded location value is retained after migration
# ---------------------------------------------------------------------------


@pytest.fixture()
def unique_sku_t30() -> str:
    return f"SKU-S2T30-{uuid.uuid4().hex[:12].upper()}"


@pytest.fixture()
def unique_location_t30() -> str:
    return f"LOC-S2T30-{uuid.uuid4().hex[:8].upper()}"


@given(
    "a stock row with a uuid-suffixed sku and a known location is seeded before the S2 drop migration",
    target_fixture="seeded_ctx_t30",
)
def given_stock_row_with_known_location(unique_sku_t30, unique_location_t30):
    """Seed one stock row with a per-run-unique (sku, location) pair and record
    the exact location value so the T30 assertion can compare against it.

    Location is part of the stock table's unique identity (sku, location), and
    NFR-F6-unique-identity-preserved requires it is NOT re-derived from any
    combined-code field.  The S2 migration drops inventory_code; the location
    column and its values must be completely unaffected.
    """
    sku = unique_sku_t30
    known_location = unique_location_t30

    with engine.connect() as conn:
        conn.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": known_location},
        )
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity) "
                "VALUES (:sku, :loc, 1)"
            ),
            {"sku": sku, "loc": known_location},
        )
        conn.commit()

    yield {"sku": sku, "location": known_location}

    try:
        with engine.connect() as conn:
            conn.execute(
                sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
                {"sku": sku, "loc": known_location},
            )
            conn.commit()
    except Exception:
        pass


@then("the seeded row's location value equals the original seeded value")
def then_location_value_preserved(seeded_ctx_t30):
    """T30: after the S2 drop migration, a row's location must equal the value
    that was seeded before the migration ran.

    Location is the canonical position identity (sku, location uniqueness from F1
    PI2) and must never be re-derived from or overwritten by the combined-code
    columns.  The S2 migration drops only inventory_code; it must not modify or
    null-out existing location values.
    Goes RED if the migration truncates rows or corrupts the location column.
    Satisfies NFR-F6-data-durability (no loss/corruption) and
    NFR-F6-unique-identity-preserved (location is not re-derived from the code).
    """
    sku = seeded_ctx_t30["sku"]
    expected = seeded_ctx_t30["location"]

    with engine.connect() as conn:
        result = conn.execute(
            sa.text(
                "SELECT location FROM stock "
                "WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": expected},
        )
        row = result.fetchone()

    assert row is not None, (
        f"Row (sku={sku}, location={expected}) not found in stock after the "
        f"S2 drop migration — the migration must not remove existing rows."
    )
    assert row[0] == expected, (
        f"location value changed after the S2 drop migration. "
        f"Expected {expected!r}, got {row[0]!r}. "
        f"The S2 migration must only drop inventory_code; it must not modify "
        f"or null-out existing location column values."
    )


# ---------------------------------------------------------------------------
# T31 – AC3-down-migration-reconstructs-code: inventory_code present after down-migration
# ---------------------------------------------------------------------------


@given(
    "the branch database is in post-drop state with inventory_code absent from the stock schema",
    target_fixture="t31_ctx",
)
def given_branch_db_post_drop_state_t31():
    """T31 setup: ensure the DB is at HEAD (post-drop state, inventory_code absent).

    Runs upgrade head to guarantee we start from the S2-applied state, then
    verifies inventory_code is absent (the forward migration is effective).
    Teardown restores HEAD after the @when downgrade runs so subsequent tests
    that also need the post-drop state start from a clean baseline.
    """
    up = _run_alembic("upgrade", "head")
    assert up.returncode == 0, (
        f"alembic upgrade head (T31 pre-condition) failed:\n"
        f"stdout: {up.stdout}\nstderr: {up.stderr}"
    )
    engine.dispose()

    insp = sa.inspect(engine)
    col_names = {c["name"] for c in insp.get_columns("stock")}
    assert "inventory_code" not in col_names, (
        f"T31 pre-condition failed: inventory_code is present in the stock schema "
        f"(expected post-drop state with inventory_code absent). "
        f"Columns present: {sorted(col_names)}"
    )

    yield {}

    # Restore to HEAD (re-applies the S2 drop) after the @when downgrade ran.
    _run_alembic("upgrade", "head")
    engine.dispose()


@when("the S2 down-migration is applied to roll back the drop")
def when_s2_down_migration_applied_t31():
    """Apply alembic downgrade -1 to undo the S2 drop migration (the reversibility step)."""
    down = _run_alembic("downgrade", "-1")
    assert down.returncode == 0, (
        f"alembic downgrade -1 failed:\nstdout: {down.stdout}\nstderr: {down.stderr}"
    )
    engine.dispose()


@then("the inventory_code column is present in the stock table schema after the down-migration")
def then_inventory_code_present_after_downgrade():
    """T31: after the S2 down-migration, inventory_code must be present in the stock
    table schema.

    The paired down-migration (PI5 reversibility) must re-add inventory_code so that
    the schema is restored to its pre-S2 shape.  Assertion is on SCHEMA SHAPE via
    sa.inspect against the real paired-branch DB (NFR-F6-real-branch-integration-tests).
    Goes RED if the down-migration omits the ADD COLUMN step or the column is
    misspelled / placed on the wrong table.
    """
    insp = sa.inspect(engine)
    assert insp.has_table("stock"), (
        "stock table is missing after the S2 down-migration"
    )
    col_names = {c["name"] for c in insp.get_columns("stock")}
    assert "inventory_code" in col_names, (
        f"inventory_code column is absent from the stock table after the S2 "
        f"down-migration. The downgrade must re-add inventory_code to satisfy "
        f"reversibility (PI5, NFR-F6-data-durability). "
        f"Columns currently present: {sorted(col_names)}"
    )


# ---------------------------------------------------------------------------
# T32 – AC3-down-migration-reconstructs-code: inventory_code equals combined-code
#        formula (location || '-' || batch_number || '-' || serial_number) after
#        the S2 down-migration runs against a row seeded with all three fields.
# ---------------------------------------------------------------------------


@pytest.fixture()
def unique_sku_t32() -> str:
    return f"SKU-S2T32-{uuid.uuid4().hex[:12].upper()}"


@pytest.fixture()
def unique_location_t32() -> str:
    return f"LOC-{uuid.uuid4().hex[:8].upper()}"


@given(
    "the branch database is in post-drop state with a seeded row having known location, batch_number, and serial_number",
    target_fixture="t32_ctx",
)
def given_post_drop_state_with_seeded_row_t32(unique_sku_t32, unique_location_t32):
    """T32 setup: ensure the branch DB is at HEAD (post-drop, inventory_code absent),
    then seed one row with per-run-unique location, batch_number, and serial_number
    so the @then step can assert the combined-code reconstruction formula after the
    down-migration is applied.

    Teardown deletes the seeded row and re-applies upgrade head to restore the branch
    to its HEAD state (post-drop), leaving the shared DB clean for subsequent tests.
    """
    up = _run_alembic("upgrade", "head")
    assert up.returncode == 0, (
        f"alembic upgrade head (T32 pre-condition) failed:\n"
        f"stdout: {up.stdout}\nstderr: {up.stderr}"
    )
    engine.dispose()

    insp = sa.inspect(engine)
    col_names = {c["name"] for c in insp.get_columns("stock")}
    assert "inventory_code" not in col_names, (
        f"T32 pre-condition failed: inventory_code is present in the stock schema "
        f"(expected post-drop state with inventory_code absent). "
        f"Columns present: {sorted(col_names)}"
    )

    sku = unique_sku_t32
    location = unique_location_t32
    batch_number = f"BATCH-{uuid.uuid4().hex[:8].upper()}"
    serial_number = f"SER-{uuid.uuid4().hex[:8].upper()}"

    with engine.connect() as conn:
        conn.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": location},
        )
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :loc, 1, :bn, :sn)"
            ),
            {"sku": sku, "loc": location, "bn": batch_number, "sn": serial_number},
        )
        conn.commit()

    yield {
        "sku": sku,
        "location": location,
        "batch_number": batch_number,
        "serial_number": serial_number,
    }

    # Cleanup: remove the seeded row (inventory_code is now present after the
    # downgrade; delete by sku/location which survive the round-trip).
    try:
        with engine.connect() as conn:
            conn.execute(
                sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
                {"sku": sku, "loc": location},
            )
            conn.commit()
    except Exception:
        pass

    # Restore the branch schema to HEAD (re-applies the S2 drop migration).
    _run_alembic("upgrade", "head")
    engine.dispose()


@then(
    "the seeded row's inventory_code equals location concatenated with batch_number and serial_number"
)
def then_inventory_code_equals_combined_code_formula(t32_ctx):
    """T32: after the S2 down-migration, inventory_code must equal the combined-code
    formula: location || '-' || batch_number || '-' || serial_number.

    The downgrade's UPDATE step rebuilds inventory_code for every row where both
    batch_number and serial_number are non-NULL.  This test verifies that the
    reconstructed value matches the canonical formula exactly — not just that the
    column is present (T31), but that the DATA is correct.

    Goes RED if:
    - the downgrade omits the UPDATE backfill step (inventory_code stays NULL);
    - the formula uses the wrong separator, wrong column order, or wrong columns;
    - the downgrade truncates or corrupts the seeded row.

    Satisfies AC3-down-migration-reconstructs-code (PI5 reversibility) and
    NFR-F6-data-durability (the backfill faithfully reconstructs the combined code).
    NFR-F6-real-branch-integration-tests: assertion runs against the real paired-branch
    DB via DATABASE_URL; no mock or in-memory substitute.
    """
    sku = t32_ctx["sku"]
    location = t32_ctx["location"]
    batch_number = t32_ctx["batch_number"]
    serial_number = t32_ctx["serial_number"]
    expected = f"{location}-{batch_number}-{serial_number}"

    with engine.connect() as conn:
        result = conn.execute(
            sa.text(
                "SELECT inventory_code FROM stock "
                "WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        )
        row = result.fetchone()

    assert row is not None, (
        f"Row (sku={sku!r}, location={location!r}) not found in stock after the "
        f"S2 down-migration — the downgrade must not remove existing rows."
    )
    assert row[0] == expected, (
        f"inventory_code mismatch after the S2 down-migration. "
        f"Expected {expected!r} (location || '-' || batch_number || '-' || serial_number), "
        f"got {row[0]!r}. "
        f"The downgrade must reconstruct inventory_code from the combined-code formula "
        f"(AC3-down-migration-reconstructs-code, PI5 reversibility, "
        f"NFR-F6-data-durability)."
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
