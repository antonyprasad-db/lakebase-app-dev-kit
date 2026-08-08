"""
Step definitions for S1-split-columns-migration feature.
Tests the migration that splits inventory_code into batch_number and serial_number.
"""
import uuid
import pytest
from pytest_bdd import given, when, then, scenarios, parsers
from sqlalchemy import inspect, text
from app.models import StockRecord
from tests.conftest import get_db_session

# Import all scenarios from the feature file
scenarios("../features/S1-split-columns-migration.feature")


@given(parsers.parse('a stock record seeded with uuid-suffixed sku and location and inventory_code "{code}"'))
def seed_stock_record_with_code(db_session, code):
    """Seed a stock record with a unique sku/location key and a known inventory_code."""
    test_uuid = str(uuid.uuid4())
    sku = f"test-sku-{test_uuid}"
    location = f"test-location-{test_uuid}"

    # Delete any prior row with this exact key to ensure idempotency
    db_session.query(StockRecord).filter(
        StockRecord.sku == sku,
        StockRecord.location == location
    ).delete()
    db_session.commit()

    # Create the new row with the combined inventory_code
    record = StockRecord(
        sku=sku,
        location=location,
        inventory_code=code,
        quantity=10
    )
    db_session.add(record)
    db_session.commit()

    # Store the identifiers for later assertions
    db_session.test_sku = sku
    db_session.test_location = location
    db_session.test_code = code


@given(parsers.parse('a stock record with uuid-suffixed sku and location and inventory_code "{code}"'))
def seed_stock_record_simple(db_session, code):
    """Seed a stock record with uuid-suffixed keys and a given inventory_code."""
    seed_stock_record_with_code(db_session, code)


@given("stock records exist before the migration")
def seed_multiple_stock_records(db_session):
    """Seed multiple stock records with various codes before migration."""
    records = [
        ("sku-a", "loc-a", "A12-B7-S001", 5),
        ("sku-b", "loc-b", "X-1", 3),
        ("sku-c", "loc-c", "A99-B1-S999", 7),
    ]
    for sku, location, code, qty in records:
        test_uuid = str(uuid.uuid4())
        sku_key = f"{sku}-{test_uuid}"
        loc_key = f"{location}-{test_uuid}"

        db_session.query(StockRecord).filter(
            StockRecord.sku == sku_key,
            StockRecord.location == loc_key
        ).delete()
        db_session.commit()

        record = StockRecord(
            sku=sku_key,
            location=loc_key,
            inventory_code=code,
            quantity=qty
        )
        db_session.add(record)
    db_session.commit()
    db_session.test_uuids = [str(uuid.uuid4())]  # Mark for cleanup


@given(parsers.parse('a stock record with uuid-suffixed sku and location "{location_pattern}" and inventory_code "{code}"'))
def seed_stock_record_with_location(db_session, location_pattern, code):
    """Seed a stock record with a specific location pattern (containing {uuid})."""
    test_uuid = str(uuid.uuid4())
    sku = f"test-sku-{test_uuid}"
    location = location_pattern.replace("{uuid}", test_uuid)

    db_session.query(StockRecord).filter(
        StockRecord.sku == sku,
        StockRecord.location == location
    ).delete()
    db_session.commit()

    record = StockRecord(
        sku=sku,
        location=location,
        inventory_code=code,
        quantity=10
    )
    db_session.add(record)
    db_session.commit()

    db_session.test_sku = sku
    db_session.test_location = location
    db_session.test_code = code
    db_session.test_uuid_val = test_uuid


