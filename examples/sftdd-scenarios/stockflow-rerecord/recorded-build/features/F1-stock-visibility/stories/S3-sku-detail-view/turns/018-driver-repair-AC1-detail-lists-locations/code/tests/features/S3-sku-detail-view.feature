Feature: SKU detail view

  # T19 - AC1-detail-lists-locations
  Scenario: detail read boundary returns one entry per location for a multi-location SKU
    Given a SKU is seeded at 2 unique locations on the branch DB
    When the operator requests the SKU detail view
    Then the response is JSON with the SKU appearing once and one entry per location each carrying location and quantity

  # T21 - AC2-tracking-code-shown
  Scenario: detail read boundary includes the tracking code when a location entry has one
    Given a stock record with a tracking code is seeded on the branch DB
    When the operator requests the SKU detail view
    Then the response includes that tracking code in the JSON for the location entry

  # T23 - AC3-untracked-detail-explicit
  Scenario: detail read boundary emits tracking_code as null for an untracked entry without erroring
    Given a stock record with a null tracking detail is seeded on the branch DB
    When the operator requests the SKU detail view
    Then the response includes the tracking_code key set to null for that entry
