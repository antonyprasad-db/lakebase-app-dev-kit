# S1: Perform batch and serial schema migration

As a system,
I want the stock table schema to be refactored with batch_number and serial_number as first-class columns,
so that batch and serial are stored separately and independently addressable.

## Scope

Create and run an Alembic migration that:
- Adds batch_number and serial_number columns to the stock table
- Backfills both columns from the existing inventory_code by parsing the hyphen-delimited format
- Sets batch_number and serial_number to NULL for any codes that do not parse cleanly
- Surfaces an integrity probe showing the count of nonconforming rows
- Drops the inventory_code column once integrity is verified
- Provides a reversible down migration that reconstructs inventory_code
