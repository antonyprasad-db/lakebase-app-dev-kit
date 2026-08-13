Feature: Split the combined tracking code into batch and serial columns
  As a warehouse inventory manager
  I want the combined tracking code split into batch and serial columns, with the
  combined column retired and every existing row preserved through a reversible
  migration
  So that batch and serial become first-class facts I can query and validate on
  their own without losing or corrupting any stock data

  @T1 @migration
  Scenario: A conforming inventory code splits into batch_number and serial_number
    Given a stock row exists with sku "SKU-F6-101", location "A12", and inventory_code "A12-B7-S001"
    When the split-tracking-code migration runs
    Then the row for sku "SKU-F6-101" at location "A12" has batch_number "B7" and serial_number "S001"

  @T2 @migration
  Scenario: A nonconforming inventory code leaves batch_number and serial_number NULL
    Given a stock row exists with sku "SKU-F6-102", location "Y1", and inventory_code "X-1"
    And a stock row exists with sku "SKU-F6-103", location "Y2", and inventory_code "c"
    When the split-tracking-code migration runs
    Then the row for sku "SKU-F6-102" at location "Y1" has batch_number and serial_number both NULL
    And the row for sku "SKU-F6-103" at location "Y2" has batch_number and serial_number both NULL

  @T3 @migration
  Scenario: Location is left byte-for-byte unchanged by the migration
    Given a stock row exists with sku "SKU-F6-104", location "Warehouse North Dock 7", and inventory_code "A12-B7-S001"
    When the split-tracking-code migration runs
    Then the row for sku "SKU-F6-104" at location "Warehouse North Dock 7" has batch_number "B7" and serial_number "S001"
    And the row for sku "SKU-F6-104" still has location "Warehouse North Dock 7" exactly as before

  @T4 @migration
  Scenario: The migrated schema no longer exposes the combined inventory_code column
    Given a stock row exists with sku "SKU-F6-105", location "D5", and inventory_code "D5-B1-S100"
    When the split-tracking-code migration runs
    Then the stock_records table no longer has an inventory_code column

  @T5 @migration
  Scenario: Every seeded row survives the migration one-for-one
    Given a stock row exists with sku "SKU-F6-106", location "E1", and inventory_code "E1-B2-S200"
    And a stock row exists with sku "SKU-F6-107", location "E2", and inventory_code "bareword"
    When the split-tracking-code migration runs
    Then the row for sku "SKU-F6-106" at location "E1" has batch_number "B2" and serial_number "S200"
    And the post-migration row set for skus "SKU-F6-106" and "SKU-F6-107" matches the pre-migration set one-for-one, with no row dropped or duplicated

  @T6 @migration
  Scenario: The down migration reconstructs the combined inventory_code from location, batch_number, and serial_number
    Given the split-tracking-code migration has already run and a row exists with sku "SKU-F6-108", location "F9", batch_number "B3", and serial_number "S300"
    When the down migration is applied
    Then the row for sku "SKU-F6-108" has inventory_code "F9-B3-S300"
