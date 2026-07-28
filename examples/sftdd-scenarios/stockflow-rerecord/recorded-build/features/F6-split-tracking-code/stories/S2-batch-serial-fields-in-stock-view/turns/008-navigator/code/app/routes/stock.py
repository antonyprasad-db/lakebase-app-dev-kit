"""Stock boundary -- HTTP input validation, returns JSON, delegates to service."""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.dependencies import get_session
from app.services.stock_service import StockService

router = APIRouter(prefix="/api/stock", tags=["stock"])


class StockFileRequest(BaseModel):
    sku: str = Field(..., min_length=1)
    location: str = Field(..., min_length=1)
    quantity: int = Field(..., ge=0)


class StockFileResponse(BaseModel):
    id: int
    sku: str
    location: str
    quantity: int


class LocationEntry(BaseModel):
    location: str
    quantity: int
    tracking_code: Optional[str]


class SkuDetailResponse(BaseModel):
    sku: str
    locations: List[LocationEntry]


@router.get("/detail/{sku}", response_model=SkuDetailResponse)
def sku_detail(sku: str, db: Session = Depends(get_session)):
    service = StockService(db)
    records = service.get_sku_detail(sku)
    return SkuDetailResponse(
        sku=sku,
        locations=[
            LocationEntry(
                location=r.location,
                quantity=r.quantity,
                tracking_code=r.tracking_code,
            )
            for r in records
        ],
    )


@router.get("", response_model=List[StockFileResponse])
def list_stock(
    location: str = Query(..., min_length=1),
    db: Session = Depends(get_session),
):
    service = StockService(db)
    records = service.list_by_location(location)
    return [
        StockFileResponse(
            id=r.id,
            sku=r.sku,
            location=r.location,
            quantity=r.quantity,
        )
        for r in records
    ]


@router.post("", status_code=201, response_model=StockFileResponse)
def file_stock(payload: StockFileRequest, db: Session = Depends(get_session)):
    service = StockService(db)
    record = service.file_stock(
        sku=payload.sku,
        location=payload.location,
        quantity=payload.quantity,
    )
    return StockFileResponse(
        id=record.id,
        sku=record.sku,
        location=record.location,
        quantity=record.quantity,
    )
