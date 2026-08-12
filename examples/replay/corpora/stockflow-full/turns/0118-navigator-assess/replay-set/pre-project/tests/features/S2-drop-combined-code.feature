Feature: Drop combined inventory_code column (S2-drop-combined-code)

  # T23 – AC1-column-dropped: inventory_code is absent from stock schema after the S2 drop migration
  Scenario: inventory_code column is absent from the stock table after the S2 drop migration
    Given a stock row with a uuid-suffixed sku is seeded on the real branch database before the S2 drop migration
    When the S2 drop migration is applied to the real branch database
    Then the inventory_code column is absent from the stock table schema
