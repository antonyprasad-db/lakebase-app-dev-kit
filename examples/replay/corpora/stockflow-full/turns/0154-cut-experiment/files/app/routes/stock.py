"""Stock API boundary — validates input, delegates to service, returns JSON."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.deps import get_db
from app.services import stock as stock_service

router = APIRouter(prefix="/api/stock", tags=["stock"])


class StockIn(BaseModel):
    sku: str
    location: str
    quantity: int
    par_level: Optional[int] = None

    @field_validator("quantity")
    @classmethod
    def quantity_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("quantity must be >= 0")
        return v


class StockOut(BaseModel):
    id: int
    sku: str
    location: str
    quantity: int
    par_level: Optional[int] = None
    batch_number: Optional[str] = None
    serial_number: Optional[str] = None

    model_config = {"from_attributes": True}


@router.post("", status_code=201)
def file_stock(payload: StockIn, db=Depends(get_db)) -> StockOut:
    """Create or update a stock record (upsert on sku+location)."""
    try:
        record = stock_service.file_stock(
            sku=payload.sku,
            location=payload.location,
            quantity=payload.quantity,
            par_level=payload.par_level,
            db=db,
        )
    except stock_service.StockValidationError as exc:
        raise HTTPException(status_code=422, detail={exc.field: str(exc)})
    return StockOut.model_validate(record)


@router.get("", response_model=list[StockOut])
def list_stock(db=Depends(get_db)):
    """Return all stock records as a JSON array."""
    return stock_service.list_stock(db=db)


@router.get("/{sku}", response_model=list[StockOut])
def get_sku_detail(sku: str, db=Depends(get_db)):
    """Return all stock records for a given SKU as a JSON array."""
    return stock_service.list_by_sku(sku=sku, db=db)


@router.get("/{sku}/{location}")
def get_stock(sku: str, location: str, db=Depends(get_db)) -> StockOut:
    """Retrieve a stock record by SKU and location."""
    record = stock_service.get_stock(sku=sku, location=location, db=db)
    if record is None:
        raise HTTPException(status_code=404, detail="Stock record not found")
    return StockOut.model_validate(record)
