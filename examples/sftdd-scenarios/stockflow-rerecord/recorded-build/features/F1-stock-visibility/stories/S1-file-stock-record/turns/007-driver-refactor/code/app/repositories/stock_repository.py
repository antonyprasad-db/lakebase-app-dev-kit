"""StockRepository -- the only layer that touches the ORM session."""

from sqlalchemy.orm import Session

from app.models.stock_record import StockRecord


class StockRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_sku_location(self, sku: str, location: str) -> StockRecord | None:
        return (
            self._db.query(StockRecord)
            .filter(StockRecord.sku == sku, StockRecord.location == location)
            .first()
        )

    def save(self, record: StockRecord) -> StockRecord:
        self._db.add(record)
        self._db.commit()
        self._db.refresh(record)
        return record

    def update(self, record: StockRecord, quantity: int, inventory_code: str) -> StockRecord:
        record.quantity = quantity
        record.inventory_code = inventory_code
        self._db.commit()
        self._db.refresh(record)
        return record
