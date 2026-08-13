"""T21 (AC1-split-fields-shown), fitness.

NFR-F6-9: the boundary (app/routes/) renders_via react and returns JSON only.
The stock record response must carry batch_number and serial_number as
separate JSON fields and must NOT be server-rendered HTML, and the boundary
must not embed the opaque combined tracking code.
"""
import os
import uuid

import pytest
from starlette.testclient import TestClient

from app.main import app
from app.db import openBranchDsn  # session factory over the paired branch DB


@pytest.fixture()
def client():
    return TestClient(app)


def _seed_stock_row(sku, location, batch, serial):
    """Idempotent seed keyed on a per-run-unique (sku, location)."""
    engine = openBranchDsn(
        instance=os.environ["LAKEBASE_INSTANCE"],
        branch_id=os.environ["EXPERIMENT_BRANCH_ID"],
    )
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "DELETE FROM stock_records WHERE sku = %s AND location = %s",
            (sku, location),
        )
        conn.exec_driver_sql(
            "INSERT INTO stock_records "
            "(sku, location, quantity, batch_number, serial_number) "
            "VALUES (%s, %s, %s, %s, %s)",
            (sku, location, 5, batch, serial),
        )
    return engine


def test_boundary_returns_json_split_fields_not_html():
    suffix = uuid.uuid4().hex[:8]
    sku = f"SKU-{suffix}"
    location = f"AISLE-{suffix}"
    engine = _seed_stock_row(sku, location, "B7", "S001")

    try:
        resp = TestClient(app).get(f"/stock/{sku}", params={"location": location})
        assert resp.status_code == 200

        # JSON only, never server-rendered HTML
        ctype = resp.headers["content-type"]
        assert "application/json" in ctype, f"expected JSON, got {ctype}"
        assert not resp.text.lstrip().startswith("<"), "boundary must not return HTML"

        body = resp.json()
        # batch_number and serial_number surfaced as SEPARATE JSON fields
        assert body["batch_number"] == "B7"
        assert body["serial_number"] == "S001"
        # the opaque combined tracking code must not be present
        assert "inventory_code" not in body
    finally:
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "DELETE FROM stock_records WHERE sku = %s AND location = %s",
                (sku, location),
            )
