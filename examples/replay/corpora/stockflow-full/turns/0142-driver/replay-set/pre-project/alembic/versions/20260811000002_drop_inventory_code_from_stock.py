"""drop_inventory_code_from_stock

Revision ID: 20260811000002
Revises: 20260811000001
Create Date: 2026-08-11 00:00:02.000000

S2 drop migration: removes the legacy inventory_code column from the stock
table now that batch_number and serial_number are the canonical tracking fields
(S1 backfill + trigger migration 20260811000000/20260811000001).

Steps (upgrade):
  1. Drop the BEFORE INSERT OR UPDATE trigger that derived batch_number and
     serial_number from inventory_code (the trigger references NEW.inventory_code;
     it must be dropped before the column is removed).
  2. Drop the trigger function stock_compute_tracking_parts().
  3. DROP COLUMN inventory_code.

Downgrade restores the schema to its 20260811000001 state:
  1. Re-add inventory_code as a nullable TEXT column.
  2. Re-derive inventory_code from location + batch_number + serial_number for
     rows where both tracking parts are non-NULL (best-effort; rows with
     nonconforming / NULL parts stay NULL).
  3. Re-create the trigger function and trigger so downstream downgrades work.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260811000002"
down_revision: Union[str, None] = "20260811000001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Remove the trigger (references NEW.inventory_code; must go first).
    op.execute(sa.text("DROP TRIGGER IF EXISTS stock_tracking_parts_trigger ON stock;"))

    # 2. Remove the trigger function.
    op.execute(sa.text("DROP FUNCTION IF EXISTS stock_compute_tracking_parts();"))

    # 3. Drop the legacy combined-code column.
    op.drop_column("stock", "inventory_code")


def downgrade() -> None:
    # 1. Restore the column (nullable; original data is unrecoverable).
    op.add_column("stock", sa.Column("inventory_code", sa.String(length=255), nullable=True))

    # 2. Best-effort re-derivation: rebuild inventory_code from location +
    #    batch_number + serial_number for rows where both parts are present.
    op.execute(
        sa.text(
            """
            UPDATE stock
            SET inventory_code = location || '-' || batch_number || '-' || serial_number
            WHERE batch_number IS NOT NULL AND serial_number IS NOT NULL
            """
        )
    )

    # 3. Re-create the trigger function and trigger (restores 20260811000001 state).
    op.execute(
        sa.text(
            """
            CREATE OR REPLACE FUNCTION stock_compute_tracking_parts()
            RETURNS TRIGGER AS $$
            DECLARE
                remainder TEXT;
            BEGIN
                IF NEW.inventory_code IS NOT NULL
                   AND NEW.location IS NOT NULL
                   AND NEW.inventory_code LIKE (NEW.location || '-%') THEN
                    remainder := substring(NEW.inventory_code FROM length(NEW.location) + 2);
                    IF position('-' IN remainder) > 0 THEN
                        NEW.batch_number := split_part(remainder, '-', 1);
                        NEW.serial_number := substring(remainder FROM position('-' IN remainder) + 1);
                    ELSE
                        NEW.batch_number := NULL;
                        NEW.serial_number := NULL;
                    END IF;
                ELSE
                    NEW.batch_number := NULL;
                    NEW.serial_number := NULL;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
    )

    op.execute(sa.text("DROP TRIGGER IF EXISTS stock_tracking_parts_trigger ON stock;"))
    op.execute(
        sa.text(
            """
            CREATE TRIGGER stock_tracking_parts_trigger
            BEFORE INSERT OR UPDATE ON stock
            FOR EACH ROW EXECUTE FUNCTION stock_compute_tracking_parts();
            """
        )
    )
