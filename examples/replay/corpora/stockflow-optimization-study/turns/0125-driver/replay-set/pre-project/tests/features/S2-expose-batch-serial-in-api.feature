Feature: S2 Expose Batch and Serial in API

  # T20 – batch_number field in response when set
  Scenario: T20 Fetching a stock record with batch_number set returns batch_number in response
    Given a stock record whose batch_number is set to a known value
    When an API client fetches that stock record by SKU
    Then the response contains a batch_number field equal to the seeded batch value

  # T22 – serial_number field in response when set
  Scenario: T22 Fetching a stock record with serial_number set returns serial_number in response
    Given a stock record whose serial_number is set to a known value
    When an API client fetches that stock record by SKU
    Then the response contains a serial_number field equal to the seeded serial value

  # T24 – null batch_number preserved as explicit null
  Scenario: T24 Fetching a stock record with NULL batch_number returns explicit null
    Given a stock record whose batch_number and serial_number are NULL
    When an API client fetches that stock record by SKU
    Then the response body includes batch_number present and set to null

  # T25 – null serial_number preserved as explicit null
  Scenario: T25 Fetching a stock record with NULL serial_number returns explicit null
    Given a stock record whose batch_number and serial_number are NULL
    When an API client fetches that stock record by SKU
    Then the response body includes serial_number present and set to null

  # T27 – inventory_code absent from response
  Scenario: T27 Fetching a stock record after the split does not return inventory_code
    Given a stock record exists in the database
    When an API client fetches that stock record by SKU
    Then the response body does not contain an inventory_code field
