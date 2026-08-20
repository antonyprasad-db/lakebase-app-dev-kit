Feature: S3 Display Batch and Serial Fields Separately

  # T32 – batch_number returned in GET /api/stock list
  Scenario: T32 GET /api/stock list includes batch_number for a seeded record
    Given a stock record seeded with a uuid-suffixed sku and batch_number "B001" for T32
    When the client fetches GET /api/stock
    Then the list response contains a row for T32 with batch_number equal to "B001"

  # T33 – serial_number returned in GET /api/stock list
  Scenario: T33 GET /api/stock list includes serial_number for a seeded record
    Given a stock record seeded with a uuid-suffixed sku and serial_number "S001" for T33
    When the client fetches GET /api/stock
    Then the list response contains a row for T33 with serial_number equal to "S001"

  # T44 – inventory_code absent from GET /api/stock list
  Scenario: T44 GET /api/stock list does not include inventory_code field
    Given a stock record seeded with a uuid-suffixed sku for T44
    When the client fetches GET /api/stock
    Then no record in the list response for T44 contains an inventory_code field

  # T36 – POST /api/stock persists batch_number
  Scenario: T36 POST /api/stock persists the submitted batch_number
    Given a POST /api/stock request body with a uuid-suffixed sku and batch_number "BATCH-T36"
    When the client submits the POST /api/stock request for T36
    Then the persisted record for T36 has batch_number equal to "BATCH-T36"

  # T37 – POST /api/stock persists serial_number
  Scenario: T37 POST /api/stock persists the submitted serial_number
    Given a POST /api/stock request body with a uuid-suffixed sku and serial_number "SN-T37"
    When the client submits the POST /api/stock request for T37
    Then the persisted record for T37 has serial_number equal to "SN-T37"

  # T40 – NULL batch_number preserved in GET /api/stock list
  Scenario: T40 GET /api/stock list returns explicit null for batch_number when not set
    Given a stock record seeded with a uuid-suffixed sku and NULL batch_number for T40
    When the client fetches GET /api/stock
    Then the list response contains a row for T40 where batch_number is explicitly null

  # T41 – NULL serial_number preserved in GET /api/stock list
  Scenario: T41 GET /api/stock list returns explicit null for serial_number when not set
    Given a stock record seeded with a uuid-suffixed sku and NULL serial_number for T41
    When the client fetches GET /api/stock
    Then the list response contains a row for T41 where serial_number is explicitly null
