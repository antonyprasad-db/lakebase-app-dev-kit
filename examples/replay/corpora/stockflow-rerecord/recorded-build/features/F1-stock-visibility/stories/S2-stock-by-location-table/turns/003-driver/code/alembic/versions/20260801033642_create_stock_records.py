"""create_stock_records

Revision ID: 20260801033642
Revises:
Create Date: 2026-08-01 05:36:43.167267
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260801033642'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stock_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sku", sa.String(255), nullable=False),
        sa.Column("location", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("inventory_code", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_stock_records"),
        sa.UniqueConstraint("sku", "location", name="uq_stock_records_sku_location"),
        sa.CheckConstraint("quantity >= 0", name="ck_stock_records_quantity_non_negative"),
    )


def downgrade() -> None:
    op.drop_table("stock_records")
