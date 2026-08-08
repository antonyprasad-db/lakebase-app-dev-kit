"""StockRecord persistence. The ONLY layer that touches the ORM/session."""

from sqlalchemy.orm import Session

from app.models.stock_record import StockRecord


class StockRepository:
    def __init__(self, db: Session):
        self._db = db

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
        inventory_code: str,
        actor: str,
    ) -> StockRecord:
        record = self.get_by_sku_location(sku, location)
        if record is None:
            record = StockRecord(
                sku=sku,
                location=location,
                quantity=quantity,
                inventory_code=inventory_code,
                actor=actor,
            )
            self._db.add(record)
        else:
            record.quantity = quantity
            record.inventory_code = inventory_code
        self._db.commit()
        self._db.refresh(record)
        return record
