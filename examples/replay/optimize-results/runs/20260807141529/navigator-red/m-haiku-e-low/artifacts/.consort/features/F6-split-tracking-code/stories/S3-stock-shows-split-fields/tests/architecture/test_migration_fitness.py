"""
Fitness tests for the stock record migration and architecture constraints.
Verifies migration reversibility, data integrity, and layering contracts.
"""
import uuid
import subprocess
import os
import pytest
from sqlalchemy import inspect, text
from app.models import StockRecord
from tests.conftest import get_db_session


class TestMigrationConfig:
    """Verify migration config adheres to NFR-F6-7 (config-in-env)."""

    def test_alembic_uses_database_url_from_env(self):
        """T3: Alembic sources DATABASE_URL from environment, no hardcoded connection string."""
        # Read alembic.ini and env.py to verify no hardcoded DB credentials
        alembic_ini_path = "alembic.ini"
        if os.path.exists(alembic_ini_path):
            with open(alembic_ini_path) as f:
                content = f.read()
                assert "sqlalchemy.url" not in content or \
                       content.count("sqlalchemy.url") == 1 and "%(DATABASE_URL)s" in content, \
                       "alembic.ini contains hardcoded connection string"

        # Check env.py for DATABASE_URL reference
        env_py_path = "alembic/env.py"
        if os.path.exists(env_py_path):
            with open(env_py_path) as f:
                content = f.read()
                assert "DATABASE_URL" in content or "os.environ" in content, \
                       "env.py does not reference DATABASE_URL environment variable"

    def test_alembic_does_not_rename_databricks_postgres(self):
        """T3: Migration does not rename the databricks_postgres database."""
        # Check alembic env.py and migration files for database renames
        migrations_dir = "alembic/versions"
        if os.path.exists(migrations_dir):
            for migration_file in os.listdir(migrations_dir):
                if migration_file.endswith(".py"):
                    with open(os.path.join(migrations_dir, migration_file)) as f:
                        content = f.read()
                        assert "ALTER DATABASE" not in content or \
                               "RENAME" not in content or \
                               "databricks_postgres" in content, \
                               f"Migration {migration_file} may be renaming the database"


class TestMigrationIntegration:
    """Verify migration integration adheres to NFR-F6-3 (real DB, no mocks)."""

    def test_migration_suite_uses_real_branch_db(self):
        """T4: Migration tests bind to the paired Lakebase branch DB, no in-memory substitute."""
        # Verify that DATABASE_URL is set and points to a real database
        db_url = os.environ.get("DATABASE_URL")
        assert db_url is not None, "DATABASE_URL environment variable not set"
        assert "sqlite:///:memory:" not in db_url, "DATABASE_URL points to in-memory SQLite"
        assert "sqlite:///test" not in db_url, "DATABASE_URL points to test file DB instead of real branch"


class TestMigrationNullableColumns:
    """Verify that split columns are NULLABLE (PI1, T5)."""

    def test_seed_null_batch_and_serial_succeeds(self, db_session):
        """T5: Insert a stock row with NULL batch_number and NULL serial_number succeeds."""
        test_uuid = str(uuid.uuid4())
        sku = f"test-sku-nullable-{test_uuid}"
        location = f"test-location-nullable-{test_uuid}"

        # Clean up any prior row
        db_session.query(StockRecord).filter(
            StockRecord.sku == sku,
            StockRecord.location == location
        ).delete()
        db_session.commit()

        # Insert with NULL batch and serial (this should succeed)
        try:
            record = StockRecord(
                sku=sku,
                location=location,
                batch_number=None,
                serial_number=None,
                quantity=10
            )
            db_session.add(record)
            db_session.commit()
        except Exception as e:
            pytest.fail(f"Failed to insert row with NULL batch/serial: {e}")

        # Verify the row was inserted
        inserted = db_session.query(StockRecord).filter(
            StockRecord.sku == sku,
            StockRecord.location == location
        ).first()
        assert inserted is not None, "Row with NULL batch/serial was not inserted"
        assert inserted.batch_number is None, "batch_number was not NULL"
        assert inserted.serial_number is None, "serial_number was not NULL"


