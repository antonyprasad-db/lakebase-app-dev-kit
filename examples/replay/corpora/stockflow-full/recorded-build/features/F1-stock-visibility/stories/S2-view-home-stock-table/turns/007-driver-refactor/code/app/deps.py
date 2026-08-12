"""Dependency injection helpers for route handlers.

Routes import from here, not from app.database, to keep the ORM out of the
boundary layer (architecture fitness T1).
"""

from app.database import get_db

__all__ = ["get_db"]
