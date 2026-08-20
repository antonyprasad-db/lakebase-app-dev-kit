# Test list: F1-stock-visibility
Ordered for: design-momentum

- [x] T1: The boundary layer (app/routes/) does not import the database session object  (AC1-file-new-stock-record)
- [x] T2: The service layer (app/services/) contains no ORM imports  (AC1-file-new-stock-record)
- [x] T3: The boundary layer (app/routes/) contains no ORM imports  (AC1-file-new-stock-record)
- [x] T4: Database connection configuration is read exclusively from environment variables  (AC1-file-new-stock-record)
- [x] T5: Downgrading then upgrading the stock_records migration recreates the table with all columns and constraints present in the real branch database  (AC1-file-new-stock-record)
- [x] T6: Inserting a row with a NULL sku, location, or quantity into stock_records raises a NOT NULL constraint violation in the real branch database  (AC1-file-new-stock-record)
- [x] T7: Inserting two rows with the same (sku, location) into stock_records raises a unique constraint violation in the real branch database  (AC2-refile-updates-in-place)
- [x] T8: Inserting a row with a negative quantity into stock_records raises a CHECK constraint violation in the real branch database  (AC3-reject-negative-quantity)
- [x] T9: POST a valid new (SKU, location) pair with quantity and tracking code returns success and the record can be read back with exactly those values  (AC1-file-new-stock-record)
- [x] T10: POST a payload missing the SKU field returns an HTTP error whose response body names the SKU field  (AC1-file-new-stock-record)
- [x] T11: POST a payload with a blank tracking code field returns an HTTP error whose response body names the tracking code field  (AC1-file-new-stock-record)
- [x] T12: The service layer rejects a negative quantity write before it reaches the repository  (AC3-reject-negative-quantity)
- [x] T13: POST a second filing for an existing (SKU, location) pair with a different quantity returns success and the record's quantity reflects the new value  (AC2-refile-updates-in-place)
- [x] T14: After a second filing for an existing (SKU, location) pair, exactly one record exists for that pair in the store  (AC2-refile-updates-in-place)
- [x] T15: POST a filing with a negative quantity is rejected with a response message that names the quantity field  (AC3-reject-negative-quantity)
- [x] T16: POST a filing with a negative quantity leaves no record created or changed in the store  (AC3-reject-negative-quantity)

## Deferred / skipped
- (none)
