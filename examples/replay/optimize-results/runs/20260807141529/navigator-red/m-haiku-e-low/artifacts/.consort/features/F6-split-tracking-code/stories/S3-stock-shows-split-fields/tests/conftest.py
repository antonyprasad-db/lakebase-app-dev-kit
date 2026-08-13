"""
Shared pytest fixtures for S3-stock-shows-split-fields feature tests.
Provides database session and cleanup for migration tests.
"""
import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.models import Base


@pytest.fixture(scope="function")
def db_session():
    """
    Provides a fresh database session for each test.
    Tests can seed data, run migrations, and assert over the real paired-branch DB.
    """
    # Get the DATABASE_URL from environment (set by the post-checkout hook)
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        pytest.skip("DATABASE_URL not set; skipping DB test")

    # Create an engine and session
    engine = create_engine(db_url, echo=False)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()

    yield session

    # Cleanup: close the session
    session.close()


@pytest.fixture
def client():
    """
    Provides a FastAPI test client for integration tests.
    This fixture assumes your app is a FastAPI instance named 'app'.
    """
    from fastapi.testclient import TestClient
    from app.main import app  # Adjust import path to your app

    return TestClient(app)


def get_db_session():
    """
    Helper function to get a database session.
    Can be used in non-fixture contexts.
    """
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable not set")

    engine = create_engine(db_url, echo=False)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()
