"""Persistence layer for stock records. The ONLY layer that touches the ORM."""

from sqlalchemy.dialects.postgresql import insert

from app.database import SessionLocal
from app.models import StockRecord


class StockRepository:
    """Reads and writes stock_records via the ORM.

    Owns its own session lifecycle so the boundary and service layers never
    touch the DB session (keeps the layering fitness tests green).
    """

    def upsert(self, sku: str, location: str, quantity: int, tracking_code: str) -> dict:
        """Insert a stock record, or update quantity/tracking_code in place on a
        (sku, location) collision via the PI1 unique constraint (AC2)."""
        session = SessionLocal()
        try:
            stmt = insert(StockRecord).values(
                sku=sku,
                location=location,
                quantity=quantity,
                tracking_code=tracking_code,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["sku", "location"],
                set_={
                    "quantity": stmt.excluded.quantity,
                    "tracking_code": stmt.excluded.tracking_code,
                },
            )
            session.execute(stmt)
            session.commit()
            return {
                "sku": sku,
                "location": location,
                "quantity": quantity,
                "tracking_code": tracking_code,
            }
        finally:
            session.close()