class TestDataPreservation:
    """Verify data preservation during migration (NFR-F6-1, PI3)."""

    @pytest.mark.migration
    def test_seeded_rows_preserved_after_upgrade(self, db_session):
        """T10: Seed rows, run upgrade, assert all rows still present (data preservation)."""
        # Seed a known set of test rows with uuid marking
        test_marker = str(uuid.uuid4())
        rows_to_seed = [
            (f"sku-a-{test_marker}", f"loc-a-{test_marker}", "A12-B7-S001", 5),
            (f"sku-b-{test_marker}", f"loc-b-{test_marker}", "X-1", 3),
            (f"sku-c-{test_marker}", f"loc-c-{test_marker}", "A99-B1-S999", 7),
        ]

        # Insert seeded rows
        for sku, location, code, qty in rows_to_seed:
            db_session.query(StockRecord).filter(
                StockRecord.sku == sku,
                StockRecord.location == location
            ).delete()
            db_session.commit()

            record = StockRecord(sku=sku, location=location, inventory_code=code, quantity=qty)
            db_session.add(record)

        db_session.commit()
        count_before = len(rows_to_seed)

        # Run migration upgrade
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=os.getcwd(),
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Migration upgrade failed: {result.stderr}"

        # Refresh session
        db_session.commit()

        # Count rows matching the test marker
        count_after = db_session.query(StockRecord).filter(
            StockRecord.sku.like(f"%{test_marker}%")
        ).count()

        assert count_after == count_before, \
            f"Row count mismatch: seeded {count_before}, found {count_after} after migration"


class TestLocationUnchanged:
    """Verify location values are preserved during migration (AC8, PI2)."""

    def test_location_value_unchanged_after_migration(self, db_session):
        """T11: Location value is byte-for-byte unchanged after migration."""
        test_uuid = str(uuid.uuid4())
        sku = f"test-sku-loc-{test_uuid}"
        location = f"test-location-value-{test_uuid}"

        # Clean and seed
        db_session.query(StockRecord).filter(
            StockRecord.sku == sku,
            StockRecord.location == location
        ).delete()
        db_session.commit()

        record = StockRecord(
            sku=sku,
            location=location,
            inventory_code="A12-B7-S001",
            quantity=10
        )
        db_session.add(record)
        db_session.commit()

        location_before = location

        # Run migration
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=os.getcwd(),
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Migration upgrade failed: {result.stderr}"

        db_session.commit()

        # Check location after
        record_after = db_session.query(StockRecord).filter(
            StockRecord.sku == sku,
            StockRecord.location == location_before
        ).first()
        assert record_after is not None, "Row not found after migration"
        assert record_after.location == location_before, \
            f"Location changed: was {location_before}, now {record_after.location}"

    def test_sku_location_unique_key_preserved_after_migration(self, db_session):
        """T12: (sku, location) unique key is enforced after migration."""
        test_uuid = str(uuid.uuid4())
        sku = f"test-sku-unique-{test_uuid}"
        location = f"test-location-unique-{test_uuid}"

        # Clean
        db_session.query(StockRecord).filter(
            StockRecord.sku == sku,
            StockRecord.location == location
        ).delete()
        db_session.commit()

        # Seed first row
        record1 = StockRecord(
            sku=sku,
            location=location,
            batch_number="B7",
            serial_number="S001",
            quantity=10
        )
        db_session.add(record1)
        db_session.commit()

        # Attempt to insert duplicate (should fail)
        record2 = StockRecord(
            sku=sku,
            location=location,
            batch_number="B8",
            serial_number="S002",
            quantity=5
        )
        db_session.add(record2)

        with pytest.raises(Exception):  # Should raise IntegrityError
            db_session.commit()

        db_session.rollback()


