"""FastAPI dependency providers.

Routes import from here, never directly from app.database, so the boundary
stays free of DB-session imports (the T6 layering fitness test).
"""

from app.database import get_db as _get_db
from sqlalchemy.orm import Session
from fastapi import Depends


def get_session(session: Session = Depends(_get_db)) -> Session:
    return session
