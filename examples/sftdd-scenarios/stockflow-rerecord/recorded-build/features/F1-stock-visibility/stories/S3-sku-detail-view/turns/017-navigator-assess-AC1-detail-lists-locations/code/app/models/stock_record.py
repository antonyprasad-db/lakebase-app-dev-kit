"""StockRecord ORM model."""

from sqlalchemy import Column, Integer, String, CheckConstraint, UniqueConstraint

from app.database import Base


class StockRecord(Base):
    __tablename__ = "stock_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(255), nullable=False)
    location = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False)
    inventory_code = Column(String(255), nullable=False)
    tracking_code = Column(String(255), nullable=True)

    __table_args__ = (
        UniqueConstraint("sku", "location", name="uq_stock_records_sku_location"),
        CheckConstraint("quantity >= 0", name="ck_stock_records_quantity_non_negative"),
    )
