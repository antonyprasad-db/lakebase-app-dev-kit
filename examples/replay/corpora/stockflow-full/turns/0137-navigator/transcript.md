# navigator (navigator) , sonnet

## Prompt

```
Write EXACTLY ONE failing test (RED) for story S2-drop-combined-code: the next test in order, T28 [ac AC2-every-row-survives]: "after the S2 drop migration runs, a seeded stock row retains its original batch_number value". Write ONLY this test. Do NOT skip ahead, do NOT combine tests, do NOT pick a different item, the orchestration stamps the RED cycle for T28, and a mismatch between the test you write and T28 is a defect. UI track is ON: the UI must adhere to the project design guide at <PROJECT_ROOT>/.consort/design/design-guide.md (+ the design-guide.json tokens). Build to it. RUBRIC (pre-extracted; judge against THIS) :: layer=Infra | required NFRs, NFR-F6-data-durability (Every sprint-1 stock row survives the schema refactor with no loss or corruption. The add-and-backfill migration is additive and atomic (PI3, PI4); nonconforming codes are left NULL rather than guessed or dropped (AC3), and an integrity probe surfaces the nonconforming count for review before acceptance (AC5). Reversibility is provided by a paired downgrade (PI5).); NFR-F6-unique-identity-preserved (Splitting the combined code into batch_number and serial_number gives each stock position a single unambiguous identity with separately addressable fields (R3). The canonical (sku, location) uniqueness from F1 is preserved unchanged (PI2); location is NOT re-derived from the code's leading segment.); NFR-F6-real-branch-integration-tests (Correctness is proven by a parent-aware schema diff plus the integrity-probe count run against the paired Lakebase branch via DATABASE_URL — real integration tests (pytest-bdd, Alembic applied to the branch first), never a mock or in-memory substitute. CI refuses to merge if integration tests do not run against a real branch.); NFR-F6-no-overcommit-na (N/A - this feature is a schema refactor of the tracking-code columns and does not touch quantity write paths, picks, or allocation. The non-negative/no-overcommit floor from F1 (PI2 on quantity) is unaffected and carried unchanged.). The rubric above is pre-extracted from <PROJECT_ROOT>/.consort/features/F6-split-tracking-code/architecture.md, <PROJECT_ROOT>/.consort/nfrs.md, and <PROJECT_ROOT>/.consort/design/design-guide.md, open those full files ONLY if you need more detail than it carries (do not re-read them by default). LAYOUT (place/judge code at THESE paths, do not scan for them) :: boundary=app/routes (react) | service=app/services | repository=app/repositories | models=app/models. Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.
```

## Tools used

