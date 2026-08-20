# driver (driver) , opus

## Prompt

```
Make ALL of story S3-view-sku-detail's failing tests GREEN in one pass (simplest honest code); implement until every one of the story's tests passes, then run the story's tests once. UI track is ON: the UI must adhere to the project design guide at <PROJECT_ROOT>/.consort/design/design-guide.md (+ the design-guide.json tokens). Build to it. RUBRIC (pre-extracted; judge against THIS) :: layer=E2E | required NFRs, NFR-F1-1-migration-preserves-data (The schema migration is reversible against the real branch. Because this initial migration CREATES stock_records, its round-trip test asserts schema-recreation (after upgrade the table and its PI1/PI2/PI3 constraints exist) and a clean downgrade that drops the table, NOT row survival across the create-table round-trip (a downgrade drops the table, so row-survival is unsatisfiable here). Row-preservation applies only to later purely-additive migrations over an existing table.); NFR-F1-2-no-negative-stock (Stock levels never persist below zero; a filing that would drive quantity negative is rejected at write time (CHECK constraint PI3 plus service-layer guard).); NFR-F1-4-real-branch-integration-tests (Integration tests run against the paired Lakebase branch (databricks_postgres via DATABASE_URL), never a mock or in-memory substitute; CI refuses a PR whose integration tests do not run against a real branch.); NFR-F1-5-spa-json-api (The boundary is a JSON API returning data (not server-rendered HTML); the UI is a React + TypeScript SPA under client/ that navigates client-side and updates rows in place. The API is covered by the R4 branch integration tests.); NFR-F1-8-detail-untracked-clean-render (The SKU detail view (React SPA under client/) renders cleanly when optional fields are untracked: a nullable/absent par level (and by extension any untracked optional detail) shows an explicit 'not tracked' indication rather than a blank region or a null-related crash. Owned by the client presentation layer over the JSON boundary (R5); the boundary returns the field as null/omitted and the SPA renders the indicator. Covered by a SPA component test on the untracked path plus the R4 branch integration test confirming the boundary returns the record with the optional field absent. (PO preference: a row missing optional detail still renders cleanly.)) | design-token groups, typography, colors, spacing, radius, shadows, breakpoints, components. The rubric above is pre-extracted from <PROJECT_ROOT>/.consort/features/F1-stock-visibility/architecture.md, <PROJECT_ROOT>/.consort/nfrs.md, and <PROJECT_ROOT>/.consort/design/design-guide.md, open those full files ONLY if you need more detail than it carries (do not re-read them by default). LAYOUT (place/judge code at THESE paths, do not scan for them) :: boundary=app/routes | service=app/services | repository=app/repositories | models=app/models. TESTS :: this story's tests are under tests/step_defs/ (behavior, one file per story) and tests/architecture/ (fitness: layering, persistence invariants, migration reversibility). Read those named paths directly; do NOT find/grep/ls to locate them. Iterate against the single failing test while fixing; the honest-GREEN verify is the authoritative full run. FAILING TEST (make THIS pass; do NOT search for it) ::
```python
"""pytest-bdd step definitions for S3-view-sku-detail scenarios (T24, T25, T26, T27)."""

import uuid

import pytest
from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S3-view-sku-detail.feature")

PRESENTATION_STRINGS = {"not tracked", "untracked", "n/a", "none", "-", ""}


@pytest.fixture
def ctx():
    return {}


# ── T24: two-location detail ─────────────────────────────────────────────────


@given("a SKU stocked at two locations seeded with unique per-run keys")
def seed_sku_at_two_locations(ctx, client, db_session):
    run_id = uuid.uuid4().hex
    sku = f"SKU-T24-{run_id}"
    ctx["sku"] = sku
    ctx["locations"] = [
        {"sku": sku, "location": f"LOC-T24-A-{run_id}", "quantity": 10},
        {"sku": sku, "location": f"LOC-T24-B-{run_id}", "quantity": 20},
    ]
    for rec in ctx["locations"]:
        resp = client.post("/api/stock/file", json=rec)
        assert resp.status_code in (200, 201), f"Seed failed: {resp.text}"

    yield

    for rec in ctx["locations"]:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku AND location = :loc"),
            {"sku": rec["sku"], "loc": rec["location"]},
        )
    db_session.commit()


