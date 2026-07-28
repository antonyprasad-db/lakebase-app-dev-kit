"""add_tracking_code_to_stock_records

Revision ID: 20260727220143
Revises: 20260727202444
Create Date: 2026-07-28 00:01:44.235593
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260727220143'
down_revision: Union[str, None] = '20260727202444'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stock_records",
        sa.Column("tracking_code", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stock_records", "tracking_code")
