"""Service: business logic for filing and retrieving stock records."""

from app.repositories.stock_repository import upsert_stock_record, get_stock_record


def file_stock(db, sku: str, location: str, quantity: int, inventory_code: str) -> dict:
    """Validate and persist a stock record. Raises ValueError on invalid input."""
    if quantity < 0:
        raise ValueError("quantity must be >= 0 (NFR-F1-2: stock levels never go below zero)")
    return upsert_stock_record(db, sku, location, quantity, inventory_code)


def retrieve_stock(db, sku: str, location: str) -> dict | None:
    """Return the stock record for (sku, location) or None."""
    return get_stock_record(db, sku, location)
