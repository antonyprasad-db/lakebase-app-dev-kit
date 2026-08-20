# AC4: Integrity probe surfaces the count of non-conforming rows

**Given** a stock table containing both conforming and non-conforming inventory_code values
**When** the migration's integrity probe runs
**Then** it surfaces the count of non-conforming rows (those left with NULL batch_number/serial_number) for review before the change is accepted
