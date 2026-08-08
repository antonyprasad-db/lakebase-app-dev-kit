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
        self,
        sku: str,
        location: str,
        quantity: int,
        batch_number: str | None,
        serial_number: str | None,
    ) -> dict:
        if quantity is None or quantity < 0:
            raise StockValidationError("quantity", "quantity must be >= 0")
        record = self._repository.upsert(
            sku=sku,
            location=location,
            quantity=quantity,
            batch_number=batch_number,
            serial_number=serial_number,
            actor=self._actor,
        )
        return self._to_dto(record)

    def get_stock_record(self, sku: str, location: str) -> dict | None:
        record = self._repository.get_by_sku_location(sku, location)
        return self._to_dto(record) if record is not None else None

    def list_stock_records(self, location: str | None = None) -> list[dict]:
        return [self._to_dto(record) for record in self._repository.list_all(location=location)]

    def list_stock_records_for_sku(self, sku: str) -> list[dict]:
        return [self._to_detail_dto(record) for record in self._repository.list_by_sku(sku)]

    def _to_dto(self, record: StockRecord) -> dict:
        """The detail/list DTO's batch_number/serial_number field mapping
        (S3-view-batch-and-serial, AC1): lives only here, reading from
        StockRecord (fetched by StockRepository), never in the api-boundary
        or the client."""
        return {
            "sku": record.sku,
            "location": record.location,
            "quantity": record.quantity,
            "batch_number": record.batch_number,
            "serial_number": record.serial_number,
        }

    def _to_detail_dto(self, record: StockRecord) -> dict:
        par_level = record.par_level
        return {
            **self._to_dto(record),
            "par_level": par_level,
            "par_level_display": "Not tracked" if par_level is None else str(par_level),
        }

    def count_nonconforming_rows(self) -> int:
        """Integrity probe (F6-S2): explicit count of stock rows whose
        tracking code did not cleanly split into batch_number/serial_number,
        so a clean migration reads as a positive zero, never a missing value."""
        return self._repository.count_nonconforming()
