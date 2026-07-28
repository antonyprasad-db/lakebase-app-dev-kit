Feature: Stock by location table

  # T13 - AC1-table-lists-stock-rows
  Scenario: stock listing for a location returns one JSON entry per seeded record
    Given 3 stock records are seeded at a unique test location on the branch DB
    When the operator requests the stock listing for that location
    Then the response is a JSON array with one entry per seeded record each carrying sku location and quantity

  # T16 - AC3-empty-state-shown
  Scenario: a location with no stock records returns an empty JSON array not a 404
    Given a unique location with no stock records on the branch DB
    When the operator requests the stock listing for that location
    Then the response status is 200 and the body is an empty JSON array
