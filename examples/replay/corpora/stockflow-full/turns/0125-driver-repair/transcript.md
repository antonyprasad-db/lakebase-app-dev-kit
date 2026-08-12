# driver-repair (driver) , sonnet

## Prompt

```
REPAIR a driver-fixable regression in AC AC1-column-dropped (story S2-drop-combined-code). The honest-GREEN verify against the running app FAILED and it was diagnosed (by the Navigator, or deterministically by a gate such as contract-clean) as a genuine regression in the code, NOT a superseded test:
  DIAGNOSIS: App startup failure, not a test assertion error: uvicorn cannot be reached at http://localhost:8000/ within 60s. All production code is clean (no inventory_code in models.py, routes, services, or repositories). Migration chain is correct (create_stock_table seeds inventory_code; 20260811000002 drops it after tearing down the trigger). Most likely cause: a stale uvicorn process from the prior verify attempt is still holding port 8000, OR the alembic upgrade head step is hanging because a prior migration test left the DB at an intermediate revision and the trigger teardown in 20260811000002 is slow.
  FIX: Kill any process on port 8000 (lsof -ti:8000 | xargs kill -9), run alembic upgrade head manually to confirm it completes cleanly, then re-run the verify.
Apply that fix to the PRODUCTION code. Do NOT edit prior tests to force this regression green, fix the code. (EXCEPTION: if a SUPERSEDED TESTS directive follows below, the Navigator flagged those specific prior tests as encoding obsolete behavior, refactor ONLY those alongside this fix , often the regression is collateral from a superseded test erroring on a shared session, so both must land in this one turn.) Keep the AC's own tests green. This is your ONE repair attempt: if the verify still fails after it, the orchestration escalates to a human with the diagnosis. Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.
```

## Tools used

- Bash {"command":"ls .sftdd/ 2>/dev/null && ls","description":"List project structure"}
- Bash {"command":"lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null; echo \"port cleared\"","description":"Kill any process on port 8000"}
- Bash {"command":"ls","description":"List project root"}
- Bash {"command":"ls alembic/versions/","description":"List migration files"}
- Bash {"command":"ls app/","description":"List app directory"}
- Read {"file_path":"/Users/kevin.hartman/alembic/versions/20260811000001_add_tracking_parts_trigger.py"}
- Read {"file_path":"/Users/kevin.hartman/alembic/versions/20260811000002_drop_inventory_code_from_stock.py"}
- Bash {"command":"pwd","description":"Show current working directory"}
- Read {"file_path":"<PROJECT_ROOT>/alembic/versions/20260811000001_add_tracking_parts_trigger.py"}
- Read {"file_path":"<PROJECT_ROOT>/alembic/versions/20260811000002_drop_inventory_code_from_stock.py"}
- Read {"file_path":"<PROJECT_ROOT>/Makefile"}
- Bash {"command":"ls scripts/","description":"List scripts directory"}
- Read {"file_path":"<PROJECT_ROOT>/scripts/port-utils.sh"}
- Read {"file_path":"<PROJECT_ROOT>/scripts/run-dev.sh"}
- Read {"file_path":"<PROJECT_ROOT>/scripts/ci"}
- Bash {"command":"ls scripts/ci/","description":"List CI scripts"}
- Read {"file_path":"<PROJECT_ROOT>/scripts/run-tests.sh"}
- Bash {"command":"ls tests/","description":"List tests directory"}
- Bash {"command":"ls tests/e2e/ 2>/dev/null || echo \"no e2e dir\"","description":"List E2E tests"}
- Bash {"command":"ls .sftdd/cycles/ 2>/dev/null | head -20 || echo \"no cycles dir\"","description":"List SFTDD cycles"}
- Bash {"command":"find .sftdd -name \"*.json\" 2>/dev/null | head -30","description":"Find SFTDD JSON files"}
- Bash {"command":"ls .sftdd/ 2>/dev/null || echo \"no .sftdd dir\"","description":"Check .sftdd directory"}
- Read {"file_path":"<PROJECT_ROOT>/scripts/sftdd.sh"}
- Read {"file_path":"<PROJECT_ROOT>/app/main.py"}
- Bash {"command":"grep -r \"8000\" scripts/ --include=\"*.sh\" -l","description":"Find scripts that reference port 8000"}
- Bash {"command":"grep -r \"uvicorn\" scripts/ --include=\"*.sh\" -l 2>/dev/null","description":"Find scripts that start uvicorn"}
- Bash {"command":"grep -r \"uvicorn\\|port 8000\\|localhost:8000\" . --include=\"*.py\" --include=\"*.ts\" --include=\"*.sh\" --include=\"*.yaml\" --include=\"*.yml\" -l 2>/dev/null | grep -v __pycache__ | grep -v node_modules | grep -v \".venv\"","description":"Find all files referencing uvicorn or port 8000"}
- Read {"file_path":"<PROJECT_ROOT>/deploy-targets.yaml"}
- Read {"file_path":"<PROJECT_ROOT>/.github/workflows/pr.yml"}
- Bash {"command":"file scripts/lk && head -3 scripts/lk 2>/dev/null | cat","description":"Check what lk script is"}
- Bash {"command":"grep -n \"run\\|uvicorn\\|port.*8000\\|kill\\|lsof\\|start\" scripts/lk | head -40","description":"Check lk script for app startup logic"}
- Read {"file_path":"<PROJECT_ROOT>/Makefile"}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/Makefile","old_string":"run:\n\tuv run --env-file .env uvicorn app.main:app","new_string":"run:\n\t@lsof -ti:8000 | xargs kill -9 2>/dev/null || true\n\tuv run --env-file .env uvicorn app.main:app --host 0.0.0.0 --port 8000"}
- Bash {"command":"uv run alembic upgrade head 2>&1","description":"Run alembic upgrade head to confirm migration chain completes cleanly","timeout":60000}
- Bash {"command":"cat .env 2>/dev/null | grep -v PASSWORD | grep -v TOKEN | head -10 || echo \"no .env\"","description":"Check env file exists (non-secret keys)"}
- Bash {"command":"grep \"^DATABASE_URL\\|^DB_NAME\\|^DB_HOST\\|^DB_PORT\" .env | head -5","description":"Check DATABASE_URL in env"}
- Bash {"command":"grep \"DATABASE_URL\" .env | head -5","description":"Find DATABASE_URL in env file"}
- Read {"file_path":"<PROJECT_ROOT>/Makefile"}
- Bash {"command":"./scripts/lk consort-log --role driver --feature F2 --cycle AC1-column-dropped --level info --event reasoning --message \"REPAIR: Makefile run target now kills any stale process on port 8000 (lsof -ti:8000 | xargs kill -9) before starting uvicorn, and pins --host 0.0.0.0 --port 8000 so the deploy-targets.yaml base_url=http://localhost:8000 verify always finds the server.\" 2>&1 || true","description":"Log repair reasoning via consort-log"}
- Bash {"command":"./scripts/lk consort-log --role driver --feature F2 --cycle AC1-column-dropped --level info --event reasoning --message \"REPAIR: Makefile run target kills stale port-8000 process then pins uvicorn to --host 0.0.0.0 --port 8000\"","description":"Log repair reasoning"}

## Final reasoning

Makefile `run` target updated: kills any stale port-8000 process before starting uvicorn, and pins `--host 0.0.0.0 --port 8000` so the deploy-targets.yaml `base_url: http://localhost:8000` health poll always finds the server.
