"""Architectural fitness test for S2-stock-by-location-table.

T18 - AC1: the stock READ boundary (GET /api/stock) returns a JSON payload and
           never server-rendered HTML; boundary renders_via react (NFR5).
"""

from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[2]


def test_T18_stock_list_boundary_returns_json_not_html():
    """T18: GET /api/stock returns application/json and never text/html.

    The route may not exist yet (this goes RED until the Driver creates it).
    A 404 is also a failure: the route is required to exist and return JSON.
    """
    from app.main import app  # noqa: PLC0415

    client = TestClient(app)
    # Request the stock listing with a location query param.
    resp = client.get("/api/stock?location=fitness-loc-t18")

    assert resp.status_code != 404, (
        "GET /api/stock returned 404 -- the listing route has not been created yet"
    )
    content_type = resp.headers.get("content-type", "")
    assert "text/html" not in content_type, (
        f"Stock read boundary returned HTML (Content-Type: {content_type}); "
        "the stock-by-location listing must return JSON (renders_via: react, NFR5)"
    )
    assert "application/json" in content_type, (
        f"Stock read boundary Content-Type is '{content_type}'; expected application/json"
    )
