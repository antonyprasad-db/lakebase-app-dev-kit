"""FastAPI dependency providers. Wires a short-lived DB session into request handlers."""

from app.database import SessionLocal


def open_session():
    """Yield a SQLAlchemy session for the duration of one request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
