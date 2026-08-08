Feature: Integrity probe for nonconforming tracking codes
  As a warehouse inventory manager
  I want to see a count of stock rows whose tracking code did not cleanly split
  into batch and serial
  So that I can review data quality and accept the schema change with
  confidence that nothing was silently lost

  @T14
  Scenario: The probe reports an explicit zero when every stock row split cleanly
    Given a stock row exists with sku "SKU-F6-P200", location "Q1", batch_number "B1", and serial_number "S1"
    And a stock row exists with sku "SKU-F6-P201", location "Q2", batch_number "B2", and serial_number "S2"
    When the integrity probe runs against the migrated stock data
    Then the integrity probe reports a nonconforming count of 0

  @T15
  Scenario: The probe counts rows whose tracking code did not cleanly split
    Given a stock row exists with sku "SKU-F6-P210", location "R1", batch_number "B3", and serial_number "S3"
    And a stock row exists with sku "SKU-F6-P211", location "R2", with no batch_number and no serial_number
    And a stock row exists with sku "SKU-F6-P212", location "R3", with no batch_number and no serial_number
    When the integrity probe runs against the migrated stock data
    Then the integrity probe reports a nonconforming count of 2

  @T16
  Scenario: A partially split row is counted as nonconforming
    Given a stock row exists with sku "SKU-F6-P220", location "S1", batch_number "B4", and serial_number "S4"
    And a stock row exists with sku "SKU-F6-P221", location "S2", batch_number "B5", and no serial_number
    When the integrity probe runs against the migrated stock data
    Then the integrity probe reports a nonconforming count of 1