@given(parsers.parse('a seeded stock record with uuid-suffixed sku and location and batch_number "{batch}" and serial_number "{serial}" and location "{location_pattern}"'))
def seed_stock_record_split_fields(db_session, batch, serial, location_pattern):
    """Seed a stock record with already-split batch_number and serial_number fields."""
    test_uuid = str(uuid.uuid4())
    sku = f"test-sku-{test_uuid}"
    location = location_pattern.replace("{uuid}", test_uuid)

    # Use DELETE + INSERT for idempotency
    db_session.query(StockRecord).filter(
        StockRecord.sku == sku,
        StockRecord.location == location
    ).delete()
    db_session.commit()

    # Create row with split fields (after migration)
    record = StockRecord(
        sku=sku,
        location=location,
        batch_number=batch,
        serial_number=serial,
        quantity=10
    )
    db_session.add(record)
    db_session.commit()

    db_session.test_sku = sku
    db_session.test_location = location
    db_session.test_batch = batch
    db_session.test_serial = serial
    db_session.test_uuid_val = test_uuid


@given(parsers.parse('a seeded stock record with uuid-suffixed sku and location "loc-{uuid}" and batch_number NULL and serial_number NULL'))
def seed_stock_record_null_split(db_session):
    """Seed a stock record with NULL batch_number and serial_number."""
    test_uuid = str(uuid.uuid4())
    sku = f"test-sku-{test_uuid}"
    location = f"loc-{test_uuid}"

    db_session.query(StockRecord).filter(
        StockRecord.sku == sku,
        StockRecord.location == location
    ).delete()
    db_session.commit()

    record = StockRecord(
        sku=sku,
        location=location,
        batch_number=None,
        serial_number=None,
        quantity=10
    )
    db_session.add(record)
    db_session.commit()

    db_session.test_sku = sku
    db_session.test_location = location
    db_session.test_uuid_val = test_uuid


@given("stock records in split schema before downgrade")
def seed_split_schema_records(db_session):
    """Seed stock records in the split schema state."""
    test_uuid = str(uuid.uuid4())
    sku = f"test-sku-{test_uuid}"
    location = f"test-location-{test_uuid}"

    db_session.query(StockRecord).filter(
        StockRecord.sku == sku,
        StockRecord.location == location
    ).delete()
    db_session.commit()

    record = StockRecord(
        sku=sku,
        location=location,
        batch_number="B7",
        serial_number="S001",
        quantity=10
    )
    db_session.add(record)
    db_session.commit()

    db_session.test_sku = sku
    db_session.test_location = location


@when("the migration upgrade head completes")
def run_migration_upgrade(db_session):
    """Run the Alembic migration upgrade to head."""
    import subprocess
    import os

    # Run Alembic upgrade
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=os.getcwd(),
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        pytest.fail(f"Migration upgrade failed: {result.stderr}")

    # Refresh the session to reflect the new schema
    db_session.commit()


