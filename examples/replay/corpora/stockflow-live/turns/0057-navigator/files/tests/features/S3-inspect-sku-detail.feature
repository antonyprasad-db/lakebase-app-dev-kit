Feature: Inspect a SKU's detail across locations
  As a warehouse team member
  I want to open a single SKU's detail view
  So that I can see every location it's filed at, with quantity, tracking code, and par level

  @T18
  Scenario: The SKU detail view lists a row for each location the SKU is filed at
    Given a stock record was filed for sku "SKU-800" at location "N1" with quantity 12 and inventory_code "LOT-80"
    And a stock record was filed for sku "SKU-800" at location "N2" with quantity 7 and inventory_code "LOT-81"
    When the team member opens the detail view for sku "SKU-800"
    Then the detail view lists a row for location "N1" with quantity 12
    And the detail view lists a row for location "N2" with quantity 7

  @T19
  Scenario: The SKU detail view is scoped to the selected SKU only
    Given a stock record was filed for sku "SKU-810" at location "N3" with quantity 4 and inventory_code "LOT-82"
    And a stock record was filed for sku "SKU-820" at location "N3" with quantity 9 and inventory_code "LOT-83"
    When the team member opens the detail view for sku "SKU-810"
    Then the detail view lists a row for location "N3" with quantity 4
    And the detail view does not list any row for sku "SKU-820"

  @T20
  Scenario: Each detail row shows the filed tracking code
    Given a stock record was filed for sku "SKU-830" at location "N4" with quantity 6 and inventory_code "LOT-84"
    When the team member opens the detail view for sku "SKU-830"
    Then the detail view lists a row for location "N4" with inventory code "LOT-84"

  @T21
  Scenario: A row with no par level tracked shows an explicit not-tracked indicator, a row with a par level shows its value
    Given a stock record was filed for sku "SKU-840" at location "N5" with quantity 3 and inventory_code "LOT-85" and no par level tracked
    And a stock record was filed for sku "SKU-840" at location "N6" with quantity 8 and inventory_code "LOT-86" and par level 20
    When the team member opens the detail view for sku "SKU-840"
    Then the detail view row for location "N5" shows par level as "Not tracked"
    And the detail view row for location "N6" shows par level 20
