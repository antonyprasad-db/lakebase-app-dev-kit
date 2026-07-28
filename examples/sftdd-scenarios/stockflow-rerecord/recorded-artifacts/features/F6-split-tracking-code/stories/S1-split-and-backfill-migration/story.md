# S1 - Split and backfill batch/serial, retire the combined code

As the inventory manager,
I want the combined `inventory_code` split into first-class `batch_number` and `serial_number` columns, backfilled from the existing codes and reversibly migrated,
so that batch and serial become separately queryable while every sprint-1 stock row survives the change without silent loss.

Scope (one line): reversible Alembic migration that adds `batch_number`/`serial_number`, backfills them by delimiter-parsing `inventory_code` (segment 2 = batch, segment 3 = serial, non-conforming codes leave both NULL), surfaces an integrity-probe count of nonconforming rows, and drops the combined column; `location` stays canonical and untouched.
