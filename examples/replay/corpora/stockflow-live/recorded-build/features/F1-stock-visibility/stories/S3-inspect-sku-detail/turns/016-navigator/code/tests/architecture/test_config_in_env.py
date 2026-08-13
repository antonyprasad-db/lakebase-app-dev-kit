"""Config-in-env fitness test (T10): the DB connection resolves from the
injected DATABASE_URL env var (databricks_postgres on the paired branch); no
hardcoded DSN or app-specific DB name. Structural/behavioral check against the
real env + app.database module, no Gherkin.
"""

import importlib
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_DIR = REPO_ROOT / "app"

# S1's own layers (declared in architecture.json); they must reuse
# app.database's shared, env-resolved engine/session rather than opening a
# connection of their own.
_LAYER_DIRS = ["routes", "services", "repositories", "models"]
_DSN_SCHEMES = ("postgresql://", "postgres://", "postgresql+psycopg://")


def test_database_url_env_var_overrides_connection(monkeypatch):
    original_database_url = os.environ.get("DATABASE_URL")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://test-user@example-branch-host:5432/databricks_postgres",
    )
    database = importlib.import_module("app.database")
    importlib.reload(database)
    try:
        resolved = database.resolved_url()
        assert "example-branch-host" in resolved, resolved
        assert "databricks_postgres" in resolved, resolved
    finally:
        if original_database_url is not None:
            monkeypatch.setenv("DATABASE_URL", original_database_url)
        else:
            monkeypatch.delenv("DATABASE_URL", raising=False)
        importlib.reload(database)


def test_story_layers_do_not_hardcode_dsn_or_open_their_own_engine():
    for layer in _LAYER_DIRS:
        layer_dir = APP_DIR / layer
        assert layer_dir.is_dir(), (
            f"{layer_dir} does not exist yet; S1's layers (app/routes/, "
            "app/services/, app/repositories/, app/models/) must reuse "
            "app.database's shared, env-resolved connection"
        )
        for py_file in layer_dir.rglob("*.py"):
            if py_file.name == "__init__.py":
                continue
            source = py_file.read_text()
            for scheme in _DSN_SCHEMES:
                assert scheme not in source, (
                    f"{py_file} hardcodes a DSN scheme {scheme!r}; the "
                    "connection must resolve from DATABASE_URL via app.database, "
                    "never a literal DSN in a story layer"
                )
            assert "create_engine" not in source, (
                f"{py_file} constructs its own engine; reuse app.database's "
                "shared SessionLocal/engine instead"
            )
