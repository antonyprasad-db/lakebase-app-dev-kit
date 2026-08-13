Feature: S1 File Stock

  # T1 - AC1-file-stock-record
  Scenario: Filing a stock level durably persists a stock_records row
    Given a unique SKU suffixed with a uuid and a warehouse location
    When I post the stock level with a quantity and inventory_code to the file-stock endpoint
    Then the branch DB contains exactly one stock_records row capturing that sku, location, quantity, and inventory_code

  # T2 - AC2-retrieve-stock-record
  Scenario: Retrieving a previously filed stock record reads back stored values exactly
    Given a stock record previously filed under a unique uuid-suffixed sku and location
    When I retrieve that stock record via the read endpoint
    Then the response contains the exact quantity and inventory_code that were filed

  # T3 - AC3-collision-resolved-at-write
  Scenario: Filing stock a second time for the same sku and location updates in place
    Given a stock record already filed under a unique uuid-suffixed sku and location
    When I file stock again for that same sku and location pair with a new quantity
    Then exactly one stock_records row exists for that pair with the updated quantity and no error is surfaced
