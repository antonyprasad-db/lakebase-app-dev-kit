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

  # T7 – AC2-backfill-parses-conforming-code: batch_number set to the second hyphen-delimited segment
  @migration
  Scenario: backfill sets batch_number to the second hyphen-delimited segment for a conforming inventory_code
    Given a stock row with a conforming location-batch-serial inventory_code is seeded before the add-and-backfill migration
    When the add-and-backfill migration is applied to the real branch database
    Then the seeded row has batch_number equal to the batch segment of its inventory_code

  # T8 – AC2-backfill-parses-conforming-code: serial_number set to the third hyphen-delimited segment
  @migration
  Scenario: backfill sets serial_number to the third hyphen-delimited segment for a conforming inventory_code
    Given a stock row with a conforming location-batch-serial inventory_code is seeded before the add-and-backfill migration
    When the add-and-backfill migration is applied to the real branch database
    Then the seeded row has serial_number equal to the serial segment of its inventory_code

  # T9 – AC3-nonconforming-code-leaves-nulls: batch_number left NULL for fewer than three segments
  @migration
  Scenario: backfill leaves batch_number NULL for a nonconforming inventory_code with fewer than three hyphen-delimited segments
    Given a stock row with a nonconforming two-segment inventory_code is seeded before the add-and-backfill migration
    When the add-and-backfill migration is applied to the real branch database
    Then the seeded row has batch_number left NULL

  # T10 – AC3-nonconforming-code-leaves-nulls: serial_number left NULL for fewer than three segments
  @migration
  Scenario: backfill leaves serial_number NULL for a nonconforming inventory_code with fewer than three hyphen-delimited segments
    Given a stock row with a nonconforming two-segment inventory_code is seeded before the add-and-backfill migration
    When the add-and-backfill migration is applied to the real branch database
    Then the seeded row has serial_number left NULL

  # T11 – AC3-nonconforming-code-leaves-nulls: nonconforming row is still present with sku unchanged
  @migration
  Scenario: the nonconforming stock row is still present in the table with its sku unchanged after the add-and-backfill migration
    Given a stock row with a nonconforming two-segment inventory_code is seeded before the add-and-backfill migration
    When the add-and-backfill migration is applied to the real branch database
    Then the nonconforming stock row is still present in the table with its sku unchanged
