# Test list: F1-stock-visibility
Ordered for: design-momentum

- [x] T1: The routes module (app/routes/) contains no import of SQLAlchemy Session or any ORM construct  (AC1-file-new-stock)
- [x] T2: The services module (app/services/) contains no import of SQLAlchemy Session or any ORM construct  (AC1-file-new-stock)
- [x] T3: DATABASE_URL is read from the environment variable and is not hardcoded anywhere in the application source  (AC1-file-new-stock)
- [x] T4: POST a new SKU/location/quantity creates a stock record and GET returns the same SKU, location, and quantity  (AC1-file-new-stock)
- [x] T5: POST a payload with a negative quantity returns an HTTP error response body that names the offending field  (AC1-file-new-stock)
- [x] T6: POST a payload missing the required sku field returns an HTTP error response body that names the offending field  (AC1-file-new-stock)
- [x] T7: Navigating <App> to the file-stock route renders the file-stock form with a data-testid='sku-input' element  (AC1-file-new-stock)
- [x] T8: Navigating <App> to the file-stock route renders the file-stock form with a data-testid='location-input' element  (AC1-file-new-stock)
- [x] T9: Navigating <App> to the file-stock route renders the file-stock form with a data-testid='quantity-input' element  (AC1-file-new-stock)
- [x] T10: Navigating <App> to the file-stock route renders the file-stock form with a data-testid='file-stock-submit' submit control  (AC1-file-new-stock)
- [x] T11: The stock service rejects a write with a negative quantity value before any database write occurs  (AC1-file-new-stock)
- [x] T12: Inserting two rows with the same (sku, location) pair into the stock table raises a unique-constraint violation on the real branch database  (AC1-file-new-stock)
- [x] T13: Inserting a row with quantity below zero into the stock table raises a check-constraint violation on the real branch database  (AC1-file-new-stock)
- [x] T14: Inserting a row with a NULL sku into the stock table raises a not-null-constraint violation on the real branch database  (AC1-file-new-stock)
- [x] T15: Running the stock table migration downgrade followed immediately by upgrade recreates the stock table with all required columns and constraints on the real branch database  (AC1-file-new-stock)
- [x] T16: GET a stock record filed with a combined inventory_code returns the inventory_code exactly as filed  (AC2-record-carries-inventory-code)
- [x] T17: Navigating <App> to the file-stock route renders the file-stock form with a data-testid='inventory-code-input' element  (AC2-record-carries-inventory-code)
- [x] T18: POST the same SKU/location with a different quantity updates the existing record in place and GET returns exactly one record with the new quantity  (AC3-refile-same-pair-updates-in-place)
- [x] T19: A refile of an existing (sku, location) pair results in exactly one row in the stock table — no duplicate is inserted — verified on the real branch database  (AC3-refile-same-pair-updates-in-place)

## Deferred / skipped
- (none)
