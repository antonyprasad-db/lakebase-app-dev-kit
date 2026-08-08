"""StockRecord persistence. The ONLY layer that touches the ORM/session.

The split-tracking-code migration (F6-S1) retired the combined
inventory_code column in favor of batch_number/serial_number. Callers
(service/routes) now use batch_number/serial_number directly; this layer
no longer bridges to a retired combined-code contract.
"""

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.stock_record import StockRecord


class StockRepository:
    def __init__(self, db: Session):
        self._db = db

    def count_nonconforming(self) -> int:
        """Count rows whose tracking code did not cleanly split into
        batch_number/serial_number (either segment missing)."""
        return (
            self._db.query(StockRecord)
            .filter(or_(StockRecord.batch_number.is_(None), StockRecord.serial_number.is_(None)))
            .count()
        )

    def get_by_sku_location(self, sku: str, location: str) -> StockRecord | None:
        return (
            self._db.query(StockRecord)
            .filter(StockRecord.sku == sku, StockRecord.location == location)
            .one_or_none()
        )

    def list_all(self, location: str | None = None) -> list[StockRecord]:
        query = self._db.query(StockRecord)
        if location is not None:
            query = query.filter(StockRecord.location == location)
        return query.order_by(StockRecord.sku, StockRecord.location).all()

    def list_by_sku(self, sku: str) -> list[StockRecord]:
        return (
            self._db.query(StockRecord)
            .filter(StockRecord.sku == sku)
            .order_by(StockRecord.location)
            .all()
        )

    def upsert(
        self,
        sku: str,
        location: str,
        quantity: int,
        batch_number: str | None,
        serial_number: str | None,
        actor: str,
    ) -> StockRecord:
        record = (
            self._db.query(StockRecord)
            .filter(StockRecord.sku == sku, StockRecord.location == location)
            .one_or_none()
        )
        if record is None:
            record = StockRecord(
                sku=sku,
                location=location,
                quantity=quantity,
                batch_number=batch_number,
                serial_number=serial_number,
                actor=actor,
            )
            self._db.add(record)
        else:
            record.quantity = quantity
            record.batch_number = batch_number
            record.serial_number = serial_number
        self._db.commit()
        self._db.refresh(record)
        return record
