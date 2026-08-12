Feature: File stock (S1-file-stock)

  # T4 – AC1: first write + read-back
  Scenario: POST a new stock record and GET returns the same data
    Given no stock exists for a unique SKU and location
    When the client POSTs a new stock record with that SKU, location, and quantity
    Then the response indicates the record was created
    And a subsequent GET for that SKU and location returns the same SKU, location, and quantity

  # T5 – AC1: NFR-F1-validation-messages (negative quantity)
  Scenario: POST with a negative quantity returns a field-named error
    Given the stock API is available
    When the client POSTs a stock record with a negative quantity
    Then the response is an HTTP error
    And the error response body names the offending field "quantity"

  # T6 – AC1: NFR-F1-validation-messages (missing sku)
  Scenario: POST missing the required sku field returns a field-named error
    Given the stock API is available
    When the client POSTs a stock record without the required sku field
    Then the response is an HTTP error
    And the error response body names the offending field "sku"

  # T16 – AC2: inventory_code round-trip
  Scenario: GET a record filed with an inventory_code returns it exactly as filed
    Given no stock exists for a unique SKU and location
    When the client POSTs a stock record with that SKU, location, quantity, and inventory_code "WH-A-LOT-001"
    Then the response indicates the record was created
    And a subsequent GET for that SKU and location returns inventory_code "WH-A-LOT-001"

  # T18 – AC3: refile updates in place
  Scenario: POST the same SKU/location with a different quantity updates in place
    Given a stock record exists for a unique SKU and location with quantity 10
    When the client POSTs the same SKU and location with quantity 25
    Then the response indicates the record was accepted
    And a subsequent GET for that SKU and location returns quantity 25
    And a subsequent GET for that SKU and location returns exactly one record
