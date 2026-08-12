"""Fitness test for S2-view-home-stock-table: stock service list_stock contract (T20).

Verifies that the stock service exposes a list_stock method that returns an
empty Python list (not None, not raises) when no stock rows exist in the
database. Runs against the real paired-branch database (DATABASE_URL from env).
"""

import pytest
import sqlalchemy as sa


def test_stock_service_list_returns_empty_list_not_none(db_session):
    """T20: stock service list_stock returns [] (not None, not raises) for an empty table.

    Owns its state: deletes all rows so the query result is predictably empty,
    then asserts the return value is a list instance equal to [], never None.
    """
    # Own the state: clear the table so the result is unambiguously empty.
    db_session.execute(sa.text("DELETE FROM stock"))
    db_session.commit()

    try:
        from app.services import stock as svc  # type: ignore[import]
    except (ImportError, ModuleNotFoundError) as exc:
        pytest.fail(
            f"app.services.stock not importable — Driver must create it. ({exc})"
        )

    list_fn = getattr(svc, "list_stock", None)
    assert callable(list_fn), (
        "app.services.stock must expose a list_stock callable that returns all "
        "stock records as a list (T20)."
    )

    result = list_fn(db=db_session)

    assert result is not None, (
        "list_stock must return [] (an empty list), never None, when no stock "
        "rows exist in the database."
    )
    assert isinstance(result, list), (
        f"list_stock must return a list, got {type(result).__name__!r}: {result!r}"
    )
    assert result == [], (
        f"list_stock must return [] when no stock rows exist, got {result!r}"
    )
