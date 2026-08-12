Feature: Drop combined inventory_code column (S2-drop-combined-code)

  # T23 – AC1-column-dropped: inventory_code is absent from stock schema after the S2 drop migration
  Scenario: inventory_code column is absent from the stock table after the S2 drop migration
    Given a stock row with a uuid-suffixed sku is seeded on the real branch database before the S2 drop migration
    When the S2 drop migration is applied to the real branch database
    Then the inventory_code column is absent from the stock table schema

  # T24 – AC1-column-dropped: batch_number column is still present in stock schema after the S2 drop migration
  Scenario: batch_number column is present in the stock table after the S2 drop migration
    Given a stock row with a uuid-suffixed sku is seeded on the real branch database before the S2 drop migration
    When the S2 drop migration is applied to the real branch database
    Then the batch_number column is present in the stock table schema

  # T25 – AC1-column-dropped: serial_number column is still present in stock schema after the S2 drop migration
  Scenario: serial_number column is present in the stock table after the S2 drop migration
    Given a stock row with a uuid-suffixed sku is seeded on the real branch database before the S2 drop migration
    When the S2 drop migration is applied to the real branch database
    Then the serial_number column is present in the stock table schema

  # T26 – AC1-column-dropped: location column is still present in stock schema after the S2 drop migration
  Scenario: location column is present in the stock table after the S2 drop migration
    Given a stock row with a uuid-suffixed sku is seeded on the real branch database before the S2 drop migration
    When the S2 drop migration is applied to the real branch database
    Then the location column is present in the stock table schema

  # T27 – AC2-every-row-survives: delta row count for test-owned rows is zero after the S2 drop migration
  Scenario: seeded rows survive the S2 drop migration with zero row-count delta
    Given multiple stock rows are seeded with uuid-suffixed location keys before the S2 drop migration
    When the S2 drop migration is applied to the real branch database
    Then the delta row count for the test's own seeded rows is zero after the migration

  # T28 – AC2-every-row-survives: batch_number value is unchanged after the S2 drop migration
  Scenario: seeded batch_number value is retained after the S2 drop migration
    Given a stock row with a uuid-suffixed sku and a known batch_number is seeded before the S2 drop migration
    When the S2 drop migration is applied to the real branch database
    Then the seeded row's batch_number value equals the original seeded value
