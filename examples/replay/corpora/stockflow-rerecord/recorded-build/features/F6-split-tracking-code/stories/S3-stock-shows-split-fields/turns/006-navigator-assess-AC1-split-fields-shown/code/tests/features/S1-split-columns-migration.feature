Feature: S1 Split Columns Migration

  # T1 - AC1-batch-serial-columns-added
  Scenario: Up-migration exposes batch_number and serial_number as separate columns
    Given the split-columns migration has been applied to the branch DB
    When I inspect the columns of stock_records
    Then both batch_number and serial_number exist as independently addressable columns

  # T7 - AC4-nonconforming-code-left-null
  Scenario: Backfill leaves batch_number and serial_number NULL for a nonconforming code
    Given a stock row seeded with a uuid-suffixed sku and location and inventory_code "X-1" before the migration
    When the split-columns migration runs
    Then the seeded row still exists and batch_number is NULL and serial_number is NULL

  # T6 - AC2-conforming-code-split
  Scenario: Backfill splits a well-formed code into batch_number and serial_number
    Given a stock row seeded with a uuid-suffixed sku and location and inventory_code "A12-B7-S001" before the migration
    When the split-columns migration runs
    Then batch_number equals "B7" and serial_number equals "S001" for that row

  # T8 - AC3-combined-code-dropped
  Scenario: After the up-migration the inventory_code column no longer exists
    Given the split-columns migration has been applied to the branch DB
    When I inspect the columns of stock_records
    Then inventory_code does not exist as a column while batch_number and serial_number are present

  # T11 - AC8-location-unchanged
  Scenario: Migration does not overwrite a row's location from the code's leading segment
    Given a stock row seeded with a uuid-suffixed sku, a known location value, and an inventory_code whose leading segment differs from that location
    When the split-columns migration runs
    Then the row's location is byte-for-byte unchanged after the migration
