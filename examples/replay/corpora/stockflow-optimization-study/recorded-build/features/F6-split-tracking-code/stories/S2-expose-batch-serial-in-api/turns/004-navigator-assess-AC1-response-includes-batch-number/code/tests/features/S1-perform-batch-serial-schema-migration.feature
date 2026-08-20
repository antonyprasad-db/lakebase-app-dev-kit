Feature: S1 Batch/Serial Schema Migration

  # T11 – atomic rollback on partial failure
  Scenario: T11 Migration rolls back atomically on partial failure
    Given the stock_records table is at the pre-migration schema with a seeded row
    When the migration fails partway through a step
    Then the migration exception was raised indicating a partial failure
    And the stock_records table schema is unchanged from the pre-migration state
    And the seeded row is still present in stock_records

  # T13 – integrity probe counts NULL rows after backfill
  Scenario: T13 Integrity probe counts NULL batch/serial rows for mixed inventory_codes
    Given stock_records contains 2 well-formed and 3 malformed inventory_codes
    When the up migration completes its backfill
    Then the count of NULL batch_number or serial_number rows for the seeded set equals 3

  # T17 – downgrade reconstructs inventory_code
  Scenario: T17 Down migration reconstructs inventory_code from location and split columns
    Given the up migration has been applied with rows having batch_number and serial_number
    When the down migration runs one step
    Then inventory_code column is re-added to stock_records
    And each seeded row inventory_code equals location concatenated with batch_number and serial_number
