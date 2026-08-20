"""Business logic for filing stock records. ORM-free (delegates to the repository)."""

from app.repositories.stock import StockRepository


class NegativeQuantityError(ValueError):
    """Raised when a filing would drive the stored quantity below zero (AC3)."""


def list_stock_records(repository=None) -> list[dict]:
    """Return all filed stock records (NFR-F1-7 home table listing)."""
    if repository is None:
        repository = StockRepository()
    return repository.list_all()


def get_sku_detail(sku: str, repository=None) -> list[dict]:
    """Return every stock record for a SKU, one object per location (S3)."""
    if repository is None:
        repository = StockRepository()
    return repository.list_by_sku(sku)


def file_stock_record(
    sku: str,
    location: str,
    quantity: int,
    tracking_code: str | None = None,
    batch_number: str | None = None,
    serial_number: str | None = None,
    repository=None,
) -> dict:
    """File a stock record, upserting on the (sku, location) pair.

    Guards the no-negative-stock invariant (NFR-F1-2) BEFORE the write reaches
    the repository, so an invalid filing never persists. F6 accepts the split
    batch_number/serial_number fields.
    """
    if quantity < 0:
        raise NegativeQuantityError(
            f"quantity must be zero or greater; got {quantity}"
        )
    if repository is None:
        repository = StockRepository()
    return repository.upsert(
        sku=sku,
        location=location,
        quantity=quantity,
        tracking_code=tracking_code,
        batch_number=batch_number,
        serial_number=serial_number,
    )
