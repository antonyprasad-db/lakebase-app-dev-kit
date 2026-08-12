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

  # T29 – AC2-every-row-survives: serial_number value is unchanged after the S2 drop migration
  Scenario: seeded serial_number value is retained after the S2 drop migration
    Given a stock row with a uuid-suffixed sku and a known serial_number is seeded before the S2 drop migration
    When the S2 drop migration is applied to the real branch database
    Then the seeded row's serial_number value equals the original seeded value

  # T30 – AC2-every-row-survives: location value is unchanged after the S2 drop migration
  Scenario: seeded location value is retained after the S2 drop migration
    Given a stock row with a uuid-suffixed sku and a known location is seeded before the S2 drop migration
    When the S2 drop migration is applied to the real branch database
    Then the seeded row's location value equals the original seeded value

  # T31 – AC3-down-migration-reconstructs-code: inventory_code is present in stock schema after the S2 down-migration
  Scenario: inventory_code column is present in the stock table schema after the S2 down-migration
    Given the branch database is in post-drop state with inventory_code absent from the stock schema
    When the S2 down-migration is applied to roll back the drop
    Then the inventory_code column is present in the stock table schema after the down-migration

  # T32 – AC3-down-migration-reconstructs-code: inventory_code value equals combined-code formula after down-migration
  Scenario: seeded row's inventory_code is reconstructed from combined-code formula after the S2 down-migration
    Given the branch database is in post-drop state with a seeded row having known location, batch_number, and serial_number
    When the S2 down-migration is applied to roll back the drop
    Then the seeded row's inventory_code equals location concatenated with batch_number and serial_number
