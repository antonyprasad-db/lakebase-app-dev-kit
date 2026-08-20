"""split tracking into batch and serial

Revision ID: 20260819200000
Revises: 20260819190000
Create Date: 2026-08-19 20:00:00.000000

F6 – split-tracking-code. Additive-then-destructive migration over the EXISTING
stock_records table (NFR-F6-7 additive-rollout-safety):

  1. ADD nullable batch_number / serial_number columns (NFR-F6-1: rows survive).
  2. BACKFILL them by splitting a well-formed inventory_code
     ('<location>-<batch>-<serial>', exactly 3 hyphen-delimited segments) into
     its 2nd (batch) and 3rd (serial) segments. Malformed codes leave both NULL
     (no exception).
  3. Emit an INTEGRITY PROBE to the migration log: the COUNT of rows left with a
     NULL batch_number/serial_number, so an operator can review the blast radius
     before the destructive step is accepted (NFR-F6-6 integrity-probe-visibility).
  4. DROP inventory_code — the destructive step, gated behind the probe.

Location stays canonical and is NOT recreated from inventory_code, so the
UNIQUE(sku, location) constraint is untouched (NFR-F6-3). The whole upgrade runs
in a single transaction, so a failure at any step rolls back atomically
(NFR-F6-1). downgrade() re-adds inventory_code and reconstructs it as
'<location>-<batch_number>-<serial_number>'.
"""

import logging

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260819200000"
down_revision = "20260819190000"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")

# A well-formed inventory_code has exactly 3 hyphen-delimited segments:
# <location>-<batch>-<serial>. Only such rows are split; others stay NULL.
_WELL_FORMED = "array_length(string_to_array(inventory_code, '-'), 1) = 3"


def _has_column(bind, column: str) -> bool:
    return bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'stock_records' AND column_name = :col"
        ),
        {"col": column},
    ).fetchone() is not None


def upgrade() -> None:
    bind = op.get_bind()

    op.add_column(
        "stock_records", sa.Column("batch_number", sa.Text(), nullable=True)
    )
    op.add_column(
        "stock_records", sa.Column("serial_number", sa.Text(), nullable=True)
    )

    if _has_column(bind, "inventory_code"):
        # Backfill only well-formed codes; malformed ones stay NULL.
        bind.execute(
            sa.text(
                "UPDATE stock_records SET "
                "batch_number = split_part(inventory_code, '-', 2), "
                "serial_number = split_part(inventory_code, '-', 3) "
                f"WHERE inventory_code IS NOT NULL AND {_WELL_FORMED}"
            )
        )

        # Integrity probe (NFR-F6-6): surface the blast radius before dropping.
        non_conforming = bind.execute(
            sa.text(
                "SELECT COUNT(*) FROM stock_records "
                "WHERE batch_number IS NULL OR serial_number IS NULL"
            )
        ).scalar()
        logger.info(
            "F6 integrity probe: %s stock_records row(s) left with NULL "
            "batch_number/serial_number after backfill.",
            non_conforming,
        )

        # Destructive step, gated behind the probe.
        op.drop_column("stock_records", "inventory_code")


def downgrade() -> None:
    bind = op.get_bind()

    op.add_column(
        "stock_records", sa.Column("inventory_code", sa.Text(), nullable=True)
    )
    # Reconstruct the canonical code from location + the split columns.
    bind.execute(
        sa.text(
            "UPDATE stock_records "
            "SET inventory_code = location || '-' || batch_number || '-' || serial_number "
            "WHERE batch_number IS NOT NULL AND serial_number IS NOT NULL"
        )
    )

    op.drop_column("stock_records", "serial_number")
    op.drop_column("stock_records", "batch_number")
