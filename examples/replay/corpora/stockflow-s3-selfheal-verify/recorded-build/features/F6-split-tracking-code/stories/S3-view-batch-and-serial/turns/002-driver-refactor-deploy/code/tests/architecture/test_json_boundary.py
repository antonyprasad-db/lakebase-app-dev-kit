"""SPA JSON boundary fitness test (T11): the file-stock API boundary returns a
JSON response, not server-rendered HTML, for the filing confirmation
(architecture.json boundary renders_via: react). Plain architectural check
against the real running app + branch DB, no Gherkin.
"""

from sqlalchemy import text


def test_filing_confirmation_is_json_not_html(client, db_session):
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": "SKU-BOUNDARY"})
    db_session.commit()
    try:
        response = client.post(
            "/api/stock-records",
            json={
                "sku": "SKU-BOUNDARY",
                "location": "Z9",
                "quantity": 1,
                "batch_number": "LOT",
                "serial_number": "BOUNDARY",
            },
        )
        assert response.status_code in (200, 201), response.text
        content_type = response.headers.get("content-type", "")
        assert content_type.startswith("application/json"), (
            f"expected a JSON boundary response, got content-type {content_type!r}; "
            "the boundary must never render server-side HTML (renders_via: react)"
        )
        body_text = response.text.lstrip()
        assert not body_text.startswith("<"), (
            "the filing confirmation body looks like server-rendered HTML, not JSON"
        )
        # A JSON body must round-trip through .json() without error.
        response.json()
    finally:
        db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": "SKU-BOUNDARY"})
        db_session.commit()
