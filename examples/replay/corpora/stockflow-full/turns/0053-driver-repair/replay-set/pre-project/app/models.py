"""SQLAlchemy models."""

from sqlalchemy import CheckConstraint, Column, Integer, String, UniqueConstraint

from app.database import Base


class Stock(Base):
    __tablename__ = "stock"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(255), nullable=False)
    location = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False)
    inventory_code = Column(String(255), nullable=True)
    par_level = Column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("sku", "location", name="uq_stock_sku_location"),
        CheckConstraint("quantity >= 0", name="ck_stock_quantity"),
    )
