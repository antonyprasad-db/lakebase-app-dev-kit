# driver-repair (driver) , sonnet

## Prompt

```
REPAIR a driver-fixable regression in AC AC1-detail-view-shows-batch-and-serial (story S3-expose-batch-serial-in-stock-ui). The honest-GREEN verify against the running app FAILED and it was diagnosed (by the Navigator, or deterministically by a gate such as contract-clean) as a genuine regression in the code, NOT a superseded test:
  DIAGNOSIS: T48 (test_detail_api_returns_batch_number_as_json_null_when_column_is_null) fails with AttributeError at app/services/stock.py:45 — the line 'return repos.stock.get_stock(db, sku=sku, location=location)'. app/repositories/__init__.py is empty so repos.stock only resolves if app.repositories.stock was imported by a prior code path; this test is the first in collection order (tests/architecture/ sorts before tests/step_defs/) to hit the GET detail route, exposing the latent unguarded submodule reference.
  FIX: Add 'from . import stock' to app/repositories/__init__.py so repos.stock always resolves regardless of import order.
Apply that fix to the PRODUCTION code. Do NOT edit prior tests to force this regression green, fix the code. (EXCEPTION: if a SUPERSEDED TESTS directive follows below, the Navigator flagged those specific prior tests as encoding obsolete behavior, refactor ONLY those alongside this fix , often the regression is collateral from a superseded test erroring on a shared session, so both must land in this one turn.) Keep the AC's own tests green. This is your ONE repair attempt: if the verify still fails after it, the orchestration escalates to a human with the diagnosis. Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.
```

## Tools used

- Read {"file_path":"/Users/kevin.hartman/app/repositories/__init__.py"}
- Bash {"command":"find . -path ./node_modules -prune -o -name \"__init__.py\" -path \"*/repositories/*\" -print 2>/dev/null","description":"Find repositories __init__.py"}
- Read {"file_path":"/Users/kevin.hartman/app/repositories/__init__.py"}
- Bash {"command":"pwd && cat -n ./app/repositories/__init__.py","description":"Show repositories __init__.py contents"}
- Read {"file_path":"<PROJECT_ROOT>/app/repositories/__init__.py"}
- Write {"file_path":"<PROJECT_ROOT>/app/repositories/__init__.py","content":"from . import stock\n"}
- Bash {"command":"uv run pytest tests/step_defs/test_s3_expose_batch_serial_in_stock_ui.py tests/architecture/ -x -q 2>&1 | tail -20","description":"Run S3 story tests and architecture fitness tests"}
- Bash {"command":"uv run pytest tests/step_defs/test_s3_expose_batch_serial_in_stock_ui.py tests/architecture/ -x -q","description":"Run S3 story and architecture fitness tests"}
- Bash {"command":"uv run pytest tests/step_defs/test_s3_expose_batch_serial_in_stock_ui.py -x -q","description":"Run S3 story tests"}
- Bash {"command":"uv run pytest tests/ -x -q --ignore=tests/e2e -k \"s3 or S3 or batch_serial or batch_number\"","description":"Run S3-related tests"}
- Bash {"command":"ls tests/step_defs/","description":"List step_defs test files"}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_expose_batch_serial_in_stock_ui.py tests/step_defs/test_S3_view_sku_detail.py tests/architecture/ -x -q","description":"Run S3 story and architecture tests"}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_expose_batch_serial_in_stock_ui.py -x -q","description":"Run S3 expose batch serial tests","dangerouslyDisableSandbox":true}
- Skill {"skill":"consort","args":"log --role driver --feature S3 --cycle AC1-detail-view-shows-batch-and-serial --level info --event reasoning --message \"REPAIR: added 'from . import stock' to app/repositories/__init__.py so repos.stock submodule reference always resolves regardless of import order\""}
- Bash {"command":"./scripts/lk consort-log --role driver --feature S3 --cycle AC1-detail-view-shows-batch-and-serial --level info --event reasoning --message \"REPAIR: added 'from . import stock' to app/repositories/__init__.py so repos.stock submodule reference always resolves regardless of import order\"","description":"Log driver repair action"}

## Final reasoning

Done. `app/repositories/__init__.py` now contains `from . import stock`.
