"""Step definitions for S2-integrity-probe, run against the real paired
Lakebase branch DB (never a mock). Binds tests/features/S2-integrity-probe.feature.

Per architecture: an Infra-layer contract on the post-migration data-store
shape, verified directly against the repository/service layers, not a UI or
HTTP flow (architectural_notes on AC1/AC2/AC3). Rows are seeded with direct
SQL (like the persistence-invariant fitness tests) so NULL segments are under
full test control; the probe itself is exercised by calling
StockService.count_nonconforming_rows() directly against a real db_session.
"""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from pytest_bdd import scenarios, given, when, then, parsers

from app.repositories.stock_repository import StockRepository
from app.services.stock_service import StockService

scenarios("../features/S2-integrity-probe.feature")

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

_TEST_SKUS = [
    "SKU-F6-P200",
    "SKU-F6-P201",
    "SKU-F6-P210",
    "SKU-F6-P211",
    "SKU-F6-P212",
    "SKU-F6-P220",
    "SKU-F6-P221",
]


def _alembic_config() -> Config:
    return Config(str(REPO_ROOT / "alembic.ini"))


def _delete_test_rows(db_session):
    try:
        for sku in _TEST_SKUS:
            db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        db_session.commit()
    except Exception:
        db_session.rollback()


@pytest.fixture(autouse=True)
def _clean_integrity_probe_rows(db_session):
    command.upgrade(_alembic_config(), "head")
    _delete_test_rows(db_session)
    # Capture baseline after cleanup but before Given steps insert rows
    service = StockService(StockRepository(db_session))
    baseline = service.count_nonconforming_rows()
    yield baseline
    _delete_test_rows(db_session)


@pytest.fixture
def baseline_nonconforming_count(_clean_integrity_probe_rows):
    return _clean_integrity_probe_rows


# ── Given ────────────────────────────────────────────────────────────────


@given(
    parsers.parse(
        'a stock row exists with sku "{sku}", location "{location}", '
        'batch_number "{batch_number}", and serial_number "{serial_number}"'
    )
)
def a_stock_row_exists_conforming(db_session, sku, location, batch_number, serial_number):
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


@given(
    parsers.parse(
        'a stock row exists with sku "{sku}", location "{location}", '
        "with no batch_number and no serial_number"
    )
)
def a_stock_row_exists_fully_nonconforming(db_session, sku, location):
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :location, :quantity, NULL, NULL)"
        ),
        {"sku": sku, "location": location, "quantity": 1},
    )
    db_session.commit()


@given(
    parsers.parse(
        'a stock row exists with sku "{sku}", location "{location}", '
        'batch_number "{batch_number}", and no serial_number'
    )
)
def a_stock_row_exists_partially_split(db_session, sku, location, batch_number):
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :location, :quantity, :batch_number, NULL)"
        ),
        {"sku": sku, "location": location, "quantity": 1, "batch_number": batch_number},
    )
    db_session.commit()


# ── When ─────────────────────────────────────────────────────────────────


@when(
    "the integrity probe runs against the migrated stock data",
    target_fixture="nonconforming_count",
)
def the_integrity_probe_runs(db_session):
    service = StockService(StockRepository(db_session))
    return service.count_nonconforming_rows()


# ── Then ─────────────────────────────────────────────────────────────────


@then(parsers.parse("the integrity probe reports a nonconforming count of {count:d}"))
def the_probe_reports_a_nonconforming_count(nonconforming_count, count, baseline_nonconforming_count):
    assert nonconforming_count is not None, (
        "the integrity probe must report an explicit integer count, never "
        "None/missing, so a clean result gives positive confirmation"
    )
    delta = nonconforming_count - baseline_nonconforming_count
    assert delta == count, (
        f"expected a nonconforming count delta of {count}, got {delta} "
        f"(baseline: {baseline_nonconforming_count}, actual: {nonconforming_count})"
    )