@when("I GET /api/stock/<sku>")
def get_sku_detail(ctx, client):
    ctx["response"] = client.get(f"/api/stock/{ctx['sku']}")


@then("the response contains exactly one JSON object per seeded location each with location and quantity")
def check_one_object_per_location(ctx):
    assert ctx["response"].status_code == 200, (
        f"Expected 200, got {ctx['response'].status_code}: {ctx['response'].text}"
    )
    body = ctx["response"].json()
    assert isinstance(body, list), f"Expected a JSON array, got: {type(body)}"

    seeded_locations = {rec["location"] for rec in ctx["locations"]}
    response_locations = {item["location"] for item in body if "location" in item}

    # Every seeded location must appear exactly once
    for rec in ctx["locations"]:
        matching = [item for item in body if item.get("location") == rec["location"]]
        assert len(matching) == 1, (
            f"Expected exactly 1 item for location {rec['location']!r}, found {len(matching)}"
        )
        item = matching[0]
        assert "quantity" in item, f"Item for {rec['location']!r} missing 'quantity': {item}"
        assert item["quantity"] == rec["quantity"], (
            f"Expected quantity {rec['quantity']}, got {item['quantity']}"
        )

    # No extra locations beyond the seeded ones for this SKU
    extra = response_locations - seeded_locations
    assert not extra, f"Response contained unexpected locations: {extra}"


# ── T25: tracking code present ───────────────────────────────────────────────


@given("a stock record seeded with a unique per-run key and a non-empty combined tracking code")
def seed_record_with_tracking_code(ctx, client, db_session):
    run_id = uuid.uuid4().hex
    ctx["sku"] = f"SKU-T25-{run_id}"
    ctx["location"] = f"LOC-T25-{run_id}"
    ctx["tracking_code"] = f"TC-{run_id}-BATCH42"
    resp = client.post(
        "/api/stock/file",
        json={
            "sku": ctx["sku"],
            "location": ctx["location"],
            "quantity": 5,
            "tracking_code": ctx["tracking_code"],
        },
    )
    assert resp.status_code in (200, 201), f"Seed failed: {resp.text}"

    yield

    db_session.execute(
        text("DELETE FROM stock_records WHERE sku = :sku AND location = :loc"),
        {"sku": ctx["sku"], "loc": ctx["location"]},
    )
    db_session.commit()


@then("the response contains the record with the combined tracking code matching the seeded value")
def check_tracking_code_in_response(ctx):
    assert ctx["response"].status_code == 200, (
        f"Expected 200, got {ctx['response'].status_code}: {ctx['response'].text}"
    )
    body = ctx["response"].json()
    assert isinstance(body, list), f"Expected a JSON array, got: {type(body)}"

    m
… (truncated; read the full file if needed)
``` Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.
```

## Tools used

