"""Stock record API boundary. Validates input, delegates to StockService, and
renders JSON only (renders_via: react , no server-rendered HTML). Never
touches the DB session or ORM directly.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.database import get_db
from app.repositories.stock_repository import StockRepository
from app.services.stock_service import StockService, StockValidationError

router = APIRouter()


class StockRecordIn(BaseModel):
    sku: str
    location: str
    quantity: int
    inventory_code: str


def _get_stock_service(db=Depends(get_db)) -> StockService:
    return StockService(StockRepository(db))


def _to_dict(record) -> dict:
    return {
        "sku": record.sku,
        "location": record.location,
        "quantity": record.quantity,
        "inventory_code": record.inventory_code,
    }


def _to_detail_dict(record) -> dict:
    par_level = record.par_level
    return {
        **_to_dict(record),
        "par_level": par_level,
        "par_level_display": "Not tracked" if par_level is None else str(par_level),
    }


@router.post("/api/stock-records", status_code=201)
def file_stock_record(payload: StockRecordIn, service: StockService = Depends(_get_stock_service)):
    try:
        record = service.file_stock_record(
            sku=payload.sku,
            location=payload.location,
            quantity=payload.quantity,
            inventory_code=payload.inventory_code,
        )
    except StockValidationError as exc:
        return JSONResponse(
            status_code=400,
            content={"field": exc.field, "message": exc.message},
        )
    return _to_dict(record)


@router.get("/api/stock-records")
def list_stock_records(
    location: str | None = None, service: StockService = Depends(_get_stock_service)
):
    records = service.list_stock_records(location=location)
    body: dict = {"records": [_to_dict(record) for record in records]}
    if not records:
        body["message"] = "No stock at this location"
    return body


@router.get("/api/stock-records/{sku}")
def get_stock_records_for_sku(sku: str, service: StockService = Depends(_get_stock_service)):
    records = service.list_stock_records_for_sku(sku)
    return {"records": [_to_detail_dict(record) for record in records]}


@router.get("/api/stock-records/{sku}/{location}")
def get_stock_record(sku: str, location: str, service: StockService = Depends(_get_stock_service)):
    record = service.get_stock_record(sku, location)
    if record is None:
        raise HTTPException(status_code=404, detail="stock record not found")
    return _to_dict(record)
