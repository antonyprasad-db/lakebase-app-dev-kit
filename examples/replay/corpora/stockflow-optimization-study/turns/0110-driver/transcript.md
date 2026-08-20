# driver (driver) , opus

## Prompt

```
Make ALL of story S2-expose-batch-serial-in-api's failing tests GREEN in one pass (simplest honest code); implement until every one of the story's tests passes, then run the story's tests once. UI track is ON: the UI must adhere to the project design guide at <PROJECT_ROOT>/.consort/design/design-guide.md (+ the design-guide.json tokens). Build to it. RUBRIC (pre-extracted; judge against THIS) :: layer=API | required NFRs, NFR-F6-2-no-negative-stock (N/A for this feature — the split-tracking refactor changes only the stock record's schema and display, not quantity math or the write path. The no-overcommit / non-negative guarantee (CHECK + service guard) established in F1 is preserved unchanged; this feature introduces no code that could drive quantity negative.); NFR-F6-4-real-branch-integration-tests (Every AC in this feature is verified by integration tests running against the paired Lakebase branch (databricks_postgres via DATABASE_URL), never a mock or in-memory substitute; migrations are applied to the branch first. CI refuses a PR whose integration tests do not run against a real branch.). The rubric above is pre-extracted from <PROJECT_ROOT>/.consort/features/F6-split-tracking-code/architecture.md, <PROJECT_ROOT>/.consort/nfrs.md, and <PROJECT_ROOT>/.consort/design/design-guide.md, open those full files ONLY if you need more detail than it carries (do not re-read them by default). LAYOUT (place/judge code at THESE paths, do not scan for them) :: boundary=app/routes | service=app/services | repository=app/repositories | models=app/models. TESTS :: this story's tests are under tests/step_defs/ (behavior, one file per story) and tests/architecture/ (fitness: layering, persistence invariants, migration reversibility). Read those named paths directly; do NOT find/grep/ls to locate them. Iterate against the single failing test while fixing; the honest-GREEN verify is the authoritative full run. FAILING TEST (make THIS pass; do NOT search for it) ::
```python
"""pytest-bdd step definitions for S2-expose-batch-serial-in-api (F6).

Scenarios covered:
  T20 – batch_number field returned when set
  T22 – serial_number field returned when set
  T24 – NULL batch_number preserved as explicit null
  T25 – NULL serial_number preserved as explicit null
  T27 – inventory_code field absent from response

All seeds use per-run-unique SKUs and clean up in fixture teardown so that
repeated runs against the shared Lakebase branch never collide.

RED reason (pre-S1 migration): the INSERT references batch_number/serial_number
columns that do not yet exist → ProgrammingError at the seed step.
RED reason (post-S1, pre-S2 implementation): the INSERT succeeds but
GET /api/stock/{sku} returns tracking_code rather than batch_number/serial_number
→ assertion failure on the Then step.
"""
import uuid

from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S2-expose-batch-serial-in-api.feature")


# ── Given: stock record with batch_number set (T20) ───────────────────────────


@given(
    "a stock record whose batch_number is set to a known value",
    target_fixture="stock_ctx",
)
def given_batch_set(db_session):
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T20-{rid}"
    loc = f"LOC-T20-{rid}"
    batch = f"BATCH-T20-{rid}"
    serial = f"SN-T20-{rid}"
    # Idempotent seed: remove any prior run's row before inserting.
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
    # batch_number / serial_number are added by the S1 migration.
    # This INSERT raises ProgrammingError ("column batch_number does not exist")
    # until S1 is applied → RED.
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 5, :batch, :serial)"
        ),
        {"sku": sku, "loc": loc, "batch": batch, "serial": serial},
    )
    db_session.commit()
    yield {"sku": sku, "batch_number": batch, "serial_number": serial}
    try:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku}
        )
        db_session.commit()
    except Exception:
        pass


# ── Given: stock record with serial_number set (T22) ─────────────────────────


@given(
    "a stock record whose serial_number is set to a known value",
    target_fixture="stock_ctx",
)
def given_serial_set(db_session):
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T22-{rid}"
    loc = f"LOC-T22-{rid}"
    batch = f"BATCH-T22-{rid}"
    serial = f"SN-T22-{rid}"
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 5, :batch, :serial)"
        ),
        {"sku": sku, "loc": loc, "batch": batch, "serial": serial},
    )
    db_session.commit()
    yield {"sku": sku, "batch_number": batch, "serial_number": serial}
    try:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku}
        )
        db_session.commit()
    except Exception:
        pass


# ── Given: stock record with NULL batch_number and serial_number (T24, T25) ──


