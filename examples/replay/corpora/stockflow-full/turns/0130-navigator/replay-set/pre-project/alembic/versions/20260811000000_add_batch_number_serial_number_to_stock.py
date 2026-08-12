"""add_batch_number_serial_number_to_stock

Revision ID: 20260811000000
Revises: 20260809120000
Create Date: 2026-08-11 00:00:00.000000

Additive migration: adds batch_number and serial_number as nullable TEXT columns
to the stock table and backfills them from inventory_code by splitting on '-'
(format: <location>-<batch>-<serial>).  Rows whose inventory_code does not match
the expected two-delimiter pattern are left NULL per AC3 (non-conforming codes
are not guessed or dropped).  The existing location and inventory_code columns
are preserved unchanged.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260811000000"
down_revision: Union[str, None] = "20260809120000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("stock", sa.Column("batch_number", sa.String(length=255), nullable=True))
    op.add_column("stock", sa.Column("serial_number", sa.String(length=255), nullable=True))

    # Backfill: inventory_code format is "<location>-<batch_number>-<serial_number>".
    # Split by the FIRST two occurrences of '-' after the location segment.
    # Because location itself may contain '-', we use the fact that the code is
    # "<location>-<batch>-<serial>" and the location value is already stored in
    # the location column — so we strip the leading "<location>-" prefix once and
    # then split the remainder on '-' to get batch and serial.
    # For rows whose code does not start with "<location>-" or has no further '-',
    # both columns stay NULL (non-conforming, per AC3).
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
            """
        )
    )


def downgrade() -> None:
    op.drop_column("stock", "serial_number")
    op.drop_column("stock", "batch_number")
