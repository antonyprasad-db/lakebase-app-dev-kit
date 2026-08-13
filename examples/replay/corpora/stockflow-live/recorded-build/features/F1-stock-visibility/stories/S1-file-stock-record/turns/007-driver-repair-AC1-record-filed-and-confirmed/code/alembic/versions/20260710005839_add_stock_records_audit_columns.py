"""add stock records audit columns

Revision ID: 20260710005839
Revises: 20260710005729
Create Date: 2026-07-09 19:58:40.106154
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260710005839'
down_revision: Union[str, None] = '20260710005729'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stock_records",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.add_column(
        "stock_records",
        sa.Column("actor", sa.String(length=255), nullable=False, server_default="system"),
    )


def downgrade() -> None:
    op.drop_column("stock_records", "actor")
    op.drop_column("stock_records", "created_at")
