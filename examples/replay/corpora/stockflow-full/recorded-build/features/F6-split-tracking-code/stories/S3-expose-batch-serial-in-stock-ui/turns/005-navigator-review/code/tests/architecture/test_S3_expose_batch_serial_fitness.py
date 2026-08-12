"""Architectural fitness tests for S3-expose-batch-serial-in-stock-ui (T36, T48, T55).

T36 – NFR-F6-spa-json-boundary: the stock API boundary (StockOut) exposes
      batch_number and serial_number as distinct JSON fields; the routes module
      returns no server-rendered HTML (renders_via: react, JSON boundary only).
T48 – real-branch-DB null handling: GET /api/stock/{sku}/{location} returns
      batch_number as JSON null (key present, value null) when the DB column is
      NULL — not omitted, not an error.
T55 – no combined code in StockOut: the API response model must NOT expose
      inventory_code; only the discrete batch_number and serial_number fields
      carry tracking data.

All DB-touching tests run against the real paired-branch database
via DATABASE_URL (no mocks, no in-memory substitute).
"""

import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# T36 – NFR-F6-spa-json-boundary: StockOut exposes batch/serial; no HTML
# ---------------------------------------------------------------------------


def test_detail_api_boundary_returns_batch_and_serial_as_distinct_json_fields():
    """T36: The StockOut model (the API boundary surface) must declare
    batch_number and serial_number as distinct, explicitly listed fields
    (NFR-F6-spa-json-boundary).  The routes module must return JSON via
    Pydantic — no TemplateResponse (server-rendered HTML is forbidden on
    this boundary; renders_via is react).
    """
    from app.routes.stock import StockOut  # type: ignore[import]

    fields = StockOut.model_fields

    assert "batch_number" in fields, (
        "StockOut must declare batch_number as a distinct top-level field "
        "(NFR-F6-spa-json-boundary).  Add it to the StockOut Pydantic model."
    )
    assert "serial_number" in fields, (
        "StockOut must declare serial_number as a distinct top-level field "
        "(NFR-F6-spa-json-boundary).  Add it to the StockOut Pydantic model."
    )

    # The boundary must be JSON-only; no TemplateResponse.
    routes_src = (PROJECT_ROOT / "app" / "routes" / "stock.py").read_text()
    assert "TemplateResponse" not in routes_src, (
        "app/routes/stock.py must NOT use TemplateResponse — this boundary is "
        "JSON-only (renders_via: react, NFR-F6-spa-json-boundary)."
    )


# ---------------------------------------------------------------------------
# Shared fixture
# ---------------------------------------------------------------------------


@pytest.fixture()
def _api_client():
    from app.main import app  # import here to avoid circular at module scope

    return TestClient(app)


# ---------------------------------------------------------------------------
# T48 – real-branch DB: batch_number returned as JSON null when column NULL
# ---------------------------------------------------------------------------


def test_detail_api_returns_batch_number_as_json_null_when_column_is_null(
    _api_client, db_session
):
    """T48: GET /api/stock/{sku}/{location} must include batch_number in the
    JSON response as null (key present, value null) when the DB column is NULL.
    The key must NOT be absent and the endpoint must NOT error.
    Runs against the real paired-branch database (DATABASE_URL from env).
    """
    run_id = uuid.uuid4().hex[:10].upper()
    sku = f"SKU-T48-{run_id}"
    location = f"LOC-T48-{run_id}"

    # Idempotent seed: DELETE → INSERT with NULL batch_number.
    db_session.execute(
        sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
        {"sku": sku, "loc": location},
    )
    db_session.commit()
    db_session.execute(
        sa.text(
            "INSERT INTO stock (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :loc, 1, NULL, NULL)"
        ),
        {"sku": sku, "loc": location},
    )
    db_session.commit()

    resp = _api_client.get(f"/api/stock/{sku}/{location}")
    assert resp.status_code == 200, (
        f"Expected 200 from detail endpoint, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert "batch_number" in data, (
        "batch_number must be present in the detail response as JSON null when the "
        "DB column is NULL — the key must NOT be omitted.  "
        f"Got keys: {list(data.keys())!r}"
    )
    assert data["batch_number"] is None, (
        f"batch_number must be JSON null (not {data['batch_number']!r}) when the "
        "DB column is NULL."
    )


# ---------------------------------------------------------------------------
# T55 – StockOut must not expose inventory_code
# ---------------------------------------------------------------------------


def test_stock_api_response_model_has_no_inventory_code_field():
    """T55: StockOut must NOT declare inventory_code.  The combined tracking
    code has been replaced by the discrete batch_number and serial_number fields
    (AC4-combined-code-no-longer-displayed).  Only those two fields carry
    tracking data in the API payload.
    """
    from app.routes.stock import StockOut  # type: ignore[import]

    fields = StockOut.model_fields
    assert "inventory_code" not in fields, (
        "StockOut must NOT expose inventory_code — the combined code has been "
        "retired in favour of batch_number + serial_number (AC4).  "
        f"Current fields: {list(fields.keys())!r}"
    )