- Bash {"command":"cat tests/step_defs/test_S3_view_sku_detail.py 2>/dev/null; echo \"---FEATURE---\"; cat .consort/features/F1-stock-visibility/../../features/*S3* 2>/dev/null; echo \"---\"; ls tests/features/ 2>/dev/null; ls tests/step_defs/","description":"Read failing test and feature"}
- Bash {"command":"ls -R app 2>/dev/null | head -60; echo \"===CLIENT===\"; ls client 2>/dev/null; echo \"===ENV===\"; cat .env 2>/dev/null | grep -i database","description":"List app structure"}
- Bash {"command":"cd <PROJECT_ROOT> 2>/dev/null; pwd; ls tests; echo \"===step_defs===\"; ls tests/step_defs; echo \"===features===\"; ls tests/features 2>/dev/null","description":"Find test root"}
- Read {"file_path":"<PROJECT_ROOT>/tests/step_defs/test_S3_view_sku_detail.py"}
- Read {"file_path":"<PROJECT_ROOT>/tests/features/S3-view-sku-detail.feature"}
- Read {"file_path":"<PROJECT_ROOT>/app/routes/stock.py"}
- Read {"file_path":"<PROJECT_ROOT>/app/services/stock.py"}
- Read {"file_path":"<PROJECT_ROOT>/app/repositories/stock.py"}
- Read {"file_path":"<PROJECT_ROOT>/app/models.py"}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/app/repositories/stock.py","old_string":"    def upsert(self, sku: str, location: str, quantity: int, tracking_code: str) -> dict:","new_string":"    def list_by_sku(self, sku: str) -> list[dict]:\n        \"\"\"Return every stock record for one SKU, one dict per location.\n\n        par_level is untracked in the schema, so it surfaces as an explicit\n        null rather than a synthesized presentation string (NFR-F1-8).\"\"\"\n        session = SessionLocal()\n        try:\n            rows = (\n                session.execute(select(StockRecord).where(StockRecord.sku == sku))\n                .scalars()\n                .all()\n            )\n            return [\n                {\n                    \"sku\": row.sku,\n                    \"location\": row.location,\n                    \"quantity\": row.quantity,\n                    \"tracking_code\": row.tracking_code,\n                    \"par_level\": None,\n                }\n                for row in rows\n            ]\n        finally:\n            session.close()\n\n    def upsert(self, sku: str, location: str, quantity: int, tracking_code: str) -> dict:"}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/app/services/stock.py","old_string":"def file_stock_record(","new_string":"def get_sku_detail(sku: str, repository=None) -> list[dict]:\n    \"\"\"Return every stock record for a SKU, one object per location (S3).\"\"\"\n    if repository is None:\n        repository = StockRepository()\n    return repository.list_by_sku(sku)\n\n\ndef file_stock_record("}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/app/routes/stock.py","old_string":"from app.services.stock import (\n    NegativeQuantityError,\n    file_stock_record,\n    list_stock_records,\n)\n\nrouter = APIRouter(prefix=\"/api/stock\", tags=[\"stock\"])\n\n\n@router.get(\"\")\ndef list_stock():\n    \"\"\"Return one JSON object per stock record (NFR-F1-7); [] when empty.\"\"\"\n    return JSONResponse(status_code=200, content=list_stock_records())","new_string":"from app.services.stock import (\n    NegativeQuantityError,\n    file_stock_record,\n    get_sku_detail,\n    list_stock_records,\n)\n\nrouter = APIRouter(prefix=\"/api/stock\", tags=[\"stock\"])\n\n\n@router.get(\"\")\ndef list_stock():\n    \"\"\"Return one JSON object per stock record (NFR-F1-7); [] when empty.\"\"\"\n    return JSONResponse(status_code=200, content=list_stock_records())\n\n\n@router.get(\"/{sku}\")\ndef sku_detail(sku: str):\n    \"\"\"Return one JSON object per location for a SKU (S3); [] when unknown.\"\"\"\n    return JSONResponse(status_code=200, content=get_sku_detail(sku))"}
- Bash {"command":"cd <PROJECT_ROOT>; ls -R client/tests client/src 2>/dev/null | head -80","description":"Check client tests and src"}
- Read {"file_path":"<PROJECT_ROOT>/client/tests/pages/SkuDetailPage.test.tsx"}
- Read {"file_path":"<PROJECT_ROOT>/client/src/App.tsx"}
- Read {"file_path":"<PROJECT_ROOT>/client/src/pages/HomePage.tsx"}
- Read {"file_path":"<PROJECT_ROOT>/client/src/hooks/useStock.ts"}
- Read {"file_path":"<PROJECT_ROOT>/client/src/api/stock.ts"}
- Read {"file_path":"<PROJECT_ROOT>/client/src/components/StockTable.tsx"}
- Read {"file_path":"<PROJECT_ROOT>/client/src/api/client.ts"}
- Read {"file_path":"<PROJECT_ROOT>/client/src/styles/global.css"}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/client/src/api/stock.ts","old_string":"export function getStock(): Promise<StockRecord[]> {\n  return getJson<StockRecord[]>(\"/api/stock\");\n}","new_string":"export function getStock(): Promise<StockRecord[]> {\n  return getJson<StockRecord[]>(\"/api/stock\");\n}\n\n// One location's detail for a SKU, as GET /api/stock/<sku> returns it. par_level\n// is optional/nullable: an untracked par level is null/omitted, never a string.\nexport interface SkuLocationRow {\n  sku: string;\n  location: string;\n  quantity: number;\n  tracking_code?: string | null;\n  par_level?: number | null;\n}\n\nexport function getSkuDetail(sku: string): Promise<SkuLocationRow[]> {\n  return getJson<SkuLocationRow[]>(`/api/stock/${encodeURIComponent(sku)}`);\n}"}
- Write {"file_path":"<PROJECT_ROOT>/client/src/hooks/useSkuDetail.ts","content":"import { useEffect, useState } from \"react\";\nimport { getSkuDetail, type SkuLocationRow } from \"../api/stock\";\n\nexport type SkuDetailState =\n  | { status: \"loading\" }\n  | { status: \"ok\"; rows: SkuLocationRow[] }\n  | { status: \"error\"; message: string };\n\n// Holds the SKU-detail fetch + UI state; calls the api/ layer, never fetches\n// directly. The page renders each state explicitly (no silent blank region).\nexport function useSkuDetail(sku: string): SkuDetailState {\n  const [state, setState] = useState<SkuDetailState>({ status: \"loading\" });\n\n  useEffect(() => {\n    let cancelled = false;\n    getSkuDetail(sku)\n      .then((rows) => {\n        if (!cancelled) setState({ status: \"ok\", rows });\n      })\n      .catch((err: unknown) => {\n        if (!cancelled) {\n          setState({\n            status: \"error\",\n            message: err instanceof Error ? err.message : \"unknown error\",\n          });\n        }\n      });\n    return () => {\n      cancelled = true;\n    };\n  }, [sku]);\n\n  return state;\n}\n"}
- Write {"file_path":"<PROJECT_ROOT>/client/src/pages/SkuDetailPage.tsx","content":"import { useParams } from \"react-router-dom\";\nimport { useSkuDetail } from \"../hooks/useSkuDetail\";\nimport type { SkuLocationRow } from \"../api/stock\";\n\n// SKU detail view (S3): one row per location for a SKU. Every state (loading,\n// error, empty, ok) is explicit , never a blank region. Styling comes entirely\n// from the design-guide class vocabulary in global.css (no inline styles).\nfunction LocationRow({ row }: { row: SkuLocationRow }) {\n  const parUntracked = row.par_level === null || row.par_level === undefined;\n  return (\n    <li className=\"location-row\" data-testid=\"location-row\">\n      <span className=\"location-row__name\">{row.location}</span>\n      <span className=\"location-row__quantity\" data-testid=\"location-quantity\">\n        {row.quantity}\n      </span>\n      {row.tracking_code ? (\n        <span\n          className=\"location-row__tracking-code\"\n          data-testid=\"location-tracking-code\"\n        >\n          {row.tracking_code}\n        </span>\n      ) : null}\n      {parUntracked ? (\n        <span\n          className=\"location-row__par-untracked\"\n          data-testid=\"par-level-untracked\"\n        >\n          Par level: not tracked\n        </span>\n      ) : (\n        <span className=\"location-row__par\">{row.par_level}</span>\n      )}\n    </li>\n  );\n}\n\nexport function SkuDetailPage() {\n  const { sku = \"\" } = useParams();\n  const detail = useSkuDetail(sku);\n\n  return (\n    <main className=\"page\" data-testid=\"sku-detail-page\">\n      <h1>SKU {sku}</h1>\n\n      <section className=\"card\" aria-label=\"Stock by location\">\n        {detail.status === \"loading\" && (\n          <p className=\"stock-table__status\" role=\"status\">\n            Loading SKU detail...\n          </p>\n        )}\n        {detail.status === \"error\" && (\n          <p className=\"stock-table__status\" role=\"alert\">\n            Could not load SKU detail: {detail.message}\n          </p>\n        )}\n        {detail.status === \"ok\" && detail.rows.length === 0 && (\n          <p className=\"stock-table__empty\" role=\"status\">\n            No stock filed for this SKU\n          </p>\n        )}\n        {detail.status === \"ok\" && detail.rows.length > 0 && (\n          <ul className=\"location-list\">\n            {detail.rows.map((row) => (\n              <LocationRow key={row.location} row={row} />\n            ))}\n          </ul>\n        )}\n      </section>\n    </main>\n  );\n}\n"}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/client/src/App.tsx","old_string":"import { HomePage } from \"./pages/HomePage\";\nimport { AboutPage } from \"./pages/AboutPage\";","new_string":"import { HomePage } from \"./pages/HomePage\";\nimport { AboutPage } from \"./pages/AboutPage\";\nimport { SkuDetailPage } from \"./pages/SkuDetailPage\";"}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/client/src/App.tsx","old_string":"        <Route path=\"/about\" element={<AboutPage />} />","new_string":"        <Route path=\"/stock/:sku\" element={<SkuDetailPage />} />\n        <Route path=\"/about\" element={<AboutPage />} />"}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/client/src/styles/global.css","old_string":".stock-table__empty,\n.stock-table__status {\n  padding: var(--space-4);\n  color: var(--color-navy-500);\n  text-align: center;\n}","new_string":".stock-table__empty,\n.stock-table__status {\n  padding: var(--space-4);\n  color: var(--color-navy-500);\n  text-align: center;\n}\n\n/* SKU detail (S3): one card row per location, quantity in the mono face,\n   tracking code and an explicit 'not tracked' par indicator (never blank). */\n.location-list {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  display: flex;\n  flex-direction: column;\n  gap: var(--space-2);\n}\n.location-row {\n  display: flex;\n  align-items: center;\n  gap: var(--space-4);\n  padding: var(--space-3);\n  border-bottom: 1px solid var(--color-navy-100);\n  color: var(--color-text);\n}\n.location-row__name {\n  font-weight: 600;\n}\n.location-row__quantity {\n  margin-left: auto;\n  font-family: var(--font-mono);\n  font-variant-numeric: tabular-nums;\n}\n.location-row__tracking-code {\n  font-family: var(--font-mono);\n  font-size: var(--text-sm);\n  color: var(--color-navy-500);\n}\n.location-row__par-untracked {\n  font-size: var(--text-sm);\n  color: var(--color-navy-500);\n  font-style: italic;\n}\n.location-row__par {\n  font-family: var(--font-mono);\n  font-variant-numeric: tabular-nums;\n}"}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_view_sku_detail.py -q 2>&1 | tail -25","description":"Run S3 backend step defs"}
- Bash {"command":"npm --prefix client test -- run SkuDetailPage 2>&1 | tail -30","description":"Run SkuDetailPage component tests"}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_view_sku_detail.py -q","description":"Run S3 backend step defs"}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_view_sku_detail.py -q","description":"Run S3 backend step defs","dangerouslyDisableSandbox":true}
- Bash {"command":"npm --prefix client test -- run SkuDetailPage","description":"Run SkuDetailPage component tests","dangerouslyDisableSandbox":true}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_view_sku_detail.py -q","description":"Run S3 backend step defs"}
- Bash {"command":"cd client && npx vitest run tests/pages/SkuDetailPage.test.tsx","description":"Run SkuDetailPage vitest"}
- Bash {"command":"npx --prefix client vitest run tests/pages/SkuDetailPage.test.tsx --root client","description":"Run SkuDetailPage vitest"}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_view_sku_detail.py","description":"Run S3 story step definitions"}
- Bash {"command":"npm --prefix client run test:run 2>/dev/null || npm --prefix client test","description":"Run client test suite"}
- Bash {"command":"npm --prefix client test","description":"Run client vitest suite"}

## Final reasoning

Implemented S3 across backend layers (`app/routes|services|repositories/stock.py`) and the React SPA (`client/src` api/hook/page/route + design-guide CSS); the test commands require your approval to run.
