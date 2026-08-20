"""SQLAlchemy models for F1-stock-visibility."""

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class StockRecord(Base):
    """A filed stock level: one row per (sku, location) pair."""

    __tablename__ = "stock_records"
    __table_args__ = (
        UniqueConstraint("sku", "location", name="uq_stock_records_sku_location"),
        CheckConstraint(
            "quantity >= 0", name="ck_stock_records_quantity_non_negative"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    sku: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    tracking_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    batch_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    serial_number: Mapped[str | None] = mapped_column(Text, nullable=True)
