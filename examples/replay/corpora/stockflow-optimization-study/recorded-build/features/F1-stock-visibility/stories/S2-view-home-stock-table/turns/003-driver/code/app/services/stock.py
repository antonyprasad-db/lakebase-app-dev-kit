"""Business logic for filing stock records. ORM-free (delegates to the repository)."""

from app.repositories.stock import StockRepository


class NegativeQuantityError(ValueError):
    """Raised when a filing would drive the stored quantity below zero (AC3)."""


def list_stock_records(repository=None) -> list[dict]:
    """Return all stock records for the home table (NFR-F1-7)."""
    if repository is None:
        repository = StockRepository()
    return repository.list_all()


def file_stock_record(
    sku: str,
    location: str,
    quantity: int,
    tracking_code: str,
    repository=None,
) -> dict:
    """File a stock record, upserting on the (sku, location) pair.

    Guards the no-negative-stock invariant (NFR-F1-2) BEFORE the write reaches
    the repository, so an invalid filing never persists.
    """
    if quantity < 0:
        raise NegativeQuantityError(
            f"quantity must be zero or greater; got {quantity}"
        )
    if repository is None:
        repository = StockRepository()
    return repository.upsert(
        sku=sku, location=location, quantity=quantity, tracking_code=tracking_code
    )
