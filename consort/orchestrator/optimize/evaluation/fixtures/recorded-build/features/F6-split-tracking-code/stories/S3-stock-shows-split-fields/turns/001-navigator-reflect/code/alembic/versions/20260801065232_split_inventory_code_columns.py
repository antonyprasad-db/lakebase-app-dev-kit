"""split_inventory_code_columns

Revision ID: 20260801065232
Revises: 20260801033642
Create Date: 2026-08-01 08:52:33.247618

Additive expand/contract migration (NFR-F6-6):
  - expand : add batch_number + serial_number (nullable), backfill from inventory_code
  - contract: drop inventory_code after backfill

Backfill rule (NFR-F6-1, NFR-F6-3):
  inventory_code must match /<seg>-<batch>-<serial>/  (exactly two dashes, three segments).
  "A12-B7-S001" -> batch_number="B7", serial_number="S001".
  Non-conforming codes (wrong segment count, empty, NULL) -> both columns stay NULL
  (NFR-F6-3: no silent drop).

location is NEVER touched (NFR-F6-2).

Downgrade (NFR-F6-4): reconstruct inventory_code as '<location>-<batch>-<serial>'
where batch and serial are available; NULL rows get a placeholder so the NOT NULL
constraint from the original table can be satisfied.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '20260801065232'
down_revision: Union[str, None] = '20260801033642'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- expand: add new columns (nullable so existing rows pass constraint check) ---
    op.add_column("stock_records", sa.Column("batch_number", sa.String(255), nullable=True))
    op.add_column("stock_records", sa.Column("serial_number", sa.String(255), nullable=True))

    # --- backfill: parse conforming inventory_code values ---
    # Pattern: exactly three dash-separated segments; segments 2+3 become batch+serial.
    # Non-conforming rows are left with NULL (NFR-F6-1, NFR-F6-3).
    op.execute(
        sa.text(
            """
            UPDATE stock_records
            SET
                batch_number  = split_part(inventory_code, '-', 2),
                serial_number = split_part(inventory_code, '-', 3)
            WHERE
                -- exactly two dashes means three segments (the conforming format)
                length(inventory_code) - length(replace(inventory_code, '-', '')) = 2
                AND length(trim(split_part(inventory_code, '-', 2))) > 0
                AND length(trim(split_part(inventory_code, '-', 3))) > 0
            """
        )
    )

    # --- contract: drop the old combined column ---
    op.drop_column("stock_records", "inventory_code")


def downgrade() -> None:
    # --- expand: re-add inventory_code (nullable first for the backfill) ---
    op.add_column(
        "stock_records",
        sa.Column("inventory_code", sa.String(255), nullable=True),
    )

    # --- backfill: reconstruct from canonical location + batch + serial ---
    # Rows that had conforming codes get location-batch-serial reconstructed.
    # Rows with NULL batch/serial (were nonconforming) get location as placeholder
    # so the NOT NULL constraint can be restored.
    op.execute(
        sa.text(
            """
            UPDATE stock_records
            SET inventory_code =
                CASE
                    WHEN batch_number IS NOT NULL AND serial_number IS NOT NULL
                    THEN location || '-' || batch_number || '-' || serial_number
                    ELSE location
                END
            """
        )
    )

    # Restore NOT NULL constraint (matches the original schema).
    op.alter_column("stock_records", "inventory_code", nullable=False)

    # --- contract: drop split columns ---
    op.drop_column("stock_records", "serial_number")
    op.drop_column("stock_records", "batch_number")