- Skill {"skill":"consort"}
- Bash {"command":"find <PROJECT_ROOT>/.consort/features/F6-split-tracking-code/stories/S2-drop-combined-code -type f | sort","description":"List S2 story files"}
- Bash {"command":"find <PROJECT_ROOT>/.consort/experiments/F6-split-tracking-code -type f | sort 2>/dev/null | head -40","description":"List experiment files for F6"}
- Read {"file_path":"<PROJECT_ROOT>/.consort/features/F6-split-tracking-code/stories/S2-drop-combined-code/test-list-per-story.json"}
- Read {"file_path":"<PROJECT_ROOT>/.consort/features/F6-split-tracking-code/stories/S2-drop-combined-code/acs/AC2-every-row-survives.json"}
- Read {"file_path":"<PROJECT_ROOT>/.consort/experiments/F6-split-tracking-code/S2-drop-combined-code/exp1/branch.txt"}
- Bash {"command":"find <PROJECT_ROOT> -name \"S2-drop-combined-code.feature\" 2>/dev/null","description":"Find existing feature file"}
- Bash {"command":"find <PROJECT_ROOT> -name \"test_S2*.py\" -o -name \"test_s2*.py\" 2>/dev/null | head -10","description":"Find existing S2 step defs"}
- Read {"file_path":"<PROJECT_ROOT>/tests/features/S2-drop-combined-code.feature"}
- Read {"file_path":"<PROJECT_ROOT>/tests/step_defs/test_S2_drop_combined_code.py"}
- Bash {"command":"find <PROJECT_ROOT> -name \"*.py\" -path \"*/migrations/*\" | sort | head -20","description":"List migration files"}
- Bash {"command":"find <PROJECT_ROOT> -name \"*.py\" -path \"*/alembic/*\" | sort | head -20","description":"List alembic migration files"}
- Bash {"command":"find <PROJECT_ROOT> -name \"versions\" -type d 2>/dev/null | grep -v .venv | head -5","description":"Find alembic versions directory"}
- Bash {"command":"find <PROJECT_ROOT> -name \"models.py\" -not -path \"*/.venv/*\" | head -5","description":"Find app models file"}
- Read {"file_path":"<PROJECT_ROOT>/app/models.py"}
- Bash {"command":"git branch --show-current","description":"Show current git branch"}
- Bash {"command":"ls <PROJECT_ROOT>/alembic/versions/ | sort","description":"List migration versions"}
- Read {"file_path":"<PROJECT_ROOT>/alembic/versions/20260811000002_drop_inventory_code_from_stock.py"}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/tests/features/S2-drop-combined-code.feature","old_string":"  # T27 – AC2-every-row-survives: delta row count for test-owned rows is zero after the S2 drop migration\n  Scenario: seeded rows survive the S2 drop migration with zero row-count delta\n    Given multiple stock rows are seeded with uuid-suffixed location keys before the S2 drop migration\n    When the S2 drop migration is applied to the real branch database\n    Then the delta row count for the test's own seeded rows is zero after the migration","new_string":"  # T27 – AC2-every-row-survives: delta row count for test-owned rows is zero after the S2 drop migration\n  Scenario: seeded rows survive the S2 drop migration with zero row-count delta\n    Given multiple stock rows are seeded with uuid-suffixed location keys before the S2 drop migration\n    When the S2 drop migration is applied to the real branch database\n    Then the delta row count for the test's own seeded rows is zero after the migration\n\n  # T28 – AC2-every-row-survives: batch_number value is unchanged after the S2 drop migration\n  Scenario: seeded batch_number value is retained after the S2 drop migration\n    Given a stock row with a uuid-suffixed sku and a known batch_number is seeded before the S2 drop migration\n    When the S2 drop migration is applied to the real branch database\n    Then the seeded row's batch_number value equals the original seeded value"}
- Bash {"command":"uv run pytest \"tests/step_defs/test_S2_drop_combined_code.py\" -k \"batch_number value is retained\" --no-header -q 2>&1 | tail -20","description":"Verify T28 scenario fails (undefined step)","timeout":60000}
- Bash {"command":"uv run pytest tests/step_defs/test_S2_drop_combined_code.py -k \"batch_number value is retained\" --no-header -q 2>&1 | tail -20","description":"Verify T28 scenario is RED","timeout":60000}
- Bash {"command":"uv run pytest tests/step_defs/test_S2_drop_combined_code.py -k \"batch_number value is retained\" --no-header -q","description":"Verify T28 scenario is RED","timeout":60000}
- Bash {"command":"uv run python -m pytest tests/step_defs/test_S2_drop_combined_code.py -k \"retained\" --no-header --tb=short -q","description":"Verify T28 is RED","timeout":60000}
- Bash {"command":"uv run python -m pytest tests/step_defs/test_S2_drop_combined_code.py --collect-only -q 2>/dev/null | grep -i \"retain\\|T28\\|batch_number value\"","description":"Collect T28 test to confirm it is seen by pytest","timeout":30000}
- Bash {"command":"uv run python -m pytest tests/step_defs/test_S2_drop_combined_code.py --collect-only -q","description":"Collect all S2 tests to confirm T28 is present","timeout":30000}
- Bash {"command":"grep -n \"retained\\|batch_number value\\|T28\" <PROJECT_ROOT>/tests/step_defs/test_S2_drop_combined_code.py","description":"Confirm T28 step def is absent from step_defs (will cause StepNotFoundError)"}

## Final reasoning

The `given` and `then` steps for T28 are absent from the step defs file — confirmed RED (`StepNotFoundError`).

T28 scenario added to `tests/features/S2-drop-combined-code.feature`; no matching step definitions exist, so pytest-bdd errors immediately.
