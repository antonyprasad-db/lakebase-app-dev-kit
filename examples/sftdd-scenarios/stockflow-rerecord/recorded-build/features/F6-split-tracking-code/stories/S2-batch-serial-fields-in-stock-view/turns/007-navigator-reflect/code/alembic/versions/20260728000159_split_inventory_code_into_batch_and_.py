"""split_inventory_code_into_batch_and_serial

Revision ID: 20260728000159
Revises: 20260727220143
Create Date: 2026-07-28 02:02:00.115420

Additive-then-drop: adds batch_number and serial_number, backfills them from
inventory_code (segment[1]=batch, segment[2]=serial; NULL for <2 segments in
batch or <3 in serial), emits an integrity-probe count of nonconforming rows,
then drops inventory_code.

Down: re-adds inventory_code, reconstructs location-batch-serial for conforming
rows, drops batch_number and serial_number.  Reconstruction is lossy for
nonconforming rows (NULL batch/serial); those rows get NULL inventory_code.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260728000159"
down_revision: Union[str, None] = "20260727220143"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Step 1: add the two new columns as nullable.
    op.add_column(
        "stock_records",
        sa.Column("batch_number", sa.String(255), nullable=True),
    )
    op.add_column(
        "stock_records",
        sa.Column("serial_number", sa.String(255), nullable=True),
    )

    # Step 2: backfill by parsing inventory_code with '-' as delimiter.
    # PostgreSQL split_part is 1-indexed and returns '' for out-of-range positions.
    # NULLIF('', ...) converts the empty-string sentinel back to NULL.
    # 3+ segments: batch = split_part(ic, '-', 2), serial = split_part(ic, '-', 3)
    # 2 segments:  batch = split_part(ic, '-', 2), serial = NULL
    # 1 segment:   batch = NULL, serial = NULL  (nonconforming)
    op.execute(
        sa.text(
            "UPDATE stock_records SET"
            "  batch_number  = NULLIF(split_part(inventory_code, '-', 2), ''),"
            "  serial_number = NULLIF(split_part(inventory_code, '-', 3), '')"
        )
    )

    # Step 3: integrity probe -- count and report nonconforming rows.
    conn = op.get_bind()
    nonconforming = conn.execute(
        sa.text("SELECT COUNT(*) FROM stock_records WHERE batch_number IS NULL")
    ).scalar()

    import logging
    logging.getLogger("alembic").info(
        "F6 integrity probe: %d nonconforming rows (batch_number IS NULL after backfill)",
        nonconforming,
    )

    # Step 4: drop the combined column.
    op.drop_column("stock_records", "inventory_code")


def downgrade() -> None:
    # Step 1: re-add inventory_code as nullable (some rows cannot be reconstructed).
    op.add_column(
        "stock_records",
        sa.Column("inventory_code", sa.String(255), nullable=True),
    )

    # Step 2: reconstruct inventory_code from location-batch-serial for rows
    # where both batch and serial are present.
    op.execute(
        sa.text(
            "UPDATE stock_records SET"
            "  inventory_code = location || '-' || batch_number || '-' || serial_number"
            " WHERE batch_number IS NOT NULL AND serial_number IS NOT NULL"
        )
    )

    # Rows with batch but no serial (2-segment original codes): partial reconstruction.
    op.execute(
        sa.text(
            "UPDATE stock_records SET"
            "  inventory_code = location || '-' || batch_number"
            " WHERE batch_number IS NOT NULL AND serial_number IS NULL"
            "   AND inventory_code IS NULL"
        )
    )

    # Rows with NULL batch remain with NULL inventory_code (lossy; original
    # nonconforming codes cannot be recovered).

    # Step 3: drop the split columns.
    op.drop_column("stock_records", "serial_number")
    op.drop_column("stock_records", "batch_number")
