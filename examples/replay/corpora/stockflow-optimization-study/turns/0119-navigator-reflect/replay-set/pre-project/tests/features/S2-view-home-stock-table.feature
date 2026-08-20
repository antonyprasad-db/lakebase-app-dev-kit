Feature: View home stock table

  Scenario: T17 - GET /stock returns one JSON object per seeded record with sku, location, and quantity
    Given two stock records seeded with unique per-run keys for the table listing
    When I GET /api/stock
    Then the response contains one JSON object per seeded record carrying sku, location, and quantity fields

  Scenario: T21 - GET /stock returns an empty JSON array when no stock records exist
    Given all stock records are cleared from the store
    When I GET /api/stock
    Then the response is an empty JSON array
