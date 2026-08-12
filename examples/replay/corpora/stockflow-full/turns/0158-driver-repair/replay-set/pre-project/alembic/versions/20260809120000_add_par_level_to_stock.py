"""add_par_level_to_stock

Revision ID: 20260809120000
Revises: 20260809110000
Create Date: 2026-08-09 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260809120000"
down_revision: Union[str, None] = "20260809110000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("stock", sa.Column("par_level", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("stock", "par_level")
