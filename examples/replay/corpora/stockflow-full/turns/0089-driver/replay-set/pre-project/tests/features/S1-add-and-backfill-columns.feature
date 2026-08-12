Feature: Add and backfill batch_number and serial_number columns (S1-add-and-backfill-columns)

  # T1 – AC1-columns-exist: new columns are separately addressable after migration
  Scenario: batch_number and serial_number are distinct, separately addressable columns after the add-and-backfill migration
    Given a stock row is seeded on the real branch database
    When the add-and-backfill migration is applied to the real branch database
    Then the seeded row has a batch_number column that is separately addressable
    And the seeded row has a serial_number column that is separately addressable

  # T2 – AC1-columns-exist: location and inventory_code remain present and unchanged
  Scenario: location and inventory_code remain present and unchanged after the add-and-backfill migration
    Given a stock row is seeded with a known location and inventory_code on the real branch database
    When the add-and-backfill migration is applied to the real branch database
    Then the seeded row has the same location value as before the migration
    And the seeded row has the same inventory_code value as before the migration