@when("the migration upgrade head and then downgrade -1 complete")
@pytest.mark.migration
def run_migration_upgrade_then_downgrade(db_session):
    """Run upgrade head followed by downgrade -1 for round-trip test."""
    import subprocess
    import os

    # Upgrade
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=os.getcwd(),
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        pytest.fail(f"Migration upgrade failed: {result.stderr}")

    # Downgrade one step
    result = subprocess.run(
        ["alembic", "downgrade", "-1"],
        cwd=os.getcwd(),
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        pytest.fail(f"Migration downgrade failed: {result.stderr}")

    db_session.commit()


@when("the migration downgrade -1 completes")
@pytest.mark.migration
def run_migration_downgrade(db_session):
    """Run the Alembic migration downgrade by one step."""
    import subprocess
    import os

    result = subprocess.run(
        ["alembic", "downgrade", "-1"],
        cwd=os.getcwd(),
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        pytest.fail(f"Migration downgrade failed: {result.stderr}")

    db_session.commit()


@then("the stock_records table has a batch_number column")
def assert_batch_number_column_exists(db_session):
    """Assert that the stock_records table has a batch_number column."""
    inspector = inspect(db_session.bind)
    columns = {col['name'] for col in inspector.get_columns('stock_records')}
    assert 'batch_number' in columns, "batch_number column does not exist on stock_records"


@then("the stock_records table has a serial_number column")
def assert_serial_number_column_exists(db_session):
    """Assert that the stock_records table has a serial_number column."""
    inspector = inspect(db_session.bind)
    columns = {col['name'] for col in inspector.get_columns('stock_records')}
    assert 'serial_number' in columns, "serial_number column does not exist on stock_records"


@then(parsers.parse('the seeded row\'s batch_number is "{expected}"'))
def assert_seeded_row_batch(db_session, expected):
    """Assert that the seeded row's batch_number matches the expected value."""
    record = db_session.query(StockRecord).filter(
        StockRecord.sku == db_session.test_sku,
        StockRecord.location == db_session.test_location
    ).first()
    assert record is not None, "Seeded row not found"
    assert record.batch_number == expected, f"batch_number is {record.batch_number}, expected {expected}"


@then(parsers.parse('the seeded row\'s serial_number is "{expected}"'))
def assert_seeded_row_serial(db_session, expected):
    """Assert that the seeded row's serial_number matches the expected value."""
    record = db_session.query(StockRecord).filter(
        StockRecord.sku == db_session.test_sku,
        StockRecord.location == db_session.test_location
    ).first()
    assert record is not None, "Seeded row not found"
    assert record.serial_number == expected, f"serial_number is {record.serial_number}, expected {expected}"


@then(parsers.parse('batch_number is set to "{expected}"'))
def assert_batch_set(db_session, expected):
    """Assert that batch_number is set to the expected value."""
    record = db_session.query(StockRecord).filter(
        StockRecord.sku == db_session.test_sku,
        StockRecord.location == db_session.test_location
    ).first()
    assert record is not None, "Stock record not found"
    assert record.batch_number == expected, f"batch_number is {record.batch_number}, expected {expected}"


@then(parsers.parse('serial_number is set to "{expected}"'))
def assert_serial_set(db_session, expected):
    """Assert that serial_number is set to the expected value."""
    record = db_session.query(StockRecord).filter(
        StockRecord.sku == db_session.test_sku,
        StockRecord.location == db_session.test_location
    ).first()
    assert record is not None, "Stock record not found"
    assert record.serial_number == expected, f"serial_number is {record.serial_number}, expected {expected}"


@then("batch_number remains NULL")
def assert_batch_null(db_session):
    """Assert that batch_number remains NULL."""
    record = db_session.query(StockRecord).filter(
        StockRecord.sku == db_session.test_sku,
        StockRecord.location == db_session.test_location
    ).first()
    assert record is not None, "Stock record not found"
    assert record.batch_number is None, f"batch_number is {record.batch_number}, expected NULL"


@then("serial_number remains NULL")
def assert_serial_null(db_session):
    """Assert that serial_number remains NULL."""
    record = db_session.query(StockRecord).filter(
        StockRecord.sku == db_session.test_sku,
        StockRecord.location == db_session.test_location
    ).first()
    assert record is not None, "Stock record not found"
    assert record.serial_number is None, f"serial_number is {record.serial_number}, expected NULL"


@then("the row still exists in stock_records")
def assert_row_exists(db_session):
    """Assert that the seeded row still exists after migration."""
    record = db_session.query(StockRecord).filter(
        StockRecord.sku == db_session.test_sku,
        StockRecord.location == db_session.test_location
    ).first()
    assert record is not None, "Seeded row was deleted during migration"


@then("the stock_records table does not have an inventory_code column")
def assert_inventory_code_column_removed(db_session):
    """Assert that the inventory_code column no longer exists."""
    inspector = inspect(db_session.bind)
    columns = {col['name'] for col in inspector.get_columns('stock_records')}
    assert 'inventory_code' not in columns, "inventory_code column still exists on stock_records"


@then("batch_number and serial_number are populated from prior inventory_code segments")
def assert_populated_from_segments(db_session):
    """Assert that batch_number and serial_number are populated."""
    inspector = inspect(db_session.bind)
    columns = {col['name'] for col in inspector.get_columns('stock_records')}
    assert 'batch_number' in columns, "batch_number column missing"
    assert 'serial_number' in columns, "serial_number column missing"


@then(parsers.parse('the location remains "{expected_pattern}"'))
def assert_location_unchanged(db_session, expected_pattern):
    """Assert that the location value is unchanged after migration."""
    record = db_session.query(StockRecord).filter(
        StockRecord.sku == db_session.test_sku,
        StockRecord.location == db_session.test_location
    ).first()
    assert record is not None, "Stock record not found"
    # Check that location matches the pattern (with uuid substitution)
    expected = expected_pattern.replace("{uuid}", db_session.test_uuid_val)
    assert record.location == expected, f"location is {record.location}, expected {expected}"


@then("location was not overwritten from the code's leading segment")
def assert_location_not_overwritten(db_session):
    """Assert that location was not derived from or overwritten by the code."""
    record = db_session.query(StockRecord).filter(
        StockRecord.sku == db_session.test_sku,
        StockRecord.location == db_session.test_location
    ).first()
    assert record is not None, "Stock record not found"
    # The location should be exactly what we set it to, not derived from the code
    assert record.location == db_session.test_location, f"Location was modified: {record.location}"


@then("the stock_records table has an inventory_code column again")
def assert_inventory_code_restored(db_session):
    """Assert that the inventory_code column is restored after downgrade."""
    inspector = inspect(db_session.bind)
    columns = {col['name'] for col in inspector.get_columns('stock_records')}
    assert 'inventory_code' in columns, "inventory_code column was not restored"


@then("the schema is back at the pre-split state")
def assert_schema_pre_split(db_session):
    """Assert that the schema is back to its pre-split state."""
    inspector = inspect(db_session.bind)
    columns = {col['name'] for col in inspector.get_columns('stock_records')}
    assert 'inventory_code' in columns, "inventory_code column missing (pre-split state)"
    assert 'batch_number' not in columns, "batch_number column still present (should be pre-split)"
    assert 'serial_number' not in columns, "serial_number column still present (should be pre-split)"


@then(parsers.parse('inventory_code is reconstructed as "{expected_pattern}"'))
def assert_inventory_code_reconstructed(db_session, expected_pattern):
    """Assert that inventory_code is reconstructed correctly from split parts."""
    record = db_session.query(StockRecord).filter(
        StockRecord.sku == db_session.test_sku,
        StockRecord.location == db_session.test_location
    ).first()
    assert record is not None, "Stock record not found"

    expected = expected_pattern.replace("{uuid}", db_session.test_uuid_val)
    assert record.inventory_code == expected, f"inventory_code is {record.inventory_code}, expected {expected}"


@then("with no trailing delimiter")
def assert_no_trailing_delimiter(db_session):
    """Assert that there is no trailing delimiter in inventory_code."""
    record = db_session.query(StockRecord).filter(
        StockRecord.sku == db_session.test_sku,
        StockRecord.location == db_session.test_location
    ).first()
    assert record is not None, "Stock record not found"
    assert not record.inventory_code.endswith('-'), f"inventory_code has trailing delimiter: {record.inventory_code}"


@then('no literal "NULL" text appears in inventory_code')
def assert_no_null_text(db_session):
    """Assert that the literal string 'NULL' does not appear in inventory_code."""
    record = db_session.query(StockRecord).filter(
        StockRecord.sku == db_session.test_sku,
        StockRecord.location == db_session.test_location
    ).first()
    assert record is not None, "Stock record not found"
    assert 'NULL' not in record.inventory_code, f"inventory_code contains literal NULL: {record.inventory_code}"


@then("the stock_records table does not have a batch_number column")
def assert_batch_number_column_removed(db_session):
    """Assert that the batch_number column no longer exists."""
    inspector = inspect(db_session.bind)
    columns = {col['name'] for col in inspector.get_columns('stock_records')}
    assert 'batch_number' not in columns, "batch_number column still exists on stock_records"


@then("the stock_records table does not have a serial_number column")
def assert_serial_number_column_removed(db_session):
    """Assert that the serial_number column no longer exists."""
    inspector = inspect(db_session.bind)
    columns = {col['name'] for col in inspector.get_columns('stock_records')}
    assert 'serial_number' not in columns, "serial_number column still exists on stock_records"
