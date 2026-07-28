"""StockService -- business rules: upsert-on-collision, quantity >= 0."""

from sqlalchemy.orm import Session

from app.models.stock_record import StockRecord
from app.repositories.stock_repository import StockRepository


class StockService:
    def __init__(self, db: Session) -> None:
        self._repo = StockRepository(db)

    def list_by_location(self, location: str) -> list[StockRecord]:
        """Return all stock records for the given location (empty list if none)."""
        return self._repo.list_by_location(location)

    def get_sku_detail(self, sku: str) -> list[StockRecord]:
        """Return all stock records for the given SKU across locations."""
        return self._repo.list_by_sku(sku)

    def file_stock(
        self, sku: str, location: str, quantity: int, inventory_code: str
    ) -> StockRecord:
        """Upsert a stock record. Quantity must be >= 0 (enforced before persist)."""
        if quantity < 0:
            raise ValueError("quantity must be >= 0")

        existing = self._repo.get_by_sku_location(sku, location)
        if existing is not None:
            return self._repo.update(existing, quantity, inventory_code)

        record = StockRecord(
            sku=sku,
            location=location,
            quantity=quantity,
            inventory_code=inventory_code,
        )
        return self._repo.save(record)
