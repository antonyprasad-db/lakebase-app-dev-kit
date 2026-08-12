"""Stock service — business logic layer; no ORM or session imports."""

from typing import Optional

from app import repositories as repos


class StockValidationError(ValueError):
    """Raised when stock input fails business-rule validation."""

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        super().__init__(message)


def file_stock(
    sku: str,
    location: str,
    quantity: int,
    par_level: Optional[int] = None,
    *,
    db=None,
):
    """File (create or update) a stock record.

    Validates before touching the DB. Raises StockValidationError on
    invalid input so the boundary layer can surface a field-named response.
    """
    if quantity < 0:
        raise StockValidationError("quantity", "quantity must be >= 0")

    if db is not None:
        return repos.stock.upsert_stock(
            db,
            sku=sku,
            location=location,
            quantity=quantity,
            par_level=par_level,
        )


def get_stock(sku: str, location: str, *, db=None):
    """Retrieve a stock record by (sku, location)."""
    if db is not None:
        return repos.stock.get_stock(db, sku=sku, location=location)
    return None


def get_stock_by_id(id: int, *, db=None):
    """Retrieve a stock record by numeric ID."""
    if db is not None:
        return repos.stock.get_stock_by_id(db, id=id)
    return None


def list_stock(*, db=None) -> list:
    """Return all stock records as a list."""
    if db is not None:
        return repos.stock.list_stock(db)
    return []


def list_by_sku(sku: str, *, db=None) -> list:
    """Return all stock records for a given SKU."""
    if db is not None:
        return repos.stock.list_by_sku(db, sku=sku)
    return []
