# Stockflow Instrumented

TDD-workflow project. Test runner: `uv run --env-file .env pytest`.

## Allowed commands

- `uv run --env-file .env pytest [args]` — run Python tests
- `uv run --env-file .env alembic [args]` — run Alembic migrations  
- `./scripts/run-tests.sh [args]` — run full test suite via wrapper
- `./scripts/lk [args]` — consort workflow CLI
