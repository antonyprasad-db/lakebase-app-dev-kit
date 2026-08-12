# navigator-review (navigator) , sonnet

## Prompt

```
REVIEW the implementation of story S2-view-home-stock-table now that ALL its tests are green, the whole story in one pass. Judge the story's diff against the context pack: layer boundaries, naming, cross-cutting concerns, the required NFRs, and (for UI) design-token + IA adherence. RUBRIC (pre-extracted; judge against THIS) :: layer=E2E | required NFRs, NFR-F1-data-durability (Existing stock data survives every schema migration with no loss; model changes are additive and pre-existing inventory records are preserved (PI5). Adjustment audit fields (timestamp, actor) are immutable once written.); NFR-F1-no-negative-overcommit (Stock levels never go below zero and never overcommit; enforced at write time in the service layer and by a DB CHECK constraint (PI2). Note: the pick/overcommit flow is out of S1 scope but the non-negative floor is realized here.); NFR-F1-real-branch-integration-tests (Acceptance tests are real integration tests (pytest-bdd) against the paired Lakebase branch via DATABASE_URL, never a mock or in-memory substitute; CI refuses to merge if integration tests do not run against a real branch.); NFR-F1-spa-json-boundary (The UI is a React + TypeScript single-page app under client/; the API boundary returns JSON (not server-rendered HTML), so the boundary layer declares renders_via: react. Client-side navigation with no full-page reloads; adjustments update the affected row in place.); NFR-F1-empty-state-clean-render (The home stock read view renders cleanly in every data state: with rows it shows the scannable table; with no rows it shows an explicit empty-state message ('No stock at this location'), never a blank region and never a null crash (nfrs.md clean-render preference, AC3). The read endpoint returns an empty JSON collection on no data (never a 4xx/5xx), owned at the boundary; empty-state and quantity-column alignment are view responsibilities in the React SPA (client/).) | design-token groups, typography, colors, spacing, radius, shadows, breakpoints, components. The rubric above is pre-extracted from <PROJECT_ROOT>/.consort/features/F1-stock-visibility/architecture.md, <PROJECT_ROOT>/.consort/nfrs.md, and <PROJECT_ROOT>/.consort/design/design-guide.md, open those full files ONLY if you need more detail than it carries (do not re-read them by default). LAYOUT (place/judge code at THESE paths, do not scan for them) :: boundary=app/routes (react) | service=app/services | repository=app/repositories | models=app/models. Write ONE verdict for the whole story to <PROJECT_ROOT>/.consort/cycles/F1-stock-visibility/S2-view-home-stock-table/review-verdict.json as {"refactor": <bool>, "notes": "<why>"}, refactor:true only if a concrete improvement is warranted; otherwise refactor:false. Do NOT change tests. Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.
```

## Tools used

- Bash {"command":"find <PROJECT_ROOT> -type f | grep -v __pycache__ | grep -v .git | grep -v node_modules | grep -v dist | sort | head -60"}
- Bash {"command":"find <PROJECT_ROOT> -type f | grep -v __pycache__ | grep -v .git | grep -v node_modules | grep -v dist | grep -v \".claude/skills\" | sort"}
- Read {"file_path":"/Users/kevin.hartman/.claude/projects/-Users-kevin-hartman-code-tdd-workflow-smoke-stockflow-instrumented-20260809-105157/1ab5dab4-766b-4b26-a097-314dd6aea5ae/tool-results/b2innbbap.txt","limit":200,"offset":60}
- Bash {"command":"BASE=<PROJECT_ROOT>\nfind $BASE/app $BASE/client/src $BASE/tests $BASE/client/tests -type f 2>/dev/null | sort"}
- Read {"file_path":"<PROJECT_ROOT>/app/routes/stock.py"}
- Read {"file_path":"<PROJECT_ROOT>/app/services/stock.py"}
- Read {"file_path":"<PROJECT_ROOT>/app/repositories/stock.py"}
- Read {"file_path":"<PROJECT_ROOT>/client/src/pages/HomePage.tsx"}
- Read {"file_path":"<PROJECT_ROOT>/client/src/App.tsx"}
- Read {"file_path":"<PROJECT_ROOT>/client/src/styles/theme.css"}
- Read {"file_path":"<PROJECT_ROOT>/client/src/styles/global.css"}
- Read {"file_path":"<PROJECT_ROOT>/client/tests/pages/HomeStockTable.test.tsx"}
- Bash {"command":"grep -n \"stock-table__quantity\\|\\.table\" <PROJECT_ROOT>/client/src/styles/global.css"}
- Bash {"command":"grep -rn \"stock-table__quantity\" <PROJECT_ROOT>/client/src/"}
- Bash {"command":"grep -n \"stock-table__quantity\\|\\.table\\b\\|empty-state\" <PROJECT_ROOT>/client/src/styles/global.css"}
- Bash {"command":"grep -n \"className\\|class=\" <PROJECT_ROOT>/client/src/pages/HomePage.tsx"}
- Write {"file_path":"<PROJECT_ROOT>/.consort/cycles/F1-stock-visibility/S2-view-home-stock-table/review-verdict.json","content":"{ \"refactor\": true, \"notes\": \"HomePage.tsx does not consume the design-vocabulary CSS classes: (1) <table> is missing className=\\\"table\\\" so the design-token–backed .table styles (header background, border-collapse, typography) are never applied; (2) the quantity cell uses className=\\\"stock-table__quantity\\\" which is undefined in global.css — the guide's canonical numeric-cell class is .table__num (text-align:right, tabular-nums, monospace font); the test only checks that stock-table__quantity is present, so adding table__num alongside satisfies both and closes the token gap; (3) the empty-state <p> should use className=\\\"empty-state\\\" per the design vocabulary (the .empty-state block in global.css provides the centered, padded, on-brand treatment). All three are layer-correct (view responsibility in the React SPA, not a backend or service change) and do not alter what the outer-boundary tests assert.\" }\n"}

## Final reasoning

Verdict written to `.consort/cycles/F1-stock-visibility/S2-view-home-stock-table/review-verdict.json` — `refactor: true` for missing design-vocabulary class bindings in `HomePage.tsx`.
