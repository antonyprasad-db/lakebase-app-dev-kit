Feature: View SKU detail (S3-view-sku-detail)

  # T31 – AC1: GET /stock/<sku> returns all locations for the SKU with correct quantities
  Scenario: GET /stock/<sku> returns a JSON array containing every location for that SKU
    Given a SKU holds stock at two locations with unique per-run keys
    When the client GETs the SKU detail endpoint for that SKU
    Then the response is 200 OK with a JSON array
    And the array contains one entry per location with the correct quantity

  # T32 – AC1: GET /stock/<sku> does not return entries for a different SKU
  Scenario: GET /stock/<sku> returns no entries belonging to a different SKU
    Given two distinct SKUs each hold stock with unique per-run keys
    When the client GETs the SKU detail endpoint for the first SKU
    Then the response is 200 OK with a JSON array
    And the array contains no entries for the second SKU

  # T37 – AC2: GET /stock/<sku> returns batch_number and serial_number exactly as filed
  Scenario: GET /stock/<sku> returns batch_number and serial_number exactly as filed via POST /stock
    Given a SKU holds stock at a location with batch_number and serial_number filed via POST
    When the client GETs the SKU detail endpoint for that SKU
    Then the response is 200 OK with a JSON array
    And each entry in the array carries batch_number and serial_number exactly as filed

  # T39 – AC3: GET /stock/<sku> returns HTTP 200 with par_level null when not recorded
  Scenario: GET /stock/<sku> returns HTTP 200 with par_level equal to null when no par level recorded
    Given a SKU holds stock at a location with no par level recorded
    When the client GETs the SKU detail endpoint for that SKU
    Then the response is 200 OK with a JSON array
    And each entry in the array has par_level equal to null
