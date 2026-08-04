"""Service: business logic for filing and retrieving stock records."""

from app.repositories.stock_repository import (
    upsert_stock_record,
    get_stock_record,
    get_stock_records_by_location,
    get_stock_records_by_sku,
)


def file_stock(
    db,
    sku: str,
    location: str,
    quantity: int,
    batch_number: str | None = None,
    serial_number: str | None = None,
) -> dict:
    """Validate and persist a stock record. Raises ValueError on invalid input."""
    if quantity < 0:
        raise ValueError("quantity must be >= 0 (NFR-F1-2: stock levels never go below zero)")
    return upsert_stock_record(db, sku, location, quantity, batch_number, serial_number)


def retrieve_stock(db, sku: str, location: str) -> dict | None:
    """Return the stock record for (sku, location) or None."""
    return get_stock_record(db, sku, location)


def list_stock_by_location(db, location: str) -> list[dict]:
    """Return all stock records for the given location."""
    return get_stock_records_by_location(db, location)


def get_sku_detail(db, sku: str) -> list[dict]:
    """Return all stock records for the given SKU across all locations."""
    return get_stock_records_by_sku(db, sku)