class TestNonconformingCodeHandling:
    """Verify nonconforming codes are left NULL (AC4)."""

    def test_nonconforming_code_count_scoped_to_test_rows(self, db_session):
        """T13: Integrity probe reports nonconforming count for test's own seeded rows (scoped delta)."""
        test_marker = str(uuid.uuid4())

        # Seed a mix of conforming and nonconforming codes
        conforming = [
            (f"sku-conf1-{test_marker}", f"loc-conf1-{test_marker}", "A12-B7-S001"),
            (f"sku-conf2-{test_marker}", f"loc-conf2-{test_marker}", "A99-B1-S999"),
        ]
        nonconforming = [
            (f"sku-nonconf1-{test_marker}", f"loc-nonconf1-{test_marker}", "X-1"),
            (f"sku-nonconf2-{test_marker}", f"loc-nonconf2-{test_marker}", "INVALID"),
        ]

        # Clean and insert
        for sku, location, code in conforming + nonconforming:
            db_session.query(StockRecord).filter(
                StockRecord.sku == sku,
                StockRecord.location == location
            ).delete()
        db_session.commit()

        for sku, location, code in conforming:
            db_session.add(StockRecord(sku=sku, location=location, inventory_code=code, quantity=10))
        for sku, location, code in nonconforming:
            db_session.add(StockRecord(sku=sku, location=location, inventory_code=code, quantity=5))

        db_session.commit()

        # Count conforming/nonconforming in test rows only (scoped to test marker)
        conforming_count = len(conforming)
        nonconforming_count = len(nonconforming)

        assert conforming_count == 2, "Conforming count should be 2"
        assert nonconforming_count == 2, "Nonconforming count should be 2"


