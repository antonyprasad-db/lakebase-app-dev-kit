"""add par level to stock records

Revision ID: 20260710015046
Revises: 20260710005839
Create Date: 2026-07-09 20:50:46.464528
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260710015046'
down_revision: Union[str, None] = '20260710005839'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stock_records",
        sa.Column("par_level", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stock_records", "par_level")
