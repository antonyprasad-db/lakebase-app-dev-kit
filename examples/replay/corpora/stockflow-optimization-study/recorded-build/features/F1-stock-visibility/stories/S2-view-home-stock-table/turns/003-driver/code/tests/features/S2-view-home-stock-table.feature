Feature: View home stock table

  Scenario: T17 - GET /stock returns one JSON object per seeded record
    Given one or more stock records seeded with unique per-run keys
    When I GET /stock
    Then the response is a JSON array with one object per seeded record
    And each object carries sku, location, and quantity fields

  Scenario: T21 - GET /stock with no records returns empty array
    Given no stock records exist for the test run keys
    When I GET /stock
    Then the response is an empty JSON array
