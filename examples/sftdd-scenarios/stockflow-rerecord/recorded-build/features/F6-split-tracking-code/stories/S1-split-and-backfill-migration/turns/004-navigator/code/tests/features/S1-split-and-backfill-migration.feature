Feature: Split and backfill migration for inventory_code

  # T1 - AC1-conforming-code-backfilled
  Scenario: conforming inventory_code backfills batch_number and serial_number
    Given a sprint-1 stock row with conforming inventory_code "A12-B7-S001" exists in the migrated table
    When the migrated batch_number and serial_number columns are read for that row
    Then batch_number equals "B7" and serial_number equals "S001"
    And the row remains retrievable with its original quantity and location

  # T2 - AC2-nonconforming-code-left-null
  Scenario: nonconforming inventory_code leaves batch_number and serial_number NULL
    Given a sprint-1 stock row with nonconforming inventory_code "NOPARSE" exists in the migrated table
    When the migrated batch_number and serial_number columns are read for that row
    Then batch_number is NULL and serial_number is NULL
    And the row remains present with its quantity, sku, and location intact

  # T3 - AC3-location-stays-canonical
  Scenario: location retains its original canonical value after migration
    Given a sprint-1 stock row with location "SHELF-99" and conforming inventory_code "SHELF-99-BX-SX" exists in the migrated table
    When the location column is read for that row after migration
    Then location is still "SHELF-99" and has not been overwritten from the code's leading segment

  # T4 - AC4-combined-code-retired
  Scenario: inventory_code column no longer exists and batch_number serial_number are queryable
    Given the migration has been applied to the stock_records table
    When the columns of stock_records are inspected
    Then the inventory_code column does not exist on stock_records
    And batch_number and serial_number exist as first-class queryable columns

  # T7 - AC5-integrity-probe-reports-nonconforming-count
  Scenario: integrity probe reports the count of nonconforming rows scoped to marker SKUs
    Given a mixed set of stock rows seeded with per-run-unique marker SKUs, some conforming and some nonconforming
    When the integrity probe is run scoped to those marker SKUs
    Then the reported nonconforming count equals the number of seeded nonconforming rows
