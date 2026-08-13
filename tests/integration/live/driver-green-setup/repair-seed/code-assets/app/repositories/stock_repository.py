"""Repository: all persistence logic for stock_records lives here."""

from sqlalchemy.orm import Session
from sqlalchemy import text


def upsert_stock_record(
    db: Session,
    sku: str,
    location: str,
    quantity: int,
    batch_number: str | None = None,
    serial_number: str | None = None,
) -> dict:
    """Insert or update a stock_records row atomically.

    On conflict (sku, location) updates quantity and tracking columns while
    preserving created_at (immutable audit timestamp, NFR-F1-1).
    """
    db.execute(
        text(
            """
            INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)
            VALUES (:sku, :location, :quantity, :batch_number, :serial_number)
            ON CONFLICT (sku, location)
            DO UPDATE SET
                quantity      = EXCLUDED.quantity,
                batch_number  = EXCLUDED.batch_number,
                serial_number = EXCLUDED.serial_number,
                updated_at    = now()
            """
        ),
        {
            "sku": sku,
            "location": location,
            "quantity": quantity,
            "batch_number": batch_number,
            "serial_number": serial_number,
        },
    )
    db.commit()
    row = db.execute(
        text(
            "SELECT sku, location, quantity, batch_number, serial_number, "
            "created_at, updated_at "
            "FROM stock_records WHERE sku = :sku AND location = :location"
        ),
        {"sku": sku, "location": location},
    ).fetchone()
    return {
        "sku": row.sku,
        "location": row.location,
        "quantity": row.quantity,
        "batch_number": row.batch_number,
        "serial_number": row.serial_number,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def get_stock_records_by_location(db: Session, location: str) -> list[dict]:
    """Return all stock records for the given location."""
    rows = db.execute(
        text(
            "SELECT sku, location, quantity, batch_number, serial_number, "
            "created_at, updated_at "
            "FROM stock_records WHERE location = :location"
        ),
        {"location": location},
    ).fetchall()
    return [
        {
            "sku": row.sku,
            "location": row.location,
            "quantity": row.quantity,
            "batch_number": row.batch_number,
            "serial_number": row.serial_number,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in rows
    ]


def get_stock_records_by_sku(db: Session, sku: str) -> list[dict]:
    """Return all stock records for the given SKU across all locations."""
    rows = db.execute(
        text(
            "SELECT sku, location, quantity, batch_number, serial_number, "
            "created_at, updated_at "
            "FROM stock_records WHERE sku = :sku"
        ),
        {"sku": sku},
    ).fetchall()
    return [
        {
            "sku": row.sku,
            "location": row.location,
            "quantity": row.quantity,
            "batch_number": row.batch_number,
            "serial_number": row.serial_number,
            "par_level": None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in rows
    ]


def get_stock_record(db: Session, sku: str, location: str) -> dict | None:
    """Return the stock record for (sku, location) or None if not found."""
    row = db.execute(
        text(
            "SELECT sku, location, quantity, batch_number, serial_number, "
            "created_at, updated_at "
            "FROM stock_records WHERE sku = :sku AND location = :location"
        ),
        {"sku": sku, "location": location},
    ).fetchone()
    if row is None:
        return None
    return {
        "sku": row.sku,
        "location": row.location,
        "quantity": row.quantity,
        "batch_number": row.batch_number,
        "serial_number": row.serial_number,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
