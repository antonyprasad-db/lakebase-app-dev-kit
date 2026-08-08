"""Step definitions for S1-split-code-migration, run against the real paired
Lakebase branch DB (never a mock). Binds
tests/features/S1-split-code-migration.feature.

This story is Infra-layer and schema-only (architecture.md): the outermost
public boundary IS the migration/storage contract itself, so these steps
exercise the Alembic revision and the stock_records table directly via SQL,
not the HTTP API (which gains no new surface in S1; the split fields surface
in the SPA only in S3-view-batch-and-serial).

Every scenario here mutates schema (it downgrades to the pre-split state,
seeds a row, then runs the migration forward -- or runs the down path) so
every scenario is tagged `@migration`, which pytest-bdd's default tag-to-mark
conversion turns into `@pytest.mark.migration`: the verify runs this suite on
its OWN isolated ephemeral branch, never the shared verify database.
"""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from pytest_bdd import given, parsers, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S1-split-code-migration.feature")

REPO_ROOT = Path(__file__).resolve().parents[2]

_TEST_SKUS = [
    "SKU-F6-101",
    "SKU-F6-102",
    "SKU-F6-103",
    "SKU-F6-104",
    "SKU-F6-105",
    "SKU-F6-106",
    "SKU-F6-107",
    "SKU-F6-108",
]


def _alembic_config() -> Config:
    return Config(str(REPO_ROOT / "alembic.ini"))


def _existing_columns(db_session) -> set:
    return {
        row[0]
        for row in db_session.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'stock_records'"
            )
        )
    }


def _ensure_pre_split_schema(db_session) -> None:
    """Make sure we're at the schema state BEFORE the split migration (still
    carrying inventory_code, no batch_number/serial_number) so seeding a row
    and then running "the migration runs" step exercises the real up
    transform, never a no-op. Idempotent: a second call within the same
    scenario finds the columns already gone and does nothing."""
    if "batch_number" in _existing_columns(db_session) or "serial_number" in _existing_columns(
        db_session
    ):
        command.downgrade(_alembic_config(), "-1")


def _delete_test_rows(db_session) -> None:
    try:
        for sku in _TEST_SKUS:
            db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        db_session.commit()
    except Exception:
        db_session.rollback()


@pytest.fixture(autouse=True)
def _clean_stock_records(db_session):
    _delete_test_rows(db_session)
    yield
    _delete_test_rows(db_session)


# -- Given -------------------------------------------------------------------


@given(
    parsers.parse(
        'a stock row exists with sku "{sku}", location "{location}", and inventory_code "{code}"'
    )
)
def a_stock_row_exists(db_session, sku, location, code):
    _ensure_pre_split_schema(db_session)
    try:
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :quantity, :inventory_code)"
            ),
            {"sku": sku, "location": location, "quantity": 1, "inventory_code": code},
        )
        db_session.commit()
    except Exception:
        db_session.rollback()
        raise


@given(
    parsers.parse(
        "the split-tracking-code migration has already run and a row exists with "
        'sku "{sku}", location "{location}", batch_number "{batch_number}", and '
        'serial_number "{serial_number}"'
    )
)
def the_migration_has_already_run_and_a_split_row_exists(
    db_session, sku, location, batch_number, serial_number
):
    command.upgrade(_alembic_config(), "head")
    try:
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
                "VALUES (:sku, :location, :quantity, :batch_number, :serial_number)"
            ),
            {
                "sku": sku,
                "location": location,
                "quantity": 1,
                "batch_number": batch_number,
                "serial_number": serial_number,
            },
        )
        db_session.commit()
    except Exception:
        db_session.rollback()
        raise


# -- When ----------------------------------------------------------------------


@when("the split-tracking-code migration runs")
def the_migration_runs():
    command.upgrade(_alembic_config(), "head")


@when("the down migration is applied")
def the_down_migration_is_applied():
    command.downgrade(_alembic_config(), "-1")


# -- Then ------------------------------------------------------------------


@then(
    parsers.parse(
        'the row for sku "{sku}" at location "{location}" has batch_number '
        '"{batch_number}" and serial_number "{serial_number}"'
    )
)
def the_row_has_batch_and_serial(db_session, sku, location, batch_number, serial_number):
    row = db_session.execute(
        text(
            "SELECT batch_number, serial_number FROM stock_records "
            "WHERE sku = :sku AND location = :location"
        ),
        {"sku": sku, "location": location},
    ).fetchone()
    assert row is not None, f"no row found for sku={sku!r} location={location!r}"
    assert row[0] == batch_number, row
    assert row[1] == serial_number, row


@then(
    parsers.parse(
        'the row for sku "{sku}" at location "{location}" has batch_number and '
        "serial_number both NULL"
    )
)
def the_row_has_null_batch_and_serial(db_session, sku, location):
    row = db_session.execute(
        text(
            "SELECT batch_number, serial_number FROM stock_records "
            "WHERE sku = :sku AND location = :location"
        ),
        {"sku": sku, "location": location},
    ).fetchone()
    assert row is not None, f"no row found for sku={sku!r} location={location!r}"
    assert row[0] is None, f"batch_number must be NULL for a nonconforming code, got {row[0]!r}"
    assert row[1] is None, f"serial_number must be NULL for a nonconforming code, got {row[1]!r}"


@then(parsers.parse('the row for sku "{sku}" still has location "{location}" exactly as before'))
def the_row_still_has_location(db_session, sku, location):
    row = db_session.execute(
        text("SELECT location FROM stock_records WHERE sku = :sku"),
        {"sku": sku},
    ).fetchone()
    assert row is not None, f"no row found for sku={sku!r}"
    assert row[0] == location, (
        f"location must be byte-for-byte unchanged by the migration; expected "
        f"{location!r}, got {row[0]!r}"
    )


@then("the stock_records table no longer has an inventory_code column")
def the_table_no_longer_has_inventory_code(db_session):
    columns = _existing_columns(db_session)
    assert "inventory_code" not in columns, (
        f"inventory_code must be retired from stock_records; found columns {columns!r}"
    )


@then(
    parsers.parse(
        'the post-migration row set for skus "{sku1}" and "{sku2}" matches the '
        "pre-migration set one-for-one, with no row dropped or duplicated"
    )
)
def the_row_set_matches_one_for_one(db_session, sku1, sku2):
    for sku in (sku1, sku2):
        count = db_session.execute(
            text("SELECT COUNT(*) FROM stock_records WHERE sku = :sku"),
            {"sku": sku},
        ).scalar()
        assert count == 1, f"expected exactly one surviving row for sku={sku!r}, found {count}"


@then(parsers.parse('the row for sku "{sku}" has inventory_code "{inventory_code}"'))
def the_row_has_inventory_code(db_session, sku, inventory_code):
    row = db_session.execute(
        text("SELECT inventory_code FROM stock_records WHERE sku = :sku"),
        {"sku": sku},
    ).fetchone()
    assert row is not None, f"no row found for sku={sku!r}"
    assert row[0] == inventory_code, (
        f"expected reconstructed inventory_code {inventory_code!r}, got {row[0]!r}"
    )
