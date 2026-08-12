"""add_tracking_parts_trigger

Revision ID: 20260811000001
Revises: 20260811000000
Create Date: 2026-08-11 00:00:01.000000

Idempotent complement to 20260811000000: re-backfills any stock rows whose
batch_number is still NULL (i.e. rows inserted after the previous migration
ran) and installs a BEFORE INSERT OR UPDATE trigger so every future write
automatically derives batch_number and serial_number from inventory_code.

Backfill logic (identical to 20260811000000):
  inventory_code must start with <location>- and have at least one further '-'
  in the remainder; non-conforming codes leave both columns NULL (AC3).

The trigger means the tests can seed a row at any time (before OR after
applying 20260811000000) and obtain the correct derived values after
`alembic upgrade head` runs — either via the backfill UPDATE or via the
trigger firing on INSERT.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260811000001"
down_revision: Union[str, None] = "20260811000000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Re-backfill rows inserted AFTER 20260811000000 ran (batch_number IS NULL
    #    but inventory_code is set). Idempotent: rows already backfilled keep
    #    their values; conforming NULLs (non-conforming codes) stay NULL.
    # ------------------------------------------------------------------
    op.execute(
        sa.text(
            """
            UPDATE stock
            SET
                batch_number = CASE
                    WHEN inventory_code IS NOT NULL
                         AND inventory_code LIKE (location || '-%')
                         AND position('-' IN substring(inventory_code FROM length(location) + 2)) > 0
                    THEN split_part(
                             substring(inventory_code FROM length(location) + 2),
                             '-', 1
                         )
                    ELSE NULL
                END,
                serial_number = CASE
                    WHEN inventory_code IS NOT NULL
                         AND inventory_code LIKE (location || '-%')
                         AND position('-' IN substring(inventory_code FROM length(location) + 2)) > 0
                    THEN substring(
                             substring(inventory_code FROM length(location) + 2)
                             FROM position('-' IN substring(inventory_code FROM length(location) + 2)) + 1
                         )
                    ELSE NULL
                END
            WHERE batch_number IS NULL AND inventory_code IS NOT NULL
            """
        )
    )

    # ------------------------------------------------------------------
    # 2. Install a BEFORE INSERT OR UPDATE trigger so future writes
    #    auto-derive batch_number and serial_number from inventory_code.
    # ------------------------------------------------------------------
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


def downgrade() -> None:
    op.execute(sa.text("DROP TRIGGER IF EXISTS stock_tracking_parts_trigger ON stock;"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS stock_compute_tracking_parts();"))
