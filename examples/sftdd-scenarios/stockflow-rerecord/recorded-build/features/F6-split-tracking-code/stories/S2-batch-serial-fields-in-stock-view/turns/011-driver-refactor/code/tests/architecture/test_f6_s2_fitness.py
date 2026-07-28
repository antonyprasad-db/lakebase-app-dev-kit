"""Architectural fitness test for F6-S2-batch-serial-fields-in-stock-view.

T16 - AC1: the app/routes stock boundary returns JSON data only and never
           server-rendered HTML (R5 usability contract), verified against the
           response content-type and body.

The stock detail route (GET /api/stock/detail/<sku>) is the S2 boundary under
test. It must return application/json (never text/html), satisfying the React SPA
+ JSON API split declared in NFR-F6-react-spa and NFR-F6-S2-spa-distinct-fields.
"""

from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]


def test_T16_stock_detail_boundary_returns_json_not_html():
    """T16: GET /api/stock/detail/<sku> returns application/json and never text/html.

    The route must exist (a 404 is also a failure). The Content-Type must be
    application/json. The response body must be parseable as JSON, not HTML.

    This goes RED until the Driver updates the stock detail boundary to emit
    batch_number and serial_number (the route currently exists but its response
    model has not been updated for S2).

    More precisely, after S2 the route's Pydantic response model must include
    batch_number and serial_number; we verify the R5 contract (JSON-only boundary)
    here and the field presence is covered by T11.
    """
    from app.main import app  # noqa: PLC0415

    client = TestClient(app)

    # Request the detail endpoint. Any valid-format SKU will trigger the R5 check.
    resp = client.get("/api/stock/detail/fitness-t16-sku")

    # Route must exist.
    assert resp.status_code != 404, (
        "GET /api/stock/detail/<sku> returned 404 -- "
        "the stock detail boundary route does not exist or is not registered"
    )

    content_type = resp.headers.get("content-type", "")

    # Must never be HTML.
    assert "text/html" not in content_type, (
        f"Stock detail boundary returned HTML (Content-Type: {content_type!r}); "
        "the boundary must return JSON only (renders_via: react, R5/NFR-F6-react-spa)"
    )

    # Must be JSON.
    assert "application/json" in content_type, (
        f"Stock detail boundary Content-Type is {content_type!r}; expected application/json "
        "(R5 usability contract: the server never renders HTML for a SPA+JSON-API boundary)"
    )

    # Body must be parseable JSON (not an HTML fragment masquerading as a 200).
    try:
        body = resp.json()
    except Exception as exc:
        raise AssertionError(
            f"Stock detail boundary response body is not valid JSON: {exc}\n"
            f"Raw body (first 200 chars): {resp.text[:200]!r}"
        ) from exc

    # The JSON payload must not contain any HTML markers.
    body_text = resp.text
    assert "<html" not in body_text.lower(), (
        "Stock detail boundary response contains '<html' -- "
        "server is rendering HTML inside a JSON response (R5 violation)"
    )
    assert "<!doctype" not in body_text.lower(), (
        "Stock detail boundary response contains '<!doctype' -- "
        "server is rendering an HTML document (R5 violation)"
    )
