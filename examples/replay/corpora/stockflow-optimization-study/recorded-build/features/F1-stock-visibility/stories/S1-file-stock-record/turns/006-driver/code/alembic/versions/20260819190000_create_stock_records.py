"""create stock_records

Revision ID: 20260819190000
Revises:
Create Date: 2026-08-19 19:00:00.000000

Creates the stock_records table with its persistence invariants:
  PI1 - UNIQUE (sku, location)          uq_stock_records_sku_location
  PI2 - NOT NULL sku, location, quantity
  PI3 - CHECK (quantity >= 0)           ck_stock_records_quantity_non_negative

This initial migration CREATES the table; downgrade cleanly drops it (PI4).
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260819190000"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stock_records",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("sku", sa.Text(), nullable=False),
        sa.Column("location", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("tracking_code", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku", "location", name="uq_stock_records_sku_location"),
        sa.CheckConstraint(
            "quantity >= 0", name="ck_stock_records_quantity_non_negative"
        ),
    )


def downgrade() -> None:
    op.drop_table("stock_records")