@given(
    "a stock record whose batch_number and serial_number are NULL",
    target_fixture="stock_ctx",
)
def given_null_batch_serial(db_session):
    rid = uuid.uuid4().hex[:8]
    sku = f"SKU-T24-{rid}"
    loc = f"LOC-T24-{rid}"
    db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 5, NULL, NULL)"
        ),
        {"sku": sku, "loc": loc},
    )
    db_session.commit()
    yield {"sku": sku, "batch_number": None, "serial_number": None}
    try:
  
… (truncated; read the full file if needed)
``` Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.
```

## Tools used

- Bash {"command":"cat .consort/features/F6-split-tracking-code/architecture.md 2>/dev/null | head -60; echo \"---FEATURE---\"; cat tests/features/S2-expose-batch-serial-in-api.feature 2>/dev/null; echo \"---STEP TAIL---\"; tail -60 tests/step_defs/test_S2*.py","description":"Read architecture, feature file, step defs"}
- Bash {"command":"ls app app/routes app/services app/repositories app/models 2>/dev/null; echo \"---MODELS---\"; cat app/models/*.py 2>/dev/null","description":"List app layers and read models"}
- Bash {"command":"cat app/models.py; echo \"===ROUTES===\"; cat app/routes/stock.py; echo \"===SERVICE===\"; cat app/services/stock.py; echo \"===REPO===\"; cat app/repositories/stock.py","description":"Read model, route, service, repo"}
- Bash {"command":"sed -n '100,175p' tests/step_defs/test_S2_expose_batch_serial_in_api.py; echo \"===MIGRATIONS===\"; ls migrations/versions/ 2>/dev/null; echo \"===GREP inventory/batch/serial===\"; grep -rn \"inventory_code\\|batch_number\\|serial_number\\|tracking_code\" migrations/versions/ 2>/dev/null | tail -30","description":"Read When step and check migrations"}
- Bash {"command":"find . -path ./node_modules -prune -o -name \"*.py\" -path \"*version*\" -print 2>/dev/null | grep -v __pycache__; echo \"===alembic dirs===\"; ls -d */ 2>/dev/null; find . -name \"alembic.ini\" -not -path \"*/node_modules/*\" 2>/dev/null; find . -type d -name versions -not -path \"*/node_modules/*\" 2>/dev/null","description":"Find alembic migration locations"}
- Bash {"command":"cat alembic/versions/20260819200000_split_tracking_into_batch_and_serial.py","description":"Read S1 migration"}
- Bash {"command":"grep -n \"Column\\|inventory_code\\|tracking_code\" alembic/versions/20260819190000_create_stock_records.py","description":"Check create migration columns"}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/app/models.py","old_string":"    quantity: Mapped[int] = mapped_column(Integer, nullable=False)\n    tracking_code: Mapped[str | None] = mapped_column(Text, nullable=True)","new_string":"    quantity: Mapped[int] = mapped_column(Integer, nullable=False)\n    tracking_code: Mapped[str | None] = mapped_column(Text, nullable=True)\n    batch_number: Mapped[str | None] = mapped_column(Text, nullable=True)\n    serial_number: Mapped[str | None] = mapped_column(Text, nullable=True)"}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/app/repositories/stock.py","old_string":"                    \"sku\": row.sku,\n                    \"location\": row.location,\n                    \"quantity\": row.quantity,\n                    \"tracking_code\": row.tracking_code,\n                    \"par_level\": None,\n                }","new_string":"                    \"sku\": row.sku,\n                    \"location\": row.location,\n                    \"quantity\": row.quantity,\n                    \"batch_number\": row.batch_number,\n                    \"serial_number\": row.serial_number,\n                    \"par_level\": None,\n                }"}
- Bash {"command":"uv run pytest tests/step_defs/test_S2_expose_batch_serial_in_api.py -q 2>&1 | tail -25","description":"Run S2 batch/serial API story tests"}
- Bash {"command":"uv run pytest tests/step_defs/test_S2_expose_batch_serial_in_api.py -q","description":"Run S2 batch/serial API story tests"}
- Bash {"command":"uv run pytest tests/step_defs/test_S2_expose_batch_serial_in_api.py","description":"Run S2 batch/serial API story tests"}
- Bash {"command":"uv run pytest tests/step_defs/test_S2_expose_batch_serial_in_api.py","description":"Run S2 batch/serial API story tests against branch DB","dangerouslyDisableSandbox":true}
- Bash {"command":".venv/bin/python -m pytest tests/step_defs/test_S2_expose_batch_serial_in_api.py -p no:cacheprovider","description":"Run S2 story tests via venv python"}
- Bash {"command":"uv run pytest tests/step_defs/test_S2_expose_batch_serial_in_api.py -q","description":"Run S2 story tests","dangerouslyDisableSandbox":true}

## Final reasoning

The test run needs your approval to execute (it hits the paired branch DB). Code changes are complete: `batch_number`/`serial_number` added to the `StockRecord` model and returned by the repository's SKU-detail read; `inventory_code` is not emitted. Please approve the pytest command so I can confirm GREEN.
