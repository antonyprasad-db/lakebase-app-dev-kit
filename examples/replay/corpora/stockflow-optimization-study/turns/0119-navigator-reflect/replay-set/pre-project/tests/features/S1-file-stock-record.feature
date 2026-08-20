Feature: File a stock record

  Scenario: T9 - POST valid new stock record returns success with matching read-back values
    Given a unique new SKU and location for filing
    When I POST a valid filing with quantity 50 and tracking code "TC-001"
    Then the response status is 201
    And the record is stored with quantity 50 and tracking code "TC-001"

  Scenario: T10 - POST payload missing the SKU field returns error naming SKU
    Given a filing payload that omits the SKU field
    When I POST the filing payload
    Then the response is an HTTP error
    And the response body names the "sku" field

  Scenario: T11 - POST payload with blank tracking code returns error naming tracking code
    Given a unique new SKU and location for filing
    And a filing payload with a blank tracking_code
    When I POST the filing payload
    Then the response is an HTTP error
    And the response body names the "tracking_code" field

  Scenario: T13 - POST second filing for existing pair updates quantity
    Given an existing stock record with quantity 10 for a unique SKU and location
    When I POST a second filing for the same SKU and location with quantity 99
    Then the response is successful
    And the stored quantity for that SKU and location is 99

  Scenario: T14 - After second filing exactly one record exists for the pair
    Given an existing stock record with quantity 10 for a unique SKU and location
    When I POST a second filing for the same SKU and location with quantity 99
    Then exactly one record exists for that SKU and location in the store

  Scenario: T15 - POST negative quantity rejected naming the quantity field
    Given a unique new SKU and location for filing
    When I POST a filing with quantity -5
    Then the response is an HTTP error
    And the response body names the "quantity" field

  Scenario: T16 - POST negative quantity leaves no record in the store
    Given a unique new SKU and location for filing
    When I POST a filing with quantity -1
    Then the response is an HTTP error
    And no record exists for that SKU and location in the store
