Feature: File a stock record

  # T1 - AC1-file-new-record
  Scenario: filing a new SKU+location persists a retrievable stock record
    Given no stock record exists for SKU "TEST-SKU-T1" at location "BIN-A1"
    When the operator files SKU "TEST-SKU-T1" at location "BIN-A1" with quantity 10 and inventory_code "IC-001"
    Then the stock record for "TEST-SKU-T1" at "BIN-A1" is retrievable with quantity 10 and inventory_code "IC-001"

  # T4 - AC1-file-new-record
  Scenario: filing a negative quantity is rejected and no row is persisted
    Given no stock record exists for SKU "TEST-SKU-T4" at location "BIN-A4"
    When the operator attempts to file SKU "TEST-SKU-T4" at location "BIN-A4" with quantity -5 and inventory_code "IC-004"
    Then the response status is 422
    And no stock record exists for SKU "TEST-SKU-T4" at location "BIN-A4"

  # T5 - AC1-file-new-record
  Scenario: filing with a missing core field returns a field-named validation error
    Given the filing endpoint is available
    When the operator submits a filing request missing the quantity field for SKU "TEST-SKU-T5" at location "BIN-A5"
    Then the response status is 422
    And the response body names the offending field "quantity"

  # T2 - AC2-refile-updates-existing
  Scenario: refiling the same SKU+location updates the existing row in place
    Given a stock record already exists for SKU "TEST-SKU-T2" at location "BIN-B2" with quantity 5 and inventory_code "OLD-001"
    When the operator files SKU "TEST-SKU-T2" at location "BIN-B2" with quantity 20 and inventory_code "NEW-999"
    Then the stock record for "TEST-SKU-T2" at "BIN-B2" is retrievable with quantity 20 and inventory_code "NEW-999"
    And exactly 1 stock record exists for SKU "TEST-SKU-T2" at location "BIN-B2"
