"""Boundary: HTTP routes for stock filing and retrieval. Returns JSON only."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.dependencies import open_session
from app.services.stock_service import file_stock, retrieve_stock

router = APIRouter(prefix="/api/stock")


class StockFileRequest(BaseModel):
    sku: str
    location: str
    quantity: int
    inventory_code: str

    @field_validator("quantity")
    @classmethod
    def quantity_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("quantity must be >= 0")
        return v


@router.post("", status_code=201)
def file_stock_endpoint(payload: StockFileRequest, db=Depends(open_session)):
    try:
        record = file_stock(
            db,
            sku=payload.sku,
            location=payload.location,
            quantity=payload.quantity,
            inventory_code=payload.inventory_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return record


@router.get("/{sku}/{location}")
def get_stock_endpoint(sku: str, location: str, db=Depends(open_session)):
    record = retrieve_stock(db, sku, location)
    if record is None:
        raise HTTPException(status_code=404, detail=f"No stock record for sku={sku} location={location}")
    return record
