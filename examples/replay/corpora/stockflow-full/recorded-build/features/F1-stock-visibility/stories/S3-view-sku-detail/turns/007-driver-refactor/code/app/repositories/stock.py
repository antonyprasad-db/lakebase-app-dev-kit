"""Stock repository — the only layer that touches the ORM/session."""

from typing import Optional

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Stock


def upsert_stock(
    db: Session,
    sku: str,
    location: str,
    quantity: int,
    inventory_code: Optional[str] = None,
    par_level: Optional[int] = None,
) -> Stock:
    """Insert or update a stock record by (sku, location) via atomic upsert."""
    stmt = (
        insert(Stock)
        .values(
            sku=sku,
            location=location,
            quantity=quantity,
            inventory_code=inventory_code,
            par_level=par_level,
        )
        .on_conflict_do_update(
            constraint="uq_stock_sku_location",
            set_={
                "quantity": quantity,
                "inventory_code": inventory_code,
                "par_level": par_level,
            },
        )
    )
    db.execute(stmt)
    db.commit()
    return db.query(Stock).filter_by(sku=sku, location=location).one()


def get_stock(db: Session, sku: str, location: str) -> Optional[Stock]:
    """Return the stock record for (sku, location), or None if absent."""
    return db.query(Stock).filter_by(sku=sku, location=location).first()


def list_stock(db: Session) -> list:
    """Return all stock records."""
    return db.query(Stock).all()


def list_by_sku(db: Session, sku: str) -> list:
    """Return all stock records for a given SKU."""
    return db.query(Stock).filter_by(sku=sku).all()
