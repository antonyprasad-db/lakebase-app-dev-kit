"""SQLAlchemy models."""

from sqlalchemy import Column, String, Integer, CheckConstraint, UniqueConstraint, DateTime
from sqlalchemy.sql import func

from app.database import Base


class StockRecord(Base):
    __tablename__ = "stock_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(255), nullable=False)
    location = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False)
    inventory_code = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("sku", "location", name="uq_stock_records_sku_location"),
        CheckConstraint("quantity >= 0", name="ck_stock_records_quantity_non_negative"),
    )
