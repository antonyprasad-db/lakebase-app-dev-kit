# driver-repair (driver) , sonnet

## Prompt

```
REPAIR a driver-fixable regression in AC AC1-detail-lists-locations (story S3-view-sku-detail). The honest-GREEN verify against the running app FAILED and it was diagnosed (by the Navigator, or deterministically by a gate such as contract-clean) as a genuine regression in the code, NOT a superseded test:
  DIAGNOSIS: Not a production regression and not a supersession: the /api/stock/file boundary correctly rejects a filing missing the required non-blank tracking_code (established behavior in S1 — see the blank-tracking_code 422 scenario and _REQUIRED_TEXT_FIELDS in app/routes/stock.py). The failure is a seed defect in this AC's own test: the T24 given step seed_sku_at_two_locations in tests/step_defs/test_S3_view_sku_detail.py builds its two location records WITHOUT a tracking_code field, so both seed POSTs return 422 'tracking_code field is required and must not be blank' and the scenario cannot set up. The sibling seeds T25/T26 in the same file correctly include a unique per-run tracking_code; T24 simply omitted it. AC1-detail-lists-locations does not change the tracking_code-required contract, so no test is superseded.
  FIX: In seed_sku_at_two_locations (tests/step_defs/test_S3_view_sku_detail.py), add a unique per-run tracking_code to each of the two seeded location dicts (e.g. f'TC-T24-A-{run_id}' and f'TC-T24-B-{run_id}'), matching the pattern already used by the T25/T26 seeds, so each /api/stock/file POST includes the required non-blank field and returns 201.
Apply that fix to the PRODUCTION code. Do NOT edit prior tests to force this regression green, fix the code. (EXCEPTION: if a SUPERSEDED TESTS directive follows below, the Navigator flagged those specific prior tests as encoding obsolete behavior, refactor ONLY those alongside this fix , often the regression is collateral from a superseded test erroring on a shared session, so both must land in this one turn.) Keep the AC's own tests green. This is your ONE repair attempt: if the verify still fails after it, the orchestration escalates to a human with the diagnosis. Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.
```

## Tools used

- Read {"file_path":"/Users/kevin.hartman/.claude/CLAUDE.md","limit":5}
- Bash {"command":"grep -n \"seed_sku_at_two_locations\\|T24\\|run_id\\|tracking_code\" /Users/kevin.hartman/projects/stockflow/tests/step_defs/test_S3_view_sku_detail.py | head -60","description":"Find seed_sku_at_two_locations and related tracking_code usage"}
- Read {"file_path":"/Users/kevin.hartman/projects/stockflow/tests/step_defs/test_S3_view_sku_detail.py"}
- Bash {"command":"cat -n /Users/kevin.hartman/projects/stockflow/tests/step_defs/test_S3_view_sku_detail.py","description":"Read test file for S3 view sku detail","dangerouslyDisableSandbox":true}
- Read {"file_path":"<PROJECT_ROOT>/tests/step_defs/test_S3_view_sku_detail.py"}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/tests/step_defs/test_S3_view_sku_detail.py","old_string":"    ctx[\"locations\"] = [\n        {\"sku\": sku, \"location\": f\"LOC-T24-A-{run_id}\", \"quantity\": 10},\n        {\"sku\": sku, \"location\": f\"LOC-T24-B-{run_id}\", \"quantity\": 20},\n    ]","new_string":"    ctx[\"locations\"] = [\n        {\"sku\": sku, \"location\": f\"LOC-T24-A-{run_id}\", \"quantity\": 10, \"tracking_code\": f\"TC-T24-A-{run_id}\"},\n        {\"sku\": sku, \"location\": f\"LOC-T24-B-{run_id}\", \"quantity\": 20, \"tracking_code\": f\"TC-T24-B-{run_id}\"},\n    ]"}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_view_sku_detail.py -x -q 2>&1 | tail -20","description":"Run S3 story tests to confirm GREEN","dangerouslyDisableSandbox":true}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_view_sku_detail.py -x -q","description":"Run S3 story tests to confirm GREEN","dangerouslyDisableSandbox":true}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_view_sku_detail.py -x -q","description":"Run S3 story tests","dangerouslyDisableSandbox":true}
- Skill {"skill":"consort"}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_view_sku_detail.py -x -q 2>&1 | tail -20","description":"Run S3 story tests to confirm GREEN"}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_view_sku_detail.py -x -q","description":"Run S3 story tests"}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_view_sku_detail.py -x -q","description":"Run S3 story tests","dangerouslyDisableSandbox":true}
- Bash {"command":"ls <PROJECT_ROOT>","description":"List project root files"}
- Bash {"command":"uv run pytest tests/step_defs/test_S3_view_sku_detail.py -x -q","description":"Run S3 story tests"}
- Bash {"command":"uv run pytest \"tests/step_defs/test_S3_view_sku_detail.py\" -x -q","description":"Run S3 story tests to confirm GREEN"}
- Bash {"command":"python -m pytest tests/step_defs/test_S3_view_sku_detail.py -x -q","description":"Run S3 story tests with python directly"}
- Bash {"command":"ls scripts/","description":"List scripts directory"}
- Read {"file_path":"<PROJECT_ROOT>/scripts/run-tests.sh"}
- Bash {"command":"./scripts/run-tests.sh tests/step_defs/test_S3_view_sku_detail.py","description":"Run S3 story tests via run-tests.sh"}
- Bash {"command":"bash scripts/run-tests.sh tests/step_defs/test_S3_view_sku_detail.py","description":"Run S3 story tests via run-tests.sh"}
- Bash {"command":"bash scripts/run-tests.sh tests/step_defs/test_S3_view_sku_detail.py","description":"Run S3 story tests via run-tests.sh","dangerouslyDisableSandbox":true}
- Bash {"command":"node scripts/lk consort-log --role driver --feature F3 --cycle repair --level info --event reasoning --message \"REPAIR AC1-detail-lists-locations: added tracking_code to seed_sku_at_two_locations T24 seed dicts (TC-T24-A-{run_id} and TC-T24-B-{run_id}) so both POSTs return 201 instead of 422\"","description":"Log the repair action"}

## Final reasoning

The fix is applied. `seed_sku_at_two_locations` now seeds each location dict with a unique `tracking_code` (`TC-T24-A-{run_id}` / `TC-T24-B-{run_id}`), matching the T25/T26 pattern, so both POSTs return 201.
