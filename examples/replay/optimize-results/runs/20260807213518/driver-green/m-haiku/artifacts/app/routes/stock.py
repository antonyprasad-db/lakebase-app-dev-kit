"""Boundary: HTTP routes for stock filing and retrieval. Returns JSON only."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.dependencies import open_session
from app.services.stock_service import (
    file_stock,
    retrieve_stock,
    list_stock_by_location,
    get_sku_detail,
)

router = APIRouter(prefix="/api/stock")


class StockFileRequest(BaseModel):
    sku: str
    location: str
    quantity: int
    batch_number: str | None = None
    serial_number: str | None = None

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
            batch_number=payload.batch_number,
            serial_number=payload.serial_number,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return record


@router.get("/location/{location}")
def list_stock_by_location_endpoint(location: str, db=Depends(open_session)):
    return list_stock_by_location(db, location)


@router.get("/sku/{sku}")
def get_sku_detail_endpoint(sku: str, db=Depends(open_session)):
    return get_sku_detail(db, sku)


@router.get("/{sku}/{location}")
def get_stock_endpoint(sku: str, location: str, db=Depends(open_session)):
    record = retrieve_stock(db, sku, location)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=f"No stock record for sku={sku} location={location}",
        )
    return record
