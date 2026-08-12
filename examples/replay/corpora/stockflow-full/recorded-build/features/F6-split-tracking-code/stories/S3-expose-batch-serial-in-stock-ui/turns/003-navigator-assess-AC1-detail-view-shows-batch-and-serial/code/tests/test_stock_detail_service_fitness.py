"""Fitness test for S3-view-sku-detail: stock service detail contract (T43).

T43 – AC3: the stock service detail method returns par_level as Python None
(not omitted from the result dict, not raised as an exception) when no
par_level is recorded for the queried SKU/location.

Runs against the real paired-branch database (DATABASE_URL from env); no mocks.
"""

import uuid

import pytest
import sqlalchemy as sa


def test_stock_service_detail_returns_par_level_as_none(db_session, api_client):
    """T43: service detail method preserves par_level=None — not omitted, not raised.

    Files a stock record with no par_level via POST, then calls the service
    detail method (or list_by_sku) and asserts the returned object exposes
    par_level as None (not a missing key, not an exception).
    """
    # Own the state: seed a fresh per-run-unique row via the API.
    run_id = uuid.uuid4().hex[:10].upper()
    sku = f"SKU-S3F-{run_id}"
    location = f"LOC-S3F-{run_id}"

    db_session.execute(
        sa.text("DELETE FROM stock WHERE sku = :sku AND location = :loc"),
        {"sku": sku, "loc": location},
    )
    db_session.commit()

    resp = api_client.post("/api/stock", json={"sku": sku, "location": location, "quantity": 4})
    assert resp.status_code in (200, 201), (
        f"Setup POST failed: {resp.status_code} {resp.text}"
    )

    try:
        from app.services import stock as svc  # type: ignore[import]
    except (ImportError, ModuleNotFoundError) as exc:
        pytest.fail(
            f"app.services.stock not importable — Driver must create it. ({exc})"
        )

    # Prefer a dedicated detail/list_by_sku method; fall back to get_stock.
    detail_fn = getattr(svc, "list_by_sku", None) or getattr(svc, "get_stock_detail", None)
    if detail_fn is not None:
        # list_by_sku returns a list of records for the SKU.
        result = detail_fn(sku=sku, db=db_session)
        assert isinstance(result, list), (
            f"list_by_sku must return a list, got {type(result).__name__!r}"
        )
        assert len(result) >= 1, (
            f"list_by_sku must return at least one row for {sku!r}, got: {result!r}"
        )
        row = result[0]
    else:
        # Fall back to get_stock if the dedicated method is not yet created.
        get_fn = getattr(svc, "get_stock", None)
        assert callable(get_fn), (
            "app.services.stock must expose list_by_sku or get_stock (T43)."
        )
        row = get_fn(sku=sku, location=location, db=db_session)
        assert row is not None, (
            f"get_stock must return the filed row for ({sku!r}, {location!r}), got None"
        )

    # The row must expose par_level — as an attribute or dict key — and its value
    # must be None (not missing, not raised).
    if isinstance(row, dict):
        assert "par_level" in row, (
            f"Result dict must contain 'par_level' key (not omitted). Got keys: {list(row)!r}"
        )
        par_value = row["par_level"]
    else:
        assert hasattr(row, "par_level"), (
            f"Result object must have a 'par_level' attribute (not omitted). "
            f"Got attrs: {[a for a in dir(row) if not a.startswith('_')]!r}"
        )
        par_value = row.par_level

    assert par_value is None, (
        f"par_level must be Python None when not recorded, got {par_value!r}"
    )
