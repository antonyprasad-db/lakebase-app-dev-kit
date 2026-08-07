# F1-stock-visibility: Physical Database Design

## Overview

The F1-stock-visibility feature is a service-backed system for real-time stock tracking across SKU-location pairs. The physical schema realizes a single domain aggregate, `stock_records`, persisted in the `stock_records` table.

## Schema Summary

### Table: `stock_records`

Stores current and historical stock levels indexed by (sku, location) pair.

**Columns:**
- `id` (UUID, NOT NULL, default: `gen_random_uuid()`): Primary key, unique identifier.
- `sku` (VARCHAR(255), NOT NULL): Stock Keeping Unit; part of composite unique key.
- `location` (VARCHAR(255), NOT NULL): Storage location; part of composite unique key.
- `quantity` (INTEGER, NOT NULL, default: `0`): Current stock count; subject to non-negative check.
- `inventory_code` (VARCHAR(255), NOT NULL): Inventory tracking code for audit linkage.
- `created_at` (TIMESTAMP, NOT NULL, default: `now()`): Immutable creation timestamp.
- `created_by` (VARCHAR(255), nullable): Immutable creator identifier.
- `updated_at` (TIMESTAMP, NOT NULL, default: `now()`): Mutable update timestamp.
- `updated_by` (VARCHAR(255), nullable): Mutable updater identifier.

**Constraints:**
- Primary Key: `id`
- Unique: Composite `(sku, location)` ensures at most one record per pair (PI1).
- Check: `quantity >= 0` prevents negative stock (PI3).

**Indexes:**
- `idx_stock_records_sku_location` (UNIQUE on sku, location): Enforces PI1; used for collision detection on upsert.
- `idx_stock_records_sku` (on sku): Supports queries filtered by SKU.
- `idx_stock_records_location` (on location): Supports queries filtered by location.

## Migration Plan

### Story: S1-file-stock

**Kind:** `create_table`

**Changes:**
1. Create `stock_records` table with all columns, primary key, unique composite constraint, and non-negative quantity check.

**Reversibility:**
- Downgrade: `DROP TABLE stock_records CASCADE;`
- No data loss on downgrade (table drop is reversible within a transaction if the downgrade is the only operation in that migration).

**Rationale:**
- This is the foundation table for all stock visibility. Additive-only: no columns removed, no constraints weakened in future stories.
- The composite unique on (sku, location) prevents duplicate records during concurrent writes (NFR-F1-3: R3).
- The quantity check rejects overcommitting writes at the database layer (NFR-F1-2: R2).
- Audit columns (created_at, created_by, updated_at, updated_by) remain immutable post-creation to satisfy NFR-F1-1: R1 data integrity.

## Persistence Invariant Realization

| Invariant ID | Type | Physical Construct | Realized By |
|---|---|---|---|
| **PI1-sku-location-unique** | unique | Composite unique constraint + index | `UNIQUE (sku, location)` on `stock_records` table; enforced at write time. Upsert collisions collapse to a single row. |
| **PI2-quantity-not-null** | not_null | Column constraints | `sku`, `location`, `quantity`, `inventory_code` all declared `NOT NULL`. All four addressing/core fields are always present. |
| **PI3-quantity-non-negative** | check | Database check constraint | `CHECK (quantity >= 0)` on `stock_records.quantity`; enforces R2 (no negative stock, no overcommit stored). Write-time rejection. |
| **PI4-upsert-atomic** | transactional | Implicit database transaction semantics | The ORM repository layer (stock-repository) wraps the read-existing-then-write collision logic in a `BEGIN...COMMIT` transaction. The database ensures isolation; concurrent repeats serialize. |
| **PI5-migration-reversible** | migration_reversible | Alembic reversibility | Initial `create_table` migration is additive. Downgrade drops the table (reversible within a transaction). All prior data created before the migration is preserved in the backward direction if records exist. |

## Design Decisions

1. **UUID Primary Key**: Ensures global uniqueness and allows records to be generated without central coordination (suitable for distributed stock systems).

2. **Composite Unique (sku, location)**: Mirrors R3 (NFR-F1-3); the database enforces the invariant, not the application layer. Concurrent writes to the same pair are serialized by the database.

3. **NOT NULL on Core Fields**: All addressing keys and core values are non-null per PI2, guaranteeing every record is complete and queryable.

4. **CHECK (quantity >= 0)**: Implemented as a database-level constraint per PI3, ensuring R2 (NFR-F1-2) is enforced before any row is stored. This is more robust than application-layer validation alone.

5. **Audit Trail (created_at, created_by, updated_at, updated_by)**: Supports R1 (NFR-F1-1). The created_* fields are immutable post-insert (application responsibility); updated_* fields track changes. Timestamps default to `now()`.

6. **Indexes on sku and location**: Enable efficient queries by single dimension (e.g., "all stock for this location") without scanning the entire table. The composite unique index also serves as a lookup for collision detection.

## Testing Strategy

- **Integration Test (NFR-F1-2: R2)**: Attempt to insert a negative quantity; assert the check constraint rejects it and no row is stored.
- **Integration Test (NFR-F1-3: R3)**: File twice for the same (sku, location); assert exactly one row exists with updated quantity/audit fields.
- **Integration Test (NFR-F1-1: R1)**: Seed records, apply the migration, downgrade, re-apply; assert records survive and audit fields are immutable.
- **Real Branch Requirement (NFR-F1-4: R4)**: All tests run against the paired Lakebase branch with Alembic migrations applied first; no mocks.

## Conformance

All five persistence invariants declared in `architecture.json` are realized by the physical `stock_records` table and its constraints. The migration is additive and reversible. The design is ready for Alembic migration authoring and Test Strategist coverage.
