"""split inventory code into batch and serial

Revision ID: 20260710031210
Revises: 20260710015046
Create Date: 2026-07-09 22:12:10.471198
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260710031210'
down_revision: Union[str, None] = '20260710015046'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Additive-then-retire (NFR-F6-durability-migration-no-loss): add the split
    # columns first, backfill them from the existing combined inventory_code,
    # and only then retire inventory_code, all inside this one revision's
    # transaction so a mid-migration failure leaves the pre-migration schema
    # and rows completely intact (PI2 atomic).
    op.add_column("stock_records", sa.Column("batch_number", sa.String(length=255), nullable=True))
    op.add_column("stock_records", sa.Column("serial_number", sa.String(length=255), nullable=True))

    # A conforming code is exactly 3 hyphen-delimited segments:
    # <location>-<batch>-<serial>. Anything else (fewer/more segments, a bare
    # word) leaves batch_number/serial_number NULL rather than guessed
    # (AC2/PI-no-invention).
    op.execute(
        """
        UPDATE stock_records
        SET batch_number = split_part(inventory_code, '-', 2),
            serial_number = split_part(inventory_code, '-', 3)
        WHERE array_length(string_to_array(inventory_code, '-'), 1) = 3
        """
    )

    op.drop_column("stock_records", "inventory_code")


def downgrade() -> None:
    # Re-add inventory_code nullable first so the reconstruction backfill can
    # populate it before the NOT NULL constraint (matching the original
    # pre-split schema) is restored.
    op.add_column("stock_records", sa.Column("inventory_code", sa.String(length=255), nullable=True))

    # Reconstruct the combined code from the canonical (unchanged) location
    # plus batch_number/serial_number, mirroring the up-migration's parse
    # (AC5). Rows whose split fields are NULL (a nonconforming original code)
    # reconstruct with an empty segment rather than crashing.
    op.execute(
        """
        UPDATE stock_records
        SET inventory_code = location || '-' || COALESCE(batch_number, '') || '-' || COALESCE(serial_number, '')
        """
    )

    op.alter_column("stock_records", "inventory_code", nullable=False)

    op.drop_column("stock_records", "batch_number")
    op.drop_column("stock_records", "serial_number")
