"""Persistence layer for stock records. The ONLY layer that touches the ORM."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.database import SessionLocal
from app.models import StockRecord


class StockRepository:
    """Reads and writes stock_records via the ORM.

    Owns its own session lifecycle so the boundary and service layers never
    touch the DB session (keeps the layering fitness tests green).
    """

    def list_all(self) -> list[dict]:
        """Return every stock record as a plain dict (sku, location, quantity)."""
        session = SessionLocal()
        try:
            rows = session.execute(select(StockRecord)).scalars().all()
            return [
                {
                    "sku": row.sku,
                    "location": row.location,
                    "quantity": row.quantity,
                    "batch_number": row.batch_number,
                    "serial_number": row.serial_number,
                }
                for row in rows
            ]
        finally:
            session.close()

    def list_by_sku(self, sku: str) -> list[dict]:
        """Return every stock record for one SKU, one dict per location.

        par_level is untracked in the schema, so it surfaces as an explicit
        null rather than a synthesized presentation string (NFR-F1-8)."""
        session = SessionLocal()
        try:
            rows = (
                session.execute(select(StockRecord).where(StockRecord.sku == sku))
                .scalars()
                .all()
            )
            return [
                {
                    "sku": row.sku,
                    "location": row.location,
                    "quantity": row.quantity,
                    "batch_number": row.batch_number,
                    "serial_number": row.serial_number,
                    "par_level": None,
                }
                for row in rows
            ]
        finally:
            session.close()

    def upsert(
        self,
        sku: str,
        location: str,
        quantity: int,
        tracking_code: str | None = None,
        batch_number: str | None = None,
        serial_number: str | None = None,
    ) -> dict:
        """Insert a stock record, or update it in place on a (sku, location)
        collision via the PI1 unique constraint (AC2). F6 persists batch_number
        and serial_number as first-class split fields."""
        session = SessionLocal()
        try:
            stmt = insert(StockRecord).values(
                sku=sku,
                location=location,
                quantity=quantity,
                tracking_code=tracking_code,
                batch_number=batch_number,
                serial_number=serial_number,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["sku", "location"],
                set_={
                    "quantity": stmt.excluded.quantity,
                    "tracking_code": stmt.excluded.tracking_code,
                    "batch_number": stmt.excluded.batch_number,
                    "serial_number": stmt.excluded.serial_number,
                },
            )
            session.execute(stmt)
            session.commit()
            return {
                "sku": sku,
                "location": location,
                "quantity": quantity,
                "batch_number": batch_number,
                "serial_number": serial_number,
            }
        finally:
            session.close()
