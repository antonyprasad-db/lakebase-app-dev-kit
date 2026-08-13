Feature: File a stock record for a SKU at a location
  As a warehouse team member
  I want to file a stock record for a SKU at a location
  So that stock levels are recorded and can be looked up later

  @T1
  Scenario: Filing a valid stock record for a fresh pair persists it and confirms
    Given no stock record exists for sku "SKU-100" at location "A1"
    When the team member files sku "SKU-100" at location "A1" with quantity 12 and inventory_code "LOT-42"
    Then the response confirms the filed record with sku "SKU-100", location "A1", quantity 12, and inventory_code "LOT-42"
    And a stock record exists in the database for sku "SKU-100" at location "A1" with quantity 12 and inventory_code "LOT-42"

  @T2
  Scenario: Retrieving a previously filed pair returns it exactly as filed
    Given a stock record was filed for sku "SKU-200" at location "B2" with quantity 7 and inventory_code "LOT-7"
    When the team member retrieves the stock record for sku "SKU-200" at location "B2"
    Then the response returns sku "SKU-200", location "B2", quantity 7, and inventory_code "LOT-7"

  @T5
  Scenario: Filing a negative quantity is rejected with a field-named error
    Given no stock record exists for sku "SKU-300" at location "C3"
    When the team member files sku "SKU-300" at location "C3" with quantity -5 and inventory_code "LOT-9"
    Then the response rejects the filing with an inline error naming the "quantity" field
    And no stock record exists in the database for sku "SKU-300" at location "C3"

  @T7
  Scenario: Refiling the same pair with a different quantity resolves to a single row
    Given a stock record was filed for sku "SKU-400" at location "D4" with quantity 3 and inventory_code "LOT-1"
    When the team member files sku "SKU-400" at location "D4" with quantity 9 and inventory_code "LOT-1"
    Then exactly one stock record exists in the database for sku "SKU-400" at location "D4" and it holds quantity 9

  @T9
  Scenario: Refiling an existing pair returns a confirmation, never an error page
    Given a stock record was filed for sku "SKU-500" at location "E5" with quantity 4 and inventory_code "LOT-2"
    When the team member files sku "SKU-500" at location "E5" with quantity 6 and inventory_code "LOT-2"
    Then the response confirms the filed record with sku "SKU-500", location "E5", quantity 6, and inventory_code "LOT-2"
    And the response is not an error page
