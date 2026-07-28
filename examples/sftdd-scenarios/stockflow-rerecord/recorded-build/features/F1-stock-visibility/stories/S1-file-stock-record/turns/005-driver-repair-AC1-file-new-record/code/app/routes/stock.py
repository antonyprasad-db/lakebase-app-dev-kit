"""Stock boundary -- HTTP input validation, returns JSON, delegates to service."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.dependencies import get_session
from app.services.stock_service import StockService

router = APIRouter(prefix="/api/stock", tags=["stock"])


class StockFileRequest(BaseModel):
    sku: str = Field(..., min_length=1)
    location: str = Field(..., min_length=1)
    quantity: int = Field(..., ge=0)
    inventory_code: str = Field(..., min_length=1)


class StockFileResponse(BaseModel):
    id: int
    sku: str
    location: str
    quantity: int
    inventory_code: str


@router.post("", status_code=201, response_model=StockFileResponse)
def file_stock(payload: StockFileRequest, db: Session = Depends(get_session)):
    service = StockService(db)
    record = service.file_stock(
        sku=payload.sku,
        location=payload.location,
        quantity=payload.quantity,
        inventory_code=payload.inventory_code,
    )
    return StockFileResponse(
        id=record.id,
        sku=record.sku,
        location=record.location,
        quantity=record.quantity,
        inventory_code=record.inventory_code,
    )
