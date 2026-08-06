Feature: S3 SKU Detail View

  # T24 - AC1-lists-stock-across-locations
  Scenario: SKU detail returns one entry per seeded location
    Given a unique uuid-suffixed SKU with stock seeded at two distinct locations
    When I request the SKU detail view for that multi-location sku
    Then the response is a JSON list with one entry per seeded location each carrying location and quantity

  # T27 - AC2-shows-tracking-code
  Scenario: SKU detail entries carry the inventory_code
    Given a stock record seeded with a known inventory_code under a unique uuid-suffixed SKU
    When I request the SKU detail view for that tracked sku
    Then each entry in the SKU-detail response carries the matching inventory_code

  # T29 - AC3-par-level-not-tracked
  Scenario: SKU detail maps absent par_level to explicit null
    Given a unique uuid-suffixed SKU whose stock record has no par_level set
    When I request the SKU detail view for that untracked-par sku
    Then the SKU-detail response carries par_level as an explicit null for each entry

  # T31 - AC4-sku-with-no-stock-empty-state
  Scenario: SKU with no stock records returns empty collection with HTTP 200
    Given a unique uuid-suffixed SKU with zero stock records at any location
    When I request the SKU detail view for that sku with no stock
    Then the SKU-detail response is an empty JSON list with HTTP 200
