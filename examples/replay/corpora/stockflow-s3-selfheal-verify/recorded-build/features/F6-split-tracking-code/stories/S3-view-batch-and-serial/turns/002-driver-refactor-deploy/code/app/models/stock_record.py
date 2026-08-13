"""Stock record domain model.

A single-responsibility aggregate: one row per (sku, location) pair,
carrying the quantity on hand and the split batch_number/serial_number
tracking fields (the combined inventory_code has been retired by the
split-tracking-code migration, F6). created_at and actor are audit fields
set by the service and stored immutably by the model (never updated after
insert) per R1.
"""

from sqlalchemy import CheckConstraint, Column, DateTime, Integer, String, UniqueConstraint, func

from app.database import Base


class StockRecord(Base):
    __tablename__ = "stock_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(255), nullable=False)
    location = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False)
    # Nullable: a nonconforming pre-split code has no batch/serial segment
    # (AC2), so both are left NULL rather than guessed.
    batch_number = Column(String(255), nullable=True)
    serial_number = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    # Server-defaulted so direct SQL (fitness/migration tests) that omits actor
    # still satisfies NOT NULL; the service always sets the real actor
    # explicitly on the write path, overriding this fallback.
    actor = Column(String(255), nullable=False, server_default="system")
    # Nullable: a row filed before par tracking existed, or one that simply
    # never had a par level set, has no par level (PI4-migration-reversible).
    par_level = Column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("sku", "location", name="uq_stock_records_sku_location"),
        CheckConstraint("quantity >= 0", name="ck_stock_records_quantity_non_negative"),
    )
