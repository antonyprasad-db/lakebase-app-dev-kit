# S2-reversible-down-migration

**As a** inventory manager
**I want to** run the migration's down path to reconstruct a combined `inventory_code` from the canonical `location` plus the split-out `batch_number` and `serial_number`, restoring the pre-split schema
**So that** the schema change is reversible and we can roll back to the combined-code shape without losing data.

Scope: the reverse (down) migration only. Distinct from S1, which builds the forward path and integrity probe.
