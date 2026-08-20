Feature: S3 - View SKU Detail

  Scenario: T24 - SKU stocked at two locations returns one object per location
    Given a SKU stocked at two locations seeded with unique per-run keys
    When I GET /api/stock/<sku>
    Then the response contains exactly one JSON object per seeded location each with location and quantity

  Scenario: T25 - SKU detail returns combined tracking code when present
    Given a stock record seeded with a unique per-run key and a non-empty combined tracking code
    When I GET /api/stock/<sku>
    Then the response contains the record with the combined tracking code matching the seeded value

  Scenario: T26 - SKU detail returns null par level when no par level set
    Given a stock record seeded with a unique per-run key and no par level set
    When I GET /api/stock/<sku>
    Then the response contains the record with the par level field absent or null

  Scenario: T27 - Boundary returns null par level not a presentation string
    Given a stock record seeded with a unique per-run key and no par level set
    When I GET /api/stock/<sku>
    Then the par level field in the response is null or absent not a presentation string
