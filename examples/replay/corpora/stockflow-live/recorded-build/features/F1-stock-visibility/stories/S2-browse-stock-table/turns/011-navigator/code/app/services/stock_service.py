"""Stock business logic: create-or-update on the (sku, location) key,
non-negative floor enforcement, and audit stamping (created_at/actor).
Never touches the ORM/session directly; delegates all persistence to
StockRepository.
"""

from app.models.stock_record import StockRecord
from app.repositories.stock_repository import StockRepository

# AuthN/AuthZ is explicitly out of bounds for V1 (architecture.md); the actor
# audit field is stamped with this placeholder until identity exists.
_DEFAULT_ACTOR = "system"


class StockValidationError(Exception):
    """A field-named validation failure, raised by the service and rendered
    as an inline, field-named error by the boundary layer."""

    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field
        self.message = message


class StockService:
    def __init__(self, repository: StockRepository, actor: str = _DEFAULT_ACTOR):
        self._repository = repository
        self._actor = actor

    def file_stock_record(
        self, sku: str, location: str, quantity: int, inventory_code: str
    ) -> StockRecord:
        if quantity is None or quantity < 0:
            raise StockValidationError("quantity", "quantity must be >= 0")
        return self._repository.upsert(
            sku=sku,
            location=location,
            quantity=quantity,
            inventory_code=inventory_code,
            actor=self._actor,
        )

    def get_stock_record(self, sku: str, location: str) -> StockRecord | None:
        return self._repository.get_by_sku_location(sku, location)
