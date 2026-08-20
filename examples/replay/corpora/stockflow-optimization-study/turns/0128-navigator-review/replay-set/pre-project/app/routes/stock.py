"""JSON API boundary for filing stock records (NFR-F1-5). Validates then delegates."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services.stock import (
    NegativeQuantityError,
    file_stock_record,
    get_sku_detail,
    list_stock_records,
)

router = APIRouter(prefix="/api/stock", tags=["stock"])


@router.get("")
def list_stock():
    """Return one JSON object per stock record (NFR-F1-7); [] when empty."""
    return JSONResponse(status_code=200, content=list_stock_records())


class StockPayload(BaseModel):
    """Filing payload for the SPA JSON API with split batch/serial fields (F6)."""

    sku: str | None = None
    location: str | None = None
    quantity: int | None = None
    batch_number: str | None = None
    serial_number: str | None = None


@router.post("")
def create_stock(payload: "StockPayload"):
    """Persist a stock record with separate batch_number/serial_number (F6/S3)."""
    for field in ("sku", "location"):
        if _blank(getattr(payload, field)):
            return JSONResponse(
                status_code=422,
                content={
                    "detail": f"The '{field}' field is required and must not be blank."
                },
            )
    if payload.quantity is None:
        return JSONResponse(
            status_code=422,
            content={"detail": "The 'quantity' field is required."},
        )

    try:
        record = file_stock_record(
            sku=payload.sku,
            location=payload.location,
            quantity=payload.quantity,
            batch_number=payload.batch_number,
            serial_number=payload.serial_number,
        )
    except NegativeQuantityError as exc:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    return JSONResponse(status_code=201, content=record)


@router.get("/{sku}")
def sku_detail(sku: str):
    """Return one JSON object per location for a SKU (S3); [] when unknown."""
    return JSONResponse(status_code=200, content=get_sku_detail(sku))

# Required string fields that must be present and non-blank on a filing.
_REQUIRED_TEXT_FIELDS = ("sku", "location", "tracking_code")


class FilingPayload(BaseModel):
    sku: str | None = None
    location: str | None = None
    quantity: int | None = None
    tracking_code: str | None = None


def _blank(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


@router.post("/file")
def file_stock(payload: FilingPayload):
    # Named validation messages, applied at the boundary before any persistence
    # (NFR-F1-6): each message identifies the specific offending field.
    for field in _REQUIRED_TEXT_FIELDS:
        if _blank(getattr(payload, field)):
            return JSONResponse(
                status_code=422,
                content={
                    "detail": f"The '{field}' field is required and must not be blank."
                },
            )
    if payload.quantity is None:
        return JSONResponse(
            status_code=422,
            content={"detail": "The 'quantity' field is required."},
        )

    try:
        record = file_stock_record(
            sku=payload.sku,
            location=payload.location,
            quantity=payload.quantity,
            tracking_code=payload.tracking_code,
        )
    except NegativeQuantityError as exc:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    return JSONResponse(status_code=201, content=record)
