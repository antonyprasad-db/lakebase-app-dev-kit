# S1-split-columns-migration

**As a** inventory manager
**I want to** have `batch_number` and `serial_number` added as their own columns, backfilled by splitting the existing `inventory_code` on the hyphen delimiter (segment 2 = batch, segment 3 = serial), the combined column dropped, and a count of nonconforming rows surfaced before the change is accepted
**So that** batch and serial become first-class facts with no silent data loss and every sprint-1 stock row survives the migration.

Scope: the forward (up) migration and its integrity probe. Codes that do not parse as location-batch-serial leave `batch_number` and `serial_number` NULL rather than being guessed or dropped. `location` stays canonical and is not recreated.
