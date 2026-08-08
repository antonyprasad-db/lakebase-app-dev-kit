"""create stock records table

Revision ID: 20260710005729
Revises: 
Create Date: 2026-07-09 19:57:29.798614
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260710005729'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stock_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sku", sa.String(length=255), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("inventory_code", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku", "location", name="uq_stock_records_sku_location"),
        sa.CheckConstraint("quantity >= 0", name="ck_stock_records_quantity_non_negative"),
    )


def downgrade() -> None:
    op.drop_table("stock_records")
