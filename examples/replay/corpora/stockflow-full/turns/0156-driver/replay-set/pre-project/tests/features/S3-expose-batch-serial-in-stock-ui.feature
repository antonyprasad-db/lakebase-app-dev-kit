Feature: Expose batch and serial numbers in stock UI (S3-expose-batch-serial-in-stock-ui)

  # T34 – AC1: detail API returns batch_number with correct value
  Scenario: Detail API returns batch_number as a distinct top-level field with the correct value
    Given a stock record with batch_number and serial_number populated exists in the database
    When the client GETs the detail API endpoint for that stock record
    Then the JSON response contains batch_number as a distinct top-level field with its correct value

  # T35 – AC1: detail API returns serial_number with correct value
  Scenario: Detail API returns serial_number as a distinct top-level field with the correct value
    Given a stock record with batch_number and serial_number populated exists in the database
    When the client GETs the detail API endpoint for that stock record
    Then the JSON response contains serial_number as a distinct top-level field with its correct value

  # T40 – AC2: list API records include batch_number
  Scenario: List API returns batch_number as a distinct field on each seeded record
    Given stock records with batch_number and serial_number populated exist in the database
    When the client GETs the stock list API endpoint
    Then each seeded record in the JSON response contains batch_number as a distinct field

  # T41 – AC2: list API records include serial_number
  Scenario: List API returns serial_number as a distinct field on each seeded record
    Given stock records with batch_number and serial_number populated exist in the database
    When the client GETs the stock list API endpoint
    Then each seeded record in the JSON response contains serial_number as a distinct field

  # T45 – AC3: detail API returns batch_number as JSON null when column is NULL
  Scenario: Detail API returns batch_number as JSON null when the database column is NULL
    Given a stock record whose batch_number is NULL exists in the database
    When the client GETs the detail API endpoint for that stock record
    Then batch_number is present in the JSON response as null rather than absent or an error

  # T46 – AC3: detail API returns serial_number as JSON null when column is NULL
  Scenario: Detail API returns serial_number as JSON null when the database column is NULL
    Given a stock record whose serial_number is NULL exists in the database
    When the client GETs the detail API endpoint for that stock record
    Then serial_number is present in the JSON response as null rather than absent or an error

  # T47 – AC3: list API returns null batch/serial with full record
  Scenario: List API returns null for batch_number and serial_number with all remaining fields present
    Given a stock record whose batch_number and serial_number are NULL exists in the database
    When the client GETs the stock list API endpoint
    Then batch_number and serial_number are null in the seeded record and the remaining fields are still present

  # T53 – AC4: detail API response has no inventory_code field
  Scenario: Detail API JSON response does not contain an inventory_code field
    Given a stock record with batch_number and serial_number populated exists in the database
    When the client GETs the detail API endpoint for that stock record
    Then the JSON response does not contain an inventory_code field

  # T54 – AC4: list API records have no inventory_code field
  Scenario: List API JSON response records do not contain an inventory_code field
    Given stock records with batch_number and serial_number populated exist in the database
    When the client GETs the stock list API endpoint
    Then no record in the JSON response contains an inventory_code field
