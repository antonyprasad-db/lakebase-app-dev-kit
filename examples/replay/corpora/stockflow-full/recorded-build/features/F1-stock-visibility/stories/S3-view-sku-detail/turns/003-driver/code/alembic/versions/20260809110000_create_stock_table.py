"""create_stock_table

Revision ID: 20260809110000
Revises:
Create Date: 2026-08-09 11:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260809110000"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stock",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sku", sa.String(length=255), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("inventory_code", sa.String(length=255), nullable=True),
        sa.CheckConstraint("quantity >= 0", name="ck_stock_quantity"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku", "location", name="uq_stock_sku_location"),
    )


def downgrade() -> None:
    op.drop_table("stock")
