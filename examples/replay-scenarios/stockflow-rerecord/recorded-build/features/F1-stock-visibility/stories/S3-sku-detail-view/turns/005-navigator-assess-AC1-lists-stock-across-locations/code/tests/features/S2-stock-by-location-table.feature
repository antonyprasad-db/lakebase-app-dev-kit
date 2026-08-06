Feature: S2 Stock By Location Table

  # T18 - AC1-table-lists-stock-by-location
  Scenario: Reading stock by location returns one entry per seeded row
    Given two stock records seeded at a unique uuid-suffixed location
    When I request the stock list for that seeded location
    Then the response is a JSON collection with one entry per seeded row carrying sku, location, and quantity

  # T22 - AC3-empty-location-state
  Scenario: Reading a location with no stock returns an empty collection with success status
    Given a unique uuid-suffixed location with no seeded stock records
    When I request the stock list for that empty location
    Then the response is an empty JSON collection with HTTP 200
