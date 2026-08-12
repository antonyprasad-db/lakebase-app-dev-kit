Feature: View home stock table (S2-view-home-stock-table)

  # T22 – AC3: GET /stock returns empty JSON array when no records
  Scenario: GET /stock returns an empty JSON array when no stock has been filed
    Given no stock records have been filed in the system
    When the client GETs the stock list endpoint
    Then the response is 200 OK with a JSON array
    And the JSON array is empty

  # T21 – AC1: GET /stock returns one object per filed record with sku, location, quantity
  Scenario: GET /stock returns one object per filed stock record with required fields
    Given stock records have been filed with unique per-run keys
    When the client GETs the stock list endpoint
    Then the response is 200 OK with a JSON array
    And the JSON array contains one object per filed record with sku, location, and quantity fields
