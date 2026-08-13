Feature: Split tracking code into batch_number and serial_number columns
  As a warehouse system
  I want to split the combined inventory_code into separately addressable batch_number and serial_number columns
  So that tracking codes can be queried and managed independently

  Scenario: After up-migration runs, stock_records exposes batch_number and serial_number as separate columns
    Given a stock record seeded with uuid-suffixed sku and location and inventory_code "A12-B7-S001"
    When the migration upgrade head completes
    Then the stock_records table has a batch_number column
    And the stock_records table has a serial_number column
    And the seeded row's batch_number is "B7"
    And the seeded row's serial_number is "S001"

  Scenario: Backfill of a well-formed code splits segments correctly
    Given a stock record with uuid-suffixed sku and location and inventory_code "A12-B7-S001"
    When the migration upgrade head completes
    Then batch_number is set to "B7"
    And serial_number is set to "S001"

  Scenario: Backfill of a nonconforming code leaves batch_number and serial_number NULL
    Given a stock record with uuid-suffixed sku and location and inventory_code "X-1"
    When the migration upgrade head completes
    Then batch_number remains NULL
    And serial_number remains NULL
    And the row still exists in stock_records

  Scenario: After migration completes, the inventory_code column no longer exists
    Given stock records exist before the migration
    When the migration upgrade head completes
    Then the stock_records table does not have an inventory_code column
    And batch_number and serial_number are populated from prior inventory_code segments

  Scenario: Location value is unchanged after the migration
    Given a stock record with uuid-suffixed sku and location "test-location-{uuid}" and inventory_code "A12-B7-S001"
    When the migration upgrade head completes
    Then the location remains "test-location-{uuid}"
    And location was not overwritten from the code's leading segment

  Scenario: After downgrade -1, the inventory_code column is reconstructed
    Given a stock record with uuid-suffixed sku and location and inventory_code "A12-B7-S001" before migration
    When the migration upgrade head and then downgrade -1 complete
    Then the stock_records table has an inventory_code column again
    And the schema is back at the pre-split state

  Scenario: Downgrade reconstructs inventory_code correctly from split parts
    Given a seeded stock record with uuid-suffixed sku and location and batch_number "B7" and serial_number "S001" and location "loc-{uuid}"
    When the migration downgrade -1 completes
    Then inventory_code is reconstructed as "loc-{uuid}-B7-S001"

  Scenario: Downgrade from NULL batch/serial reconstructs location without trailing delimiter
    Given a seeded stock record with uuid-suffixed sku and location "loc-{uuid}" and batch_number NULL and serial_number NULL
    When the migration downgrade -1 completes
    Then inventory_code is reconstructed as "loc-{uuid}" with no trailing delimiter
    And no literal "NULL" text appears in inventory_code

  Scenario: After downgrade -1, the batch_number and serial_number columns are removed
    Given stock records in split schema before downgrade
    When the migration downgrade -1 completes
    Then the stock_records table does not have a batch_number column
    And the stock_records table does not have a serial_number column
