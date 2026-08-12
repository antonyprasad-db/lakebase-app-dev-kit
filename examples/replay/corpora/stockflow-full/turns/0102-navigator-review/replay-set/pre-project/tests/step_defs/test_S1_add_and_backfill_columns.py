"""pytest-bdd step definitions for S1-add-and-backfill-columns.feature.

T1 – AC1: batch_number and serial_number are separately addressable columns after migration.
T2 – AC1: location and inventory_code remain present and unchanged after migration.
T7 – AC2: backfill sets batch_number to the second hyphen-delimited segment (conforming code).
T8 – AC2: backfill sets serial_number to the third hyphen-delimited segment (conforming code).
T9 – AC3: backfill leaves batch_number NULL when inventory_code has fewer than three segments.
T10 – AC3: backfill leaves serial_number NULL when inventory_code has fewer than three segments.
T11 – AC3: nonconforming stock row is still present in the table with its sku unchanged.
T12 – AC3 / PI1-batch-serial-nullable: inserting with batch_number=NULL and serial_number=NULL
      succeeds without a constraint violation (fitness test, plain pytest).
T13 – AC3 / PI1-batch-serial-nullable: inserting with sku=NULL raises a NOT NULL constraint
      violation (fitness test, plain pytest).
T14 – AC4: the count of test-owned seeded rows is identical before and after the upgrade.
T15 – AC4: each seeded stock row retains its original sku value after the upgrade.

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
    """Seed a stock row whose inventory_code matches <location>-<batch>-<serial>."""
    sku = unique_sku_t7t8
    location = unique_location_t7t8
    batch_segment = "BATCH77"
    serial_segment = "SER088"
    inventory_code = f"{location}-{batch_segment}-{serial_segment}"
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
    yield {
        "sku": sku,
        "location": location,
        "inventory_code": inventory_code,
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
    """T7: after migration backfill, batch_number must equal the second '-' segment."""
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
        f"batch_number backfill incorrect: expected {expected!r}, got {row['batch_number']!r}. "
        f"inventory_code was {conforming_ctx['inventory_code']!r}"
    )


# ---------------------------------------------------------------------------
# T8 – Then  (serial_number equals the third hyphen segment)
# ---------------------------------------------------------------------------


@then("the seeded row has serial_number equal to the serial segment of its inventory_code")
def then_serial_number_matches_serial_segment(conforming_ctx):
    """T8: after migration backfill, serial_number must equal the third '-' segment."""
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
        f"serial_number backfill incorrect: expected {expected!r}, got {row['serial_number']!r}. "
        f"inventory_code was {conforming_ctx['inventory_code']!r}"
    )


# ---------------------------------------------------------------------------
# T9 – Given / Then  (nonconforming code leaves batch_number NULL)
# ---------------------------------------------------------------------------


@given(
    "a stock row with a nonconforming two-segment inventory_code is seeded before the add-and-backfill migration",
    target_fixture="nonconforming_ctx",
)
def given_nonconforming_code_seeded(unique_sku_t9, unique_location_t9):
    """Seed a stock row whose inventory_code has only two hyphen-delimited segments
    (i.e. only one '-'), which does not satisfy the <location>-<batch>-<serial> pattern."""
    sku = unique_sku_t9
    location = unique_location_t9
    # Two segments only: no second '-' after stripping the location prefix.
    inventory_code = f"{location}-ONLYBATCH"
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
    with engine.connect() as conn:
        conn.execute(
            sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
            {"sku": sku, "loc": location},
        )
        conn.commit()


@then("the seeded row has batch_number left NULL")
def then_batch_number_is_null(nonconforming_ctx):
    """T9: a nonconforming inventory_code must leave batch_number NULL — not guessed or dropped."""
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
        f"batch_number should be NULL for nonconforming inventory_code "
        f"{nonconforming_ctx['inventory_code']!r}, got {row['batch_number']!r}"
    )


# ---------------------------------------------------------------------------
# T10 – Then  (serial_number left NULL for nonconforming code)
# ---------------------------------------------------------------------------


@then("the seeded row has serial_number left NULL")
def then_serial_number_is_null(nonconforming_ctx):
    """T10: a nonconforming inventory_code must leave serial_number NULL — not guessed or dropped."""
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
        f"serial_number should be NULL for nonconforming inventory_code "
        f"{nonconforming_ctx['inventory_code']!r}, got {row['serial_number']!r}"
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
        "the migration must not drop rows whose inventory_code is nonconforming"
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
            "inventory_code": f"{locations[i]}-BATCH{i:02d}-SER{i:02d}",
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
                    "INSERT INTO stock (sku, location, quantity, inventory_code) "
                    "VALUES (:sku, :location, :qty, :code)"
                ),
                {
                    "sku": r["sku"],
                    "location": r["location"],
                    "qty": r["quantity"],
                    "code": r["inventory_code"],
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
