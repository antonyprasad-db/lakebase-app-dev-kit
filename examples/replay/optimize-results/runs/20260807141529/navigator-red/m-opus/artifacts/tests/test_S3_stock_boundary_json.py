"""S3-stock-shows-split-fields boundary fitness test (T21).

AC1-split-fields-shown / NFR-F6-9: the boundary (app/routes/, renders_via react)
returns the stock record as JSON ONLY, carrying batch_number and serial_number
as SEPARATE fields -- never server-rendered HTML, and never a combined code.

This runs against the real paired Lakebase branch DB (no mock). It OWNS its own
state: it seeds one row under a uuid-suffixed (sku, location) key and cleans it
up in a finally block; it asserts only on that row, never a whole-table total.
"""

import uuid

import sqlalchemy as sa


def _unique_pair() -> tuple[str, str]:
    tag = uuid.uuid4().hex[:12]
    return f"SKU-{tag}", f"LOC-{tag}"


def _cleanup(db_session, sku: str, location: str) -> None:
    try:
        db_session.execute(
            sa.text(
                "DELETE FROM stock_records WHERE sku = :sku AND location = :loc"
            ),
            {"sku": sku, "loc": location},
        )
        db_session.commit()
    except Exception:
        db_session.rollback()


def test_boundary_returns_split_fields_as_json_only(client, db_session):
    """GET /api/stock/{sku}/{location} returns JSON carrying batch_number and
    serial_number as separate fields, and no combined tracking code, as HTML."""
    sku, location = _unique_pair()
    batch = "B7"
    serial = "S001"

    # Seed our own row idempotently against the real branch DB.
    _cleanup(db_session, sku, location)
    db_session.execute(
        sa.text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :loc, :qty, :batch, :serial)"
        ),
        {"sku": sku, "loc": location, "qty": 5, "batch": batch, "serial": serial},
    )
    db_session.commit()

    try:
        resp = client.get(f"/api/stock/{sku}/{location}")

        # JSON only -- never server-rendered HTML.
        assert resp.status_code == 200, resp.text
        content_type = resp.headers.get("content-type", "")
        assert content_type.startswith("application/json"), (
            f"boundary must return JSON, got content-type={content_type!r}"
        )

        body = resp.json()

        # batch_number and serial_number are SEPARATE, first-class fields.
        assert body["batch_number"] == batch, (
            f"expected batch_number={batch!r}, got {body.get('batch_number')!r}"
        )
        assert body["serial_number"] == serial, (
            f"expected serial_number={serial!r}, got {body.get('serial_number')!r}"
        )

        # The combined code contract is gone: no combined/inventory code field,
        # and the raw JSON text carries no HTML markup.
        assert "inventory_code" not in body, (
            f"boundary must not carry a combined inventory_code, got {body!r}"
        )
        assert "<" not in resp.text and "html" not in resp.text.lower(), (
            f"boundary must return JSON only, not HTML: {resp.text[:200]!r}"
        )
    finally:
        _cleanup(db_session, sku, location)
