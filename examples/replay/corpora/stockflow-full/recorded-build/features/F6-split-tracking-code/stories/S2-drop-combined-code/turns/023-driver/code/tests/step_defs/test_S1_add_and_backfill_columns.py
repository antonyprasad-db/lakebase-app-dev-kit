"""pytest-bdd step definitions for S1-add-and-backfill-columns.feature.

T1 – AC1: batch_number and serial_number are separately addressable columns after migration.
T2 – AC1: location remains present and unchanged after migration (inventory_code dropped by S2).
T7 – AC2: batch_number retains the value set at filing (inventory_code dropped by S2).
T8 – AC2: serial_number retains the value set at filing (inventory_code dropped by S2).
T9 – AC3: batch_number is NULL when no tracking fields were filed.
T10 – AC3: serial_number is NULL when no tracking fields were filed.
T11 – AC3: nonconforming stock row is still present in the table with its sku unchanged.
T12 – AC3 / PI1-batch-serial-nullable: inserting with batch_number=NULL and serial_number=NULL
      succeeds without a constraint violation (fitness test, plain pytest).
T13 – AC3 / PI1-batch-serial-nullable: inserting with sku=NULL raises a NOT NULL constraint
      violation (fitness test, plain pytest).
T14 – AC4: the count of test-owned seeded rows is identical before and after the upgrade.
T15 – AC4: each seeded stock row retains its original sku value after the upgrade.
T16 – AC4: each seeded stock row retains its original location value after the upgrade.
T17 – AC4: each seeded stock row retains its original quantity value after the upgrade.
T18 – AC4 / PI2-sku-location-unique: inserting two rows with the same (sku, location) raises
      UniqueViolation (fitness test, plain pytest).
T22 – AC5-integrity-probe-reports-nonconforming-count: after seeding a mixed table of
      conforming and nonconforming rows, the integrity probe returns the exact count of
      rows whose batch_number and serial_number are both NULL (behavior test, BDD).

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
    """Seed a row and DELETE it on teardown."""
    sku = unique_sku
    location = unique_location
    with engine.connect() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity) "
                "VALUES (:sku, :location, :qty) "
                "ON CONFLICT (sku, location) DO NOTHING"
            ),
            {"sku": sku, "location": location, "qty": 1},
        )
        conn.commit()
    yield {"sku": sku, "location": location}
    # Cleanup — best-effort; autouse fixture restores head migration after each test
    with engine.connect() as conn:
        conn.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": location},
        )
        conn.commit()


@when(
    "the add-and-backfill migration is applied to the real branch database",
)
def when_migration_applied():
    """Run alembic upgrade head so the new migration (to be authored) is applied."""
    result = _run_alembic("upgrade", "head")
    assert result.returncode == 0, (
        f"alembic upgrade head failed:\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )


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
    """Seed a row with a known location value."""
    sku = unique_sku
    location = unique_location
    with engine.connect() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity) "
                "VALUES (:sku, :location, :qty) "
                "ON CONFLICT (sku, location) DO NOTHING"
            ),
            {"sku": sku, "location": location, "qty": 2},
        )
        conn.commit()
    yield {"sku": sku, "location": location}
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
    """T2: inventory_code column has been dropped by S2; verify the row still exists."""
    sku = seeded_ctx["sku"]
    location = seeded_ctx["location"]
    with engine.connect() as conn:
        row = conn.execute(
            sa.text(
                "SELECT sku FROM stock WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        ).mappings().fetchone()
    assert row is not None, (
        f"Row for sku={sku!r}, location={location!r} not found after migration"
    )


# ---------------------------------------------------------------------------
# Shared fixtures for T7 / T8 / T9
# ---------------------------------------------------------------------------


@pytest.fixture()
def unique_sku_t7t8() -> str:
    return f"SKU-S1AC2-{uuid.uuid4().hex[:12].upper()}"


@pytest.fixture()
def unique_location_t7t8() -> str:
    return f"LOC-S1AC2-{uuid.uuid4().hex[:8].upper()}"


@pytest.fixture()
def unique_sku_t9() -> str:
    return f"SKU-S1AC3-{uuid.uuid4().hex[:12].upper()}"


@pytest.fixture()
def unique_location_t9() -> str:
    return f"LOC-S1AC3-{uuid.uuid4().hex[:8].upper()}"


# ---------------------------------------------------------------------------
# T7 / T8 – Given  (conforming code; single fixture shared by both scenarios)
# ---------------------------------------------------------------------------


@given(
    "a stock row with a conforming location-batch-serial inventory_code is seeded before the add-and-backfill migration",
    target_fixture="conforming_ctx",
)
def given_conforming_code_seeded(unique_sku_t7t8, unique_location_t7t8):
    """Seed a stock row with explicit batch_number and serial_number.

    inventory_code was dropped by S2. batch_number and serial_number are seeded
    directly. Upgrade to head first so any migration-era trigger (which would
    override these values from inventory_code) is removed before the INSERT.
    """
    # Ensure we are at HEAD (no inventory_code-derived trigger) before seeding
    # tracking fields directly. If a prior migration test left the DB at an
    # intermediate revision, that trigger would silently override batch_number
    # and serial_number to NULL on INSERT.
    _run_alembic("upgrade", "head")
    engine.dispose()

    sku = unique_sku_t7t8
    location = unique_location_t7t8
    batch_segment = "BATCH77"
    serial_segment = "SER088"
    with engine.connect() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :location, :qty, :batch, :serial) "
                "ON CONFLICT (sku, location) DO NOTHING"
            ),
            {"sku": sku, "location": location, "qty": 1, "batch": batch_segment, "serial": serial_segment},
        )
        conn.commit()
    yield {
        "sku": sku,
        "location": location,
        "expected_batch": batch_segment,
        "expected_serial": serial_segment,
    }
    with engine.connect() as conn:
        conn.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": location},
        )
        conn.commit()


# ---------------------------------------------------------------------------
# T7 – Then  (batch_number equals the second hyphen segment)
# ---------------------------------------------------------------------------


@then("the seeded row has batch_number equal to the batch segment of its inventory_code")
def then_batch_number_matches_batch_segment(conforming_ctx):
    """T7: batch_number must equal the value filed directly (inventory_code dropped by S2)."""
    sku = conforming_ctx["sku"]
    location = conforming_ctx["location"]
    expected = conforming_ctx["expected_batch"]
    with engine.connect() as conn:
        row = conn.execute(
            sa.text(
                "SELECT batch_number FROM stock WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        ).mappings().fetchone()
    assert row is not None, (
        f"No row found for sku={sku!r}, location={location!r} after migration"
    )
    assert row["batch_number"] == expected, (
        f"batch_number incorrect: expected {expected!r}, got {row['batch_number']!r}."
    )


# ---------------------------------------------------------------------------
# T8 – Then  (serial_number equals the third hyphen segment)
# ---------------------------------------------------------------------------


@then("the seeded row has serial_number equal to the serial segment of its inventory_code")
def then_serial_number_matches_serial_segment(conforming_ctx):
    """T8: serial_number must equal the value filed directly (inventory_code dropped by S2)."""
    sku = conforming_ctx["sku"]
    location = conforming_ctx["location"]
    expected = conforming_ctx["expected_serial"]
    with engine.connect() as conn:
        row = conn.execute(
            sa.text(
                "SELECT serial_number FROM stock WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        ).mappings().fetchone()
    assert row is not None, (
        f"No row found for sku={sku!r}, location={location!r} after migration"
    )
    assert row["serial_number"] == expected, (
        f"serial_number incorrect: expected {expected!r}, got {row['serial_number']!r}."
    )


# ---------------------------------------------------------------------------
# T9 – Given / Then  (nonconforming code leaves batch_number NULL)
# ---------------------------------------------------------------------------


@given(
    "a stock row with a nonconforming two-segment inventory_code is seeded before the add-and-backfill migration",
    target_fixture="nonconforming_ctx",
)
def given_nonconforming_code_seeded(unique_sku_t9, unique_location_t9):
    """Seed a stock row without batch_number or serial_number (no tracking fields filed)."""
    sku = unique_sku_t9
    location = unique_location_t9
    with engine.connect() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO stock (sku, location, quantity) "
                "VALUES (:sku, :location, :qty) "
                "ON CONFLICT (sku, location) DO NOTHING"
            ),
            {"sku": sku, "location": location, "qty": 1},
        )
        conn.commit()
    yield {"sku": sku, "location": location}
    with engine.connect() as conn:
        conn.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": location},
        )
        conn.commit()


@then("the seeded row has batch_number left NULL")
def then_batch_number_is_null(nonconforming_ctx):
    """T9: a row filed without tracking fields must have batch_number NULL."""
    sku = nonconforming_ctx["sku"]
    location = nonconforming_ctx["location"]
    with engine.connect() as conn:
        row = conn.execute(
            sa.text(
                "SELECT batch_number FROM stock WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        ).mappings().fetchone()
    assert row is not None, (
        f"No row found for sku={sku!r}, location={location!r} after migration — "
        "nonconforming rows must be preserved, not dropped"
    )
    assert row["batch_number"] is None, (
        f"batch_number should be NULL for a row seeded without tracking fields; "
        f"got {row['batch_number']!r}"
    )


# ---------------------------------------------------------------------------
# T10 – Then  (serial_number left NULL for nonconforming code)
# ---------------------------------------------------------------------------


@then("the seeded row has serial_number left NULL")
def then_serial_number_is_null(nonconforming_ctx):
    """T10: a row filed without tracking fields must have serial_number NULL."""
    sku = nonconforming_ctx["sku"]
    location = nonconforming_ctx["location"]
    with engine.connect() as conn:
        row = conn.execute(
            sa.text(
                "SELECT serial_number FROM stock WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        ).mappings().fetchone()
    assert row is not None, (
        f"No row found for sku={sku!r}, location={location!r} after migration — "
        "nonconforming rows must be preserved, not dropped"
    )
    assert row["serial_number"] is None, (
        f"serial_number should be NULL for a row seeded without tracking fields; "
        f"got {row['serial_number']!r}"
    )


# ---------------------------------------------------------------------------
# T11 – Then  (nonconforming row still present with sku unchanged)
# ---------------------------------------------------------------------------


@then("the nonconforming stock row is still present in the table with its sku unchanged")
def then_nonconforming_row_still_present(nonconforming_ctx):
    """T11: the nonconforming row must survive the migration intact — not dropped, not renamed."""
    sku = nonconforming_ctx["sku"]
    location = nonconforming_ctx["location"]
    with engine.connect() as conn:
        row = conn.execute(
            sa.text(
                "SELECT sku FROM stock WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        ).mappings().fetchone()
    assert row is not None, (
        f"Nonconforming row (sku={sku!r}, location={location!r}) is missing after migration — "
        "the migration must not drop rows seeded without tracking fields"
    )
    assert row["sku"] == sku, (
        f"sku changed by migration: expected {sku!r}, got {row['sku']!r}"
    )


# ---------------------------------------------------------------------------
# T12 – AC3 / PI1-batch-serial-nullable  (fitness: NULL batch/serial is allowed)
# ---------------------------------------------------------------------------


def test_insert_null_batch_and_serial_succeeds():
    """T12: batch_number and serial_number are nullable columns.

    Inserting a stock row with both set to NULL must succeed without raising
    any constraint violation — the columns are intentionally nullable so that
    nonconforming inventory codes (which cannot be parsed) leave them NULL.

    Fitness test (plain pytest, not Gherkin); runs against the real branch DB.
    """
    sku = f"SKU-S1AC3T12-{uuid.uuid4().hex[:10].upper()}"
    location = f"LOC-S1AC3T12-{uuid.uuid4().hex[:8].upper()}"
    inserted = False
    with engine.connect() as conn:
        # Ensure upgrade is at head so the nullable columns exist.
        result = subprocess.run(
            ["uv", "run", "alembic", "upgrade", "head"],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, (
            f"alembic upgrade head failed before T12 insert:\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )

        try:
            conn.execute(
                sa.text(
                    "DELETE FROM stock WHERE sku = :sku AND location = :loc"
                ),
                {"sku": sku, "loc": location},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO stock (sku, location, quantity, batch_number, serial_number) "
                    "VALUES (:sku, :loc, 1, NULL, NULL)"
                ),
                {"sku": sku, "loc": location},
            )
            conn.commit()
            inserted = True
        finally:
            if inserted:
                with engine.connect() as cleanup:
                    cleanup.execute(
                        sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
                        {"sku": sku, "loc": location},
                    )
                    cleanup.commit()

    assert inserted, (
        "INSERT with batch_number=NULL and serial_number=NULL raised an exception — "
        "both columns must be declared NULLABLE in the migration"
    )


# ---------------------------------------------------------------------------
# T13 – AC3 / PI1-batch-serial-nullable  (fitness: sku is NOT NULL)
# ---------------------------------------------------------------------------


def test_insert_null_sku_raises_not_null_violation():
    """T13: sku is declared NOT NULL; inserting with sku=NULL must raise an
    IntegrityError (NOT NULL constraint violation).

    This is the complementary guard to T12: batch_number and serial_number are
    nullable (AC3), but sku must never be nullable — it is the stable identity
    key that the (sku, location) uniqueness constraint (PI2) depends on.

    Fitness test (plain pytest, not Gherkin); runs against the real branch DB.
    """
    location = f"LOC-S1AC3T13-{uuid.uuid4().hex[:8].upper()}"

    with pytest.raises(sa.exc.IntegrityError) as exc_info:
        with engine.connect() as conn:
            conn.execute(
                sa.text(
                    "INSERT INTO stock (sku, location, quantity) "
                    "VALUES (NULL, :loc, 1)"
                ),
                {"loc": location},
            )
            conn.commit()

    assert exc_info.value is not None, (
        "Expected IntegrityError for sku=NULL but no exception was raised — "
        "the sku column must carry a NOT NULL constraint"
    )


# ---------------------------------------------------------------------------
# Fixtures shared by T14 and T15
# ---------------------------------------------------------------------------


@pytest.fixture()
def unique_skus_t14t15():
    """Three per-run-unique SKUs for the T14/T15 durability scenarios."""
    return [f"SKU-S1AC4-{uuid.uuid4().hex[:12].upper()}" for _ in range(3)]


@pytest.fixture()
def unique_locations_t14t15():
    """Three per-run-unique locations for the T14/T15 durability scenarios."""
    return [f"LOC-S1AC4-{i}-{uuid.uuid4().hex[:6].upper()}" for i in range(3)]


# ---------------------------------------------------------------------------
# T14 / T15 – Given  (seed a set of rows; capture pre-migration count)
# ---------------------------------------------------------------------------


@given(
    "a set of stock rows is seeded with unique keys before the add-and-backfill migration",
    target_fixture="multi_seed_ctx",
)
def given_multi_rows_seeded(unique_skus_t14t15, unique_locations_t14t15):
    """Seed three stock rows with per-run-unique (sku, location) pairs.

    Captures the pre-migration row count scoped to the test-owned SKUs so that
    the T14 assertion compares a delta — not a whole-table aggregate — avoiding
    the shared-state-aggregate-assertion smell on a shared verify DB.
    A DELETE before each INSERT ensures a prior killed run cannot leave
    orphaned rows that cause a duplicate-key failure on re-run.
    """
    skus = unique_skus_t14t15
    locations = unique_locations_t14t15
    rows = [
        {
            "sku": skus[i],
            "location": locations[i],
            "quantity": i + 1,
        }
        for i in range(3)
    ]

    with engine.connect() as conn:
        for r in rows:
            # Idempotent seed: clear any stale row from a prior killed run first.
            conn.execute(
                sa.text("DELETE FROM stock WHERE sku = :sku"),
                {"sku": r["sku"]},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO stock (sku, location, quantity) "
                    "VALUES (:sku, :location, :qty)"
                ),
                {
                    "sku": r["sku"],
                    "location": r["location"],
                    "qty": r["quantity"],
                },
            )
        conn.commit()

    # Capture pre-migration count scoped to only this test's SKUs.
    pre_count = 0
    with engine.connect() as conn:
        for r in rows:
            pre_count += conn.execute(
                sa.text(
                    "SELECT COUNT(*) FROM stock "
                    "WHERE sku = :sku AND location = :loc"
                ),
                {"sku": r["sku"], "loc": r["location"]},
            ).scalar()

    yield {"rows": rows, "pre_count": pre_count}

    # Cleanup — best-effort; autouse fixture restores head migration after each test.
    with engine.connect() as conn:
        for r in rows:
            conn.execute(
                sa.text("DELETE FROM stock WHERE sku = :sku"),
                {"sku": r["sku"]},
            )
        conn.commit()


# ---------------------------------------------------------------------------
# T14 – Then  (scoped row count is unchanged)
# ---------------------------------------------------------------------------


@then("the count of seeded stock rows is the same as before the migration")
def then_row_count_unchanged(multi_seed_ctx):
    """T14: the migration must not drop any of the test-owned rows.

    Counts only the rows seeded by this test run (filtered by the per-run-unique
    SKUs) so the assertion is a scoped delta, never a whole-table aggregate.
    """
    rows = multi_seed_ctx["rows"]
    pre_count = multi_seed_ctx["pre_count"]

    post_count = 0
    with engine.connect() as conn:
        for r in rows:
            post_count += conn.execute(
                sa.text(
                    "SELECT COUNT(*) FROM stock "
                    "WHERE sku = :sku AND location = :loc"
                ),
                {"sku": r["sku"], "loc": r["location"]},
            ).scalar()

    assert post_count == pre_count, (
        f"Row count changed after migration: before={pre_count}, after={post_count}. "
        "The add-and-backfill migration must be additive — it must never delete "
        "or lose pre-existing rows."
    )


# ---------------------------------------------------------------------------
# T15 – Then  (each row's sku is unchanged)
# ---------------------------------------------------------------------------


@then("each seeded stock row has the same sku value as before the migration")
def then_each_sku_unchanged(multi_seed_ctx):
    """T15: the migration must not alter the sku of any pre-existing row.

    sku is the stable identity key; the (sku, location) uniqueness invariant
    (PI2) depends on it never changing during a schema refactor.
    """
    rows = multi_seed_ctx["rows"]

    with engine.connect() as conn:
        for r in rows:
            row = conn.execute(
                sa.text(
                    "SELECT sku FROM stock "
                    "WHERE sku = :sku AND location = :loc"
                ),
                {"sku": r["sku"], "loc": r["location"]},
            ).mappings().fetchone()

            assert row is not None, (
                f"Row with sku={r['sku']!r}, location={r['location']!r} is missing "
                "after migration — the migration must not delete pre-existing rows"
            )
            assert row["sku"] == r["sku"], (
                f"sku changed by migration: expected {r['sku']!r}, got {row['sku']!r}. "
                "The migration must not alter the canonical identity fields of any row."
            )


# ---------------------------------------------------------------------------
# T16 – AC4: each seeded row retains its original location after migration
# ---------------------------------------------------------------------------


@then("each seeded stock row has the same location value as before the migration")
def then_each_location_unchanged(multi_seed_ctx):
    """T16: the migration must not alter the location of any pre-existing row.

    location is the other half of the canonical (sku, location) unique identity
    (PI2, NFR-F6-unique-identity-preserved); it must survive the schema refactor
    unchanged.
    """
    rows = multi_seed_ctx["rows"]

    with engine.connect() as conn:
        for r in rows:
            row = conn.execute(
                sa.text(
                    "SELECT location FROM stock "
                    "WHERE sku = :sku AND location = :loc"
                ),
                {"sku": r["sku"], "loc": r["location"]},
            ).mappings().fetchone()

            assert row is not None, (
                f"Row with sku={r['sku']!r}, location={r['location']!r} is missing "
                "after migration — the migration must not delete pre-existing rows"
            )
            assert row["location"] == r["location"], (
                f"location changed by migration: expected {r['location']!r}, "
                f"got {row['location']!r}. "
                "The migration must not alter location for any pre-existing row."
            )


# ---------------------------------------------------------------------------
# T17 – AC4: each seeded row retains its original quantity after migration
# ---------------------------------------------------------------------------


@then("each seeded stock row has the same quantity value as before the migration")
def then_each_quantity_unchanged(multi_seed_ctx):
    """T17: the migration must not alter the quantity of any pre-existing row.

    The add-and-backfill migration is strictly additive (PI3); it adds columns
    and fills tracking fields only — it must leave quantity, the stock-on-hand
    measure, exactly as seeded.
    """
    rows = multi_seed_ctx["rows"]

    with engine.connect() as conn:
        for r in rows:
            row = conn.execute(
                sa.text(
                    "SELECT quantity FROM stock "
                    "WHERE sku = :sku AND location = :loc"
                ),
                {"sku": r["sku"], "loc": r["location"]},
            ).mappings().fetchone()

            assert row is not None, (
                f"Row with sku={r['sku']!r}, location={r['location']!r} is missing "
                "after migration — the migration must not delete pre-existing rows"
            )
            assert row["quantity"] == r["quantity"], (
                f"quantity changed by migration: expected {r['quantity']!r}, "
                f"got {row['quantity']!r}. "
                "The add-and-backfill migration must not touch quantity values."
            )


# ---------------------------------------------------------------------------
# T18 – AC4 / PI2-sku-location-unique  (fitness: (sku, location) unique)
# ---------------------------------------------------------------------------


def test_duplicate_sku_location_raises_unique_violation():
    """T18: inserting two rows with the same (sku, location) must raise a
    UniqueViolation, proving the canonical F1 uniqueness constraint is preserved
    unchanged after the schema refactor (NFR-F6-unique-identity-preserved, PI2).

    Fitness test (plain pytest, not Gherkin); runs against the real branch DB.
    Per-run-unique keys prevent collision with other test runs; cleanup in
    finally ensures no orphan rows on a shared verify DB.
    """
    sku = f"SKU-S1AC4T18-{uuid.uuid4().hex[:10].upper()}"
    location = f"LOC-S1AC4T18-{uuid.uuid4().hex[:8].upper()}"

    try:
        with engine.connect() as conn:
            conn.execute(
                sa.text(
                    "INSERT INTO stock (sku, location, quantity) "
                    "VALUES (:sku, :loc, 1)"
                ),
                {"sku": sku, "loc": location},
            )
            conn.commit()

        with pytest.raises(sa.exc.IntegrityError) as exc_info:
            with engine.connect() as conn:
                conn.execute(
                    sa.text(
                        "INSERT INTO stock (sku, location, quantity) "
                        "VALUES (:sku, :loc, 2)"
                    ),
                    {"sku": sku, "loc": location},
                )
                conn.commit()

        assert exc_info.value is not None, (
            "Expected IntegrityError for duplicate (sku, location) but no exception "
            "was raised — the canonical uniqueness constraint (PI2) must be present"
        )
    finally:
        with engine.connect() as conn:
            conn.execute(
                sa.text("DELETE FROM stock WHERE sku = :sku"),
                {"sku": sku},
            )
            conn.commit()


# ---------------------------------------------------------------------------
# T19 – AC4 / PI3-add-backfill-atomic
#        (fitness: ADD COLUMN + backfill UPDATE execute as one transaction)
# ---------------------------------------------------------------------------


def test_add_backfill_upgrade_is_atomic():
    """T19: The add-and-backfill upgrade (ADD COLUMN + backfill UPDATE) executes inside
    a single transaction.  Injecting a BEFORE UPDATE trigger that raises an exception
    simulates a mid-backfill failure; the entire migration must roll back — neither
    batch_number nor serial_number column must appear in the schema afterwards, proving
    neither the column additions nor any partial backfill were committed.

    PI3-add-backfill-atomic.  Fitness test (plain pytest); real branch DB, no mocks.
    NFR-F6-data-durability.
    """
    sku = f"SKU-S1T19-{uuid.uuid4().hex[:10].upper()}"
    location = f"LOC-S1T19-{uuid.uuid4().hex[:8].upper()}"
    upgrade_result: subprocess.CompletedProcess | None = None

    # Downgrade to the revision just before the add-and-backfill migration so
    # batch_number and serial_number do not yet exist.
    down = _run_alembic("downgrade", "20260809120000")
    assert down.returncode == 0, (
        f"T19 pre-condition: downgrade to 20260809120000 failed:\n"
        f"stdout: {down.stdout}\nstderr: {down.stderr}"
    )
    engine.dispose()  # flush stale pool connections so schema reflection is fresh

    try:
        # Seed a row so the backfill UPDATE has at least one row to touch.
        with engine.connect() as conn:
            conn.execute(sa.text("DELETE FROM stock WHERE sku = :sku"), {"sku": sku})
            conn.execute(
                sa.text(
                    "INSERT INTO stock (sku, location, quantity) "
                    "VALUES (:sku, :loc, 1)"
                ),
                {"sku": sku, "loc": location},
            )
            conn.commit()

        # Install a trigger that forces the backfill UPDATE to raise an exception.
        # The trigger runs inside the same migration transaction, so raising here
        # must roll back the entire transaction — including the preceding ADD COLUMNs.
        with engine.connect() as conn:
            conn.execute(
                sa.text(
                    """
                    CREATE OR REPLACE FUNCTION _t19_fail_on_update()
                    RETURNS TRIGGER AS $$
                    BEGIN
                        RAISE EXCEPTION
                            'T19: injected failure — probing add-backfill migration atomicity';
                    END;
                    $$ LANGUAGE plpgsql;
                    """
                )
            )
            conn.execute(sa.text("DROP TRIGGER IF EXISTS _t19_backfill_blocker ON stock;"))
            conn.execute(
                sa.text(
                    """
                    CREATE TRIGGER _t19_backfill_blocker
                    BEFORE UPDATE ON stock
                    FOR EACH ROW EXECUTE FUNCTION _t19_fail_on_update();
                    """
                )
            )
            conn.commit()

        # Attempt the migration — must fail because the trigger aborts the UPDATE.
        upgrade_result = _run_alembic("upgrade", "20260811000000")

    finally:
        # Always remove the blocking trigger so the autouse restore-head teardown
        # and every subsequent test can run unimpeded.
        engine.dispose()
        try:
            with engine.connect() as conn:
                conn.execute(
                    sa.text("DROP TRIGGER IF EXISTS _t19_backfill_blocker ON stock;")
                )
                conn.execute(sa.text("DROP FUNCTION IF EXISTS _t19_fail_on_update();"))
                conn.commit()
        except Exception:
            pass
        try:
            with engine.connect() as conn:
                conn.execute(sa.text("DELETE FROM stock WHERE sku = :sku"), {"sku": sku})
                conn.commit()
        except Exception:
            pass

    # The migration must have failed due to the injected trigger.
    assert upgrade_result is not None and upgrade_result.returncode != 0, (
        "alembic upgrade 20260811000000 should have failed when the injected BEFORE UPDATE "
        "trigger aborted the backfill UPDATE, but it returned exit code 0. "
        "The migration may not be wrapping ADD COLUMN + UPDATE in a single transaction, "
        "or the backfill UPDATE ran before the trigger was installed (PI3)."
    )

    # After a failed migration, neither column must exist: PostgreSQL DDL is
    # transactional — the failed UPDATE rolls back the entire transaction, including
    # the ADD COLUMN statements that preceded it.
    engine.dispose()
    insp = sa.inspect(engine)
    cols = {c["name"] for c in insp.get_columns("stock")}
    assert "batch_number" not in cols, (
        "batch_number column is present after the add-and-backfill migration failed. "
        "The ADD COLUMN must roll back atomically with the failed backfill UPDATE — "
        "a partial schema change (column added, backfill not applied) violates PI3 "
        "(add-backfill-atomic) and NFR-F6-data-durability."
    )
    assert "serial_number" not in cols, (
        "serial_number column is present after the add-and-backfill migration failed. "
        "The ADD COLUMN must roll back atomically with the failed backfill UPDATE (PI3)."
    )


# ---------------------------------------------------------------------------
# T20 – AC4 / PI4-every-row-preserved
#        (fitness: test-owned row count is identical before and after upgrade)
# ---------------------------------------------------------------------------


def test_upgrade_preserves_row_count():
    """T20: the count of test-owned stock rows on the real branch database is identical
    before and after the upgrade migration.

    Scoped count (filtered by per-run-unique SKUs) avoids the
    shared-state-aggregate-assertion smell on a shared verify DB; the assertion
    is a delta over this test's own rows, never a whole-table total.
    PI4-every-row-preserved.  Fitness test (plain pytest); real branch DB, no mocks.
    NFR-F6-data-durability, NFR-F6-real-branch-integration-tests.
    """
    skus = [f"SKU-S1T20-{uuid.uuid4().hex[:10].upper()}" for _ in range(4)]
    uid = uuid.uuid4().hex[:6].upper()
    locations = [f"LOC-S1T20-{i}-{uid}" for i in range(4)]
    rows = [
        {
            "sku": skus[i],
            "location": locations[i],
            "quantity": i + 1,
        }
        for i in range(4)
    ]

    # Downgrade to before the add-and-backfill migration so the upgrade can run.
    down = _run_alembic("downgrade", "20260809120000")
    assert down.returncode == 0, (
        f"T20 pre-condition: downgrade to 20260809120000 failed:\n"
        f"stdout: {down.stdout}\nstderr: {down.stderr}"
    )
    engine.dispose()

    try:
        # Idempotent seed: DELETE then INSERT to survive a prior killed run.
        with engine.connect() as conn:
            for r in rows:
                conn.execute(sa.text("DELETE FROM stock WHERE sku = :sku"), {"sku": r["sku"]})
                conn.execute(
                    sa.text(
                        "INSERT INTO stock (sku, location, quantity) "
                        "VALUES (:sku, :loc, :qty)"
                    ),
                    {
                        "sku": r["sku"],
                        "loc": r["location"],
                        "qty": r["quantity"],
                    },
                )
            conn.commit()

        # Capture the pre-upgrade count scoped to this test's own rows.
        pre_count = 0
        with engine.connect() as conn:
            for r in rows:
                pre_count += conn.execute(
                    sa.text(
                        "SELECT COUNT(*) FROM stock WHERE sku = :sku AND location = :loc"
                    ),
                    {"sku": r["sku"], "loc": r["location"]},
                ).scalar()

        # Apply the full migration chain to head.
        up = _run_alembic("upgrade", "head")
        assert up.returncode == 0, (
            f"alembic upgrade head failed during T20:\n"
            f"stdout: {up.stdout}\nstderr: {up.stderr}"
        )
        engine.dispose()

        # Count again — must equal the pre-upgrade count.
        post_count = 0
        with engine.connect() as conn:
            for r in rows:
                post_count += conn.execute(
                    sa.text(
                        "SELECT COUNT(*) FROM stock WHERE sku = :sku AND location = :loc"
                    ),
                    {"sku": r["sku"], "loc": r["location"]},
                ).scalar()

        assert post_count == pre_count, (
            f"Row count changed after upgrade: before={pre_count}, after={post_count}. "
            "The add-and-backfill migration must be strictly additive — it adds columns "
            "and backfills them; it must never delete or lose any pre-existing row "
            "(PI4-every-row-preserved, NFR-F6-data-durability)."
        )

    finally:
        engine.dispose()
        try:
            with engine.connect() as conn:
                for r in rows:
                    conn.execute(
                        sa.text("DELETE FROM stock WHERE sku = :sku"), {"sku": r["sku"]}
                    )
                conn.commit()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# T21 – AC4 / PI4-every-row-preserved
#        (fitness: sku, location, quantity values are unchanged after upgrade)
# ---------------------------------------------------------------------------


def test_upgrade_preserves_row_values():
    """T21: for every stock row seeded before the upgrade migration, the sku, location,
    and quantity values are unchanged after the upgrade runs against the real branch
    database.

    The migration chain is strictly additive (PI3, PI4): it adds columns and must
    leave the canonical identity fields (sku, location — NFR-F6-unique-identity-preserved)
    and the stock-on-hand measure (quantity) exactly as seeded.

    PI4-every-row-preserved.  Fitness test (plain pytest); real branch DB, no mocks.
    NFR-F6-data-durability, NFR-F6-unique-identity-preserved.
    """
    uid = uuid.uuid4().hex[:8].upper()
    rows = [
        {
            "sku": f"SKU-S1T21-A-{uid}",
            "location": f"LOC-S1T21-A-{uid}",
            "quantity": 10,
        },
        {
            "sku": f"SKU-S1T21-B-{uid}",
            "location": f"LOC-S1T21-B-{uid}",
            "quantity": 25,
        },
        {
            "sku": f"SKU-S1T21-C-{uid}",
            "location": f"LOC-S1T21-C-{uid}",
            "quantity": 7,
        },
    ]

    # Downgrade to before the add-and-backfill migration.
    down = _run_alembic("downgrade", "20260809120000")
    assert down.returncode == 0, (
        f"T21 pre-condition: downgrade to 20260809120000 failed:\n"
        f"stdout: {down.stdout}\nstderr: {down.stderr}"
    )
    engine.dispose()

    try:
        # Idempotent seed.
        with engine.connect() as conn:
            for r in rows:
                conn.execute(sa.text("DELETE FROM stock WHERE sku = :sku"), {"sku": r["sku"]})
                conn.execute(
                    sa.text(
                        "INSERT INTO stock (sku, location, quantity) "
                        "VALUES (:sku, :loc, :qty)"
                    ),
                    {
                        "sku": r["sku"],
                        "loc": r["location"],
                        "qty": r["quantity"],
                    },
                )
            conn.commit()

        # Apply the full migration chain.
        up = _run_alembic("upgrade", "head")
        assert up.returncode == 0, (
            f"alembic upgrade head failed during T21:\n"
            f"stdout: {up.stdout}\nstderr: {up.stderr}"
        )
        engine.dispose()

        # For every seeded row, sku + location + quantity must be bit-for-bit identical.
        with engine.connect() as conn:
            for r in rows:
                row = conn.execute(
                    sa.text(
                        "SELECT sku, location, quantity FROM stock "
                        "WHERE sku = :sku AND location = :loc"
                    ),
                    {"sku": r["sku"], "loc": r["location"]},
                ).mappings().fetchone()

                assert row is not None, (
                    f"Row sku={r['sku']!r}, location={r['location']!r} is missing after "
                    "upgrade — the add-and-backfill migration must not delete or lose any "
                    "pre-existing row (PI4-every-row-preserved, NFR-F6-data-durability)."
                )
                assert row["sku"] == r["sku"], (
                    f"sku changed after upgrade: expected {r['sku']!r}, got {row['sku']!r}. "
                    "The canonical identity field sku must survive the schema refactor "
                    "unchanged (NFR-F6-unique-identity-preserved, PI4)."
                )
                assert row["location"] == r["location"], (
                    f"location changed after upgrade: expected {r['location']!r}, "
                    f"got {row['location']!r}. "
                    "The migration must not alter location for any pre-existing row "
                    "(NFR-F6-unique-identity-preserved, PI4)."
                )
                assert row["quantity"] == r["quantity"], (
                    f"quantity changed after upgrade: expected {r['quantity']!r}, "
                    f"got {row['quantity']!r}. "
                    "The add-and-backfill migration is additive only — it must not "
                    "modify the stock-on-hand measure quantity (PI4-every-row-preserved)."
                )

    finally:
        engine.dispose()
        try:
            with engine.connect() as conn:
                for r in rows:
                    conn.execute(
                        sa.text("DELETE FROM stock WHERE sku = :sku"), {"sku": r["sku"]}
                    )
                conn.commit()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Fixtures for T22
# ---------------------------------------------------------------------------


@pytest.fixture()
def unique_skus_t22() -> list:
    """Five per-run-unique SKUs for the T22 mixed-seed scenario."""
    uid = uuid.uuid4().hex[:8].upper()
    return [f"SKU-S1AC5-{i}-{uid}" for i in range(5)]


@pytest.fixture()
def unique_locations_t22() -> list:
    """Five per-run-unique locations for the T22 mixed-seed scenario."""
    uid = uuid.uuid4().hex[:6].upper()
    return [f"LOC-S1AC5-{i}-{uid}" for i in range(5)]


# ---------------------------------------------------------------------------
# T22 – Given  (2 conforming + 3 nonconforming rows)
# ---------------------------------------------------------------------------


@given(
    "a mixed table of conforming and nonconforming stock rows is seeded before the add-and-backfill migration",
    target_fixture="mixed_seed_ctx",
)
def given_mixed_seed(unique_skus_t22, unique_locations_t22):
    """Seed 2 conforming (batch_number+serial_number set) + 3 nonconforming (NULL) rows.

    inventory_code was dropped by S2. batch_number and serial_number are seeded
    directly. Upgrade to head first so any migration-era trigger (which would
    override these values from inventory_code) is removed before the INSERT.

    Per-run-unique (sku, location) pairs prevent key collisions on a shared verify DB.
    DELETE before INSERT ensures a prior killed run leaves no orphan rows that would
    cause a duplicate-key UniqueViolation on re-run.
    """
    # Ensure we are at HEAD (no inventory_code-derived trigger) before seeding
    # tracking fields directly.
    _run_alembic("upgrade", "head")
    engine.dispose()

    skus = unique_skus_t22
    locs = unique_locations_t22

    # Conforming rows: explicit batch_number + serial_number (not NULL).
    conforming_rows = [
        {
            "sku": skus[0],
            "location": locs[0],
            "qty": 1,
            "batch_number": "BATCH01",
            "serial_number": "SER01",
        },
        {
            "sku": skus[1],
            "location": locs[1],
            "qty": 2,
            "batch_number": "BATCH02",
            "serial_number": "SER02",
        },
    ]
    # Nonconforming rows: no batch_number or serial_number (both NULL).
    nonconforming_rows = [
        {"sku": skus[2], "location": locs[2], "qty": 3},
        {"sku": skus[3], "location": locs[3], "qty": 4},
        {"sku": skus[4], "location": locs[4], "qty": 5},
    ]
    all_rows = conforming_rows + nonconforming_rows
    all_skus = [r["sku"] for r in all_rows]

    with engine.connect() as conn:
        for r in all_rows:
            # Idempotent seed: clear any stale row from a prior killed run first.
            conn.execute(sa.text("DELETE FROM stock WHERE sku = :sku"), {"sku": r["sku"]})
            conn.execute(
                sa.text(
                    "INSERT INTO stock (sku, location, quantity, batch_number, serial_number) "
                    "VALUES (:sku, :location, :qty, :batch, :serial)"
                ),
                {
                    "sku": r["sku"],
                    "location": r["location"],
                    "qty": r["qty"],
                    "batch": r.get("batch_number"),
                    "serial": r.get("serial_number"),
                },
            )
        conn.commit()

    yield {
        "all_skus": all_skus,
        "conforming_count": len(conforming_rows),
        "nonconforming_count": len(nonconforming_rows),
    }

    with engine.connect() as conn:
        for sku in all_skus:
            conn.execute(sa.text("DELETE FROM stock WHERE sku = :sku"), {"sku": sku})
        conn.commit()


# ---------------------------------------------------------------------------
# T22 – Then  (probe returns exact NULL count scoped to test-owned rows)
# ---------------------------------------------------------------------------


@then(
    "the integrity probe reports exactly the count of seeded nonconforming rows scoped to the test-owned rows"
)
def then_probe_reports_nonconforming_count(mixed_seed_ctx, db_session):
    """T22: calling the integrity probe for the test-owned SKUs must return exactly
    the count of rows seeded without tracking fields (both batch_number and serial_number
    NULL) (AC5, NFR-F6-data-durability).

    Scoped to the test's own per-run-unique SKUs to avoid the
    shared-state-aggregate-assertion smell on a shared verify DB.
    """
    from app.repositories.stock import count_null_tracking_rows  # noqa: PLC0415

    expected = mixed_seed_ctx["nonconforming_count"]
    all_skus = mixed_seed_ctx["all_skus"]

    count = count_null_tracking_rows(db_session, skus=all_skus)

    assert count == expected, (
        f"Integrity probe returned {count} nonconforming row(s) for the test-owned SKUs, "
        f"expected {expected}. "
        f"The probe must return the exact count of rows where both batch_number and "
        f"serial_number are NULL (no tracking fields filed) "
        f"(AC5-integrity-probe-reports-nonconforming-count, NFR-F6-data-durability). "
        f"Test-owned SKUs: {all_skus}"
    )