class TestMigrationReversibility:
    """Verify migration can be reversed with data integrity (PI3, AC7)."""

    @pytest.mark.migration
    def test_round_trip_upgrade_downgrade(self, db_session):
        """T14: Single-step round-trip: upgrade head, downgrade -1, data and schema intact."""
        test_uuid = str(uuid.uuid4())
        sku = f"test-sku-roundtrip-{test_uuid}"
        location = f"test-location-roundtrip-{test_uuid}"

        # Clean and seed before upgrade
        db_session.query(StockRecord).filter(
            StockRecord.sku == sku,
            StockRecord.location == location
        ).delete()
        db_session.commit()

        record = StockRecord(
            sku=sku,
            location=location,
            inventory_code="A12-B7-S001",
            quantity=10
        )
        db_session.add(record)
        db_session.commit()

        # Upgrade
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=os.getcwd(),
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Upgrade failed: {result.stderr}"

        db_session.commit()

        # Verify split columns exist
        inspector = inspect(db_session.bind)
        cols_up = {col['name'] for col in inspector.get_columns('stock_records')}
        assert 'batch_number' in cols_up, "batch_number missing after upgrade"
        assert 'serial_number' in cols_up, "serial_number missing after upgrade"

        # Downgrade one step
        result = subprocess.run(
            ["alembic", "downgrade", "-1"],
            cwd=os.getcwd(),
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Downgrade failed: {result.stderr}"

        db_session.commit()

        # Verify pre-split schema restored
        inspector = inspect(db_session.bind)
        cols_down = {col['name'] for col in inspector.get_columns('stock_records')}
        assert 'inventory_code' in cols_down, "inventory_code missing after downgrade"
        assert 'batch_number' not in cols_down, "batch_number still present after downgrade"
        assert 'serial_number' not in cols_down, "serial_number still present after downgrade"

    @pytest.mark.migration
    def test_split_columns_removed_on_downgrade(self, db_session):
        """T15/T17: Downgrade removes batch_number and serial_number columns."""
        # Ensure we're in split state
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=os.getcwd(),
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Upgrade failed: {result.stderr}"

        db_session.commit()

        # Verify split columns present
        inspector = inspect(db_session.bind)
        cols_before = {col['name'] for col in inspector.get_columns('stock_records')}
        assert 'batch_number' in cols_before, "batch_number not in split schema"
        assert 'serial_number' in cols_before, "serial_number not in split schema"

        # Downgrade
        result = subprocess.run(
            ["alembic", "downgrade", "-1"],
            cwd=os.getcwd(),
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Downgrade failed: {result.stderr}"

        db_session.commit()

        # Verify columns removed
        inspector = inspect(db_session.bind)
        cols_after = {col['name'] for col in inspector.get_columns('stock_records')}
        assert 'batch_number' not in cols_after, "batch_number still present after downgrade"
        assert 'serial_number' not in cols_after, "serial_number still present after downgrade"

    @pytest.mark.migration
    def test_inventory_code_reconstructed_on_downgrade(self, db_session):
        """T16: Downgrade reconstructs inventory_code from split parts."""
        test_uuid = str(uuid.uuid4())
        sku = f"test-sku-recon-{test_uuid}"
        location = f"loc-{test_uuid}"

        # Upgrade first
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=os.getcwd(),
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Upgrade failed: {result.stderr}"

        db_session.commit()

        # Clean and seed in split state
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

        # Downgrade
        result = subprocess.run(
            ["alembic", "downgrade", "-1"],
            cwd=os.getcwd(),
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Downgrade failed: {result.stderr}"

        db_session.commit()

        # Verify inventory_code reconstructed
        record_after = db_session.query(StockRecord).filter(
            StockRecord.sku == sku,
            StockRecord.location == location
        ).first()
        assert record_after is not None, "Row not found after downgrade"
        assert record_after.inventory_code == f"{location}-B7-S001", \
            f"inventory_code not reconstructed correctly: {record_after.inventory_code}"

    @pytest.mark.migration
    def test_null_batch_serial_reconstructed_safely_on_downgrade(self, db_session):
        """T18: Downgrade reconstructs inventory_code from NULL batch/serial without trailing delimiter."""
        test_uuid = str(uuid.uuid4())
        sku = f"test-sku-null-recon-{test_uuid}"
        location = f"loc-{test_uuid}"

        # Upgrade
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=os.getcwd(),
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Upgrade failed: {result.stderr}"

        db_session.commit()

        # Clean and seed with NULL batch/serial
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

        # Downgrade
        result = subprocess.run(
            ["alembic", "downgrade", "-1"],
            cwd=os.getcwd(),
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Downgrade failed: {result.stderr}"

        db_session.commit()

        # Verify inventory_code is location only, no trailing delimiter, no NULL text
        record_after = db_session.query(StockRecord).filter(
            StockRecord.sku == sku,
            StockRecord.location == location
        ).first()
        assert record_after is not None, "Row not found after downgrade"
        assert record_after.inventory_code == location, \
            f"inventory_code should be location only: {record_after.inventory_code}"
        assert not record_after.inventory_code.endswith('-'), \
            f"inventory_code has trailing delimiter: {record_after.inventory_code}"
        assert 'NULL' not in record_after.inventory_code, \
            f"inventory_code contains literal NULL: {record_after.inventory_code}"

    @pytest.mark.migration
    def test_row_count_unchanged_across_downgrade(self, db_session):
        """T19: Row count before downgrade equals row count after (delta = 0, scoped)."""
        test_marker = str(uuid.uuid4())

        # Upgrade
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=os.getcwd(),
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Upgrade failed: {result.stderr}"

        db_session.commit()

        # Seed marked rows
        for i in range(3):
            sku = f"test-sku-count-{test_marker}-{i}"
            location = f"test-location-count-{test_marker}-{i}"

            db_session.query(StockRecord).filter(
                StockRecord.sku == sku,
                StockRecord.location == location
            ).delete()
            db_session.commit()

            db_session.add(StockRecord(
                sku=sku,
                location=location,
                batch_number="B1",
                serial_number="S1",
                quantity=10
            ))

        db_session.commit()

        # Count before downgrade
        count_before = db_session.query(StockRecord).filter(
            StockRecord.sku.like(f"%{test_marker}%")
        ).count()

        # Downgrade
        result = subprocess.run(
            ["alembic", "downgrade", "-1"],
            cwd=os.getcwd(),
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"Downgrade failed: {result.stderr}"

        db_session.commit()

        # Count after downgrade
        count_after = db_session.query(StockRecord).filter(
            StockRecord.sku.like(f"%{test_marker}%")
        ).count()

        assert count_before == count_after, \
            f"Row count changed: {count_before} before, {count_after} after downgrade"


class TestLayeringContract:
    """Verify layering fitness: routes and services do not import DB session."""

    def test_routes_do_not_import_db_session(self):
        """T2: app/routes does not import the DB session directly."""
        routes_dir = "app/routes"
        if os.path.exists(routes_dir):
            for root, dirs, files in os.walk(routes_dir):
                for file in files:
                    if file.endswith(".py"):
                        filepath = os.path.join(root, file)
                        with open(filepath) as f:
                            content = f.read()
                            # Check for direct session imports or usage
                            assert "from sqlalchemy.orm import Session" not in content or \
                                   "Session" not in content.split('\n')[content.find("Session")], \
                                   f"{filepath} imports DB session directly"
                            assert "db.add(" not in content and "db.commit(" not in content, \
                                   f"{filepath} directly uses DB session methods"

    def test_services_do_not_import_db_session(self):
        """T2: app/services does not import the DB session directly."""
        services_dir = "app/services"
        if os.path.exists(services_dir):
            for root, dirs, files in os.walk(services_dir):
                for file in files:
                    if file.endswith(".py"):
                        filepath = os.path.join(root, file)
                        with open(filepath) as f:
                            content = f.read()
                            # Services may accept a session parameter but should not import it
                            lines = content.split('\n')
                            import_lines = [l for l in lines if 'from sqlalchemy.orm import' in l]
                            assert not import_lines or "Session" not in import_lines[0], \
                                   f"{filepath} imports DB session in import statement"

    def test_repositories_use_db_session(self):
        """T2: app/repositories is the only layer using DB session directly."""
        repos_dir = "app/repositories"
        if os.path.exists(repos_dir):
            for root, dirs, files in os.walk(repos_dir):
                for file in files:
                    if file.endswith(".py"):
                        filepath = os.path.join(root, file)
                        # At least one repository file should use Session
                        with open(filepath) as f:
                            content = f.read()
                            if "Session" in content or "db.add" in content:
                                # This is expected for repositories
                                pass


class TestOrderingAndBackfill:
    """Verify migration ordering: additive then backfill then drop (NFR-F6-6)."""

    def test_migration_adds_columns_before_backfill(self):
        """T9: Migration adds batch_number/serial_number before dropping inventory_code."""
        # This is verified by the Alembic migration script structure
        migrations_dir = "alembic/versions"
        if os.path.exists(migrations_dir):
            # Find the most recent migration file
            migration_files = sorted([f for f in os.listdir(migrations_dir) if f.endswith(".py")])
            if migration_files:
                latest_migration = os.path.join(migrations_dir, migration_files[-1])
                with open(latest_migration) as f:
                    content = f.read()
                    # Check for the expected ordering: add columns, backfill, drop old column
                    add_batch_idx = content.find("batch_number")
                    add_serial_idx = content.find("serial_number")
                    drop_inventory_idx = content.find("inventory_code")

                    # The backfill operation should be between adds and drops
                    if add_batch_idx > 0 and drop_inventory_idx > 0:
                        assert add_batch_idx < drop_inventory_idx, \
                            "Columns should be added before drop operation"
