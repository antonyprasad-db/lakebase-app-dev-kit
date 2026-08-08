Feature: Browse the home stock-by-location table
  As a warehouse team member
  I want to see every filed stock record listed by SKU and location
  So that I can check what's on hand where, at a glance

  @T13
  Scenario: Opening the home table lists each filed record as a row
    Given a stock record was filed for sku "SKU-600" at location "H1" with quantity 15 and inventory_code "LOT-60"
    When the team member opens the home stock-by-location table
    Then the table lists a row for sku "SKU-600" at location "H1" with quantity 15

  @T15
  Scenario: The same SKU filed at two locations appears as two distinct rows
    Given a stock record was filed for sku "SKU-700" at location "J2" with quantity 3 and inventory_code "LOT-70"
    And a stock record was filed for sku "SKU-700" at location "K3" with quantity 9 and inventory_code "LOT-71"
    When the team member opens the home stock-by-location table
    Then the table lists a row for sku "SKU-700" at location "J2" with quantity 3
    And the table lists a row for sku "SKU-700" at location "K3" with quantity 9

  @T14
  Scenario: Viewing a location with no filed stock shows the explicit empty-state message
    Given no stock records exist for location "Z9"
    When the team member views the stock table for location "Z9"
    Then the table shows the message "No stock at this location" instead of a blank page
