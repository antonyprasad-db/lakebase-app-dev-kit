Feature: Batch and serial fields in stock view

  # T11 - AC1-distinct-labelled-fields (boundary payload)
  Scenario: stock detail payload carries batch_number and serial_number as two distinct fields for a populated row
    Given a stock record with batch number and serial number is seeded on the branch DB
    When the operator requests the stock detail for that SKU
    Then the response payload carries batch_number and serial_number as two distinct fields

  # T13 - AC2-empty-field-shows-none-yet (boundary payload)
  Scenario: stock detail payload emits JSON null for unpopulated batch_number and serial_number
    Given a stock record with null batch_number and null serial_number is seeded on the branch DB
    When the operator requests the stock detail for that SKU
    Then the response payload emits null for both batch_number and serial_number

  # T15 - AC3-combined-code-no-longer-shown (boundary payload)
  Scenario: stock detail payload contains no inventory_code key
    Given a stock record with batch number and serial number is seeded on the branch DB
    When the operator requests the stock detail for that SKU
    Then the response payload contains no inventory_code key
