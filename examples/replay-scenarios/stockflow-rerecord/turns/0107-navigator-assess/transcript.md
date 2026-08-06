# navigator-assess (navigator) , sonnet

## Prompt

```
SUPERSEDED-TEST CANDIDATES (pre-localized; you do NOT need to search): the migration DROPPED inventory_code, and these PRIOR test lines still assert it, so the new AC supersedes them. Flag EXACTLY these test file(s) as superseded (path (a)) so the Driver may permissively refactor them in the SAME repair turn as the code fix. Do NOT hand-edit them to force green:
  tests/step_defs/test_S1_file_stock.py:71  [inventory_code]  @when("I post the stock level with a quantity and inventory_code to the file-stock endpoint")
  tests/step_defs/test_S1_file_stock.py:86  [inventory_code]  @then("the branch DB contains exactly one stock_records row capturing that sku, location, quantity, and inventory_code")
  tests/step_defs/test_S1_file_stock.py:164  [inventory_code]  @then("the response contains the exact quantity and inventory_code that were filed")
  tests/step_defs/test_S1_split_columns_migration.py:49  [inventory_code]  def _seed_row(session, sku: str, location: str, inventory_code: str) -> None:
  tests/step_defs/test_S1_split_columns_migration.py:50  [inventory_code]  """Insert a row using only pre-migration columns (inventory_code present)."""
  tests/step_defs/test_S1_split_columns_migration.py:53  [inventory_code]  "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
  tests/step_defs/test_S1_split_columns_migration.py:56  [inventory_code]  {"sku": sku, "location": location, "qty": 1, "code": inventory_code},
  tests/step_defs/test_S1_split_columns_migration.py:114  [inventory_code]  @then("inventory_code does not exist as a column while batch_number and serial_number are present")
  tests/step_defs/test_S1_split_columns_migration.py:117  [inventory_code]  assert "inventory_code" not in cols, (
  tests/step_defs/test_S1_split_columns_migration.py:118  [inventory_code]  f"inventory_code still present after migration: {cols}"
  tests/step_defs/test_S1_split_columns_migration.py:129  [inventory_code]  'a stock row seeded with a uuid-suffixed sku and location and inventory_code "X-1" before the migration',
  tests/step_defs/test_S1_split_columns_migration.py:136  [inventory_code]  # We seed while inventory_code still exists, then the migration will run.
  tests/step_defs/test_S1_split_columns_migration.py:189  [inventory_code]  'a stock row seeded with a uuid-suffixed sku and location and inventory_code "A12-B7-S001" before the migration',
  tests/step_defs/test_S1_split_columns_migration.py:235  [inventory_code]  "a stock row seeded with a uuid-suffixed sku, a known location value, and an inventory_code whose leading segment differs from that location",
  tests/step_defs/test_S3_sku_detail_view.py:123  [inventory_code]  # T27 - AC2: SKU detail entries carry the inventory_code
  tests/step_defs/test_S3_sku_detail_view.py:127  [inventory_code]  "a stock record seeded with a known inventory_code under a unique uuid-suffixed SKU",
  tests/step_defs/test_S3_sku_detail_view.py:166  [inventory_code]  @then("each entry in the SKU-detail response carries the matching inventory_code")
  tests/test_S1_fitness.py:143  [inventory_code]  # T11: NOT NULL constraint on quantity, sku, location, inventory_code
  tests/test_S1_migration.py:53  [inventory_code]  # Required columns must exist (inventory_code was replaced by batch_number + serial_number).
  tests/test_S1_migration.py:59  [inventory_code]  assert "inventory_code" not in columns, (
  tests/test_S1_migration.py:60  [inventory_code]  f"inventory_code must not exist after the split migration round-trip (PI5)."
  tests/test_S1_split_fitness.py:7  [inventory_code]  T9  -- ordering: backfill executes before the inventory_code drop (NFR-F6-6)
  tests/test_S1_split_fitness.py:223  [inventory_code]  """The split migration must add+backfill batch/serial BEFORE dropping inventory_code."""
  tests/test_S1_split_fitness.py:232  [inventory_code]  "No split migration file found that adds batch_number and drops inventory_code. "
  tests/test_S1_split_fitness.py:236  [inventory_code]  # The add_column for batch_number must appear before any drop_column for inventory_code.
  tests/test_S1_split_fitness.py:238  [inventory_code]  drop_pos = src.find("inventory_code")
  tests/test_S1_split_fitness.py:239  [inventory_code]  # Also look for explicit drop_column("stock_records", "inventory_code")
  tests/test_S1_split_fitness.py:243  [inventory_code]  "drop_column not found in split migration -- inventory_code must be dropped"
  tests/test_S1_split_fitness.py:259  [inventory_code]  # Downgrade to before the split so we can seed with inventory_code.
  tests/test_S1_split_fitness.py:276  [inventory_code]  "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
  tests/test_S1_split_fitness.py:371  [inventory_code]  "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
  tests/test_S1_split_fitness.py:414  [inventory_code]  """Single-step round-trip: downgrade -1 reconstructs inventory_code; upgrade head re-splits."""
  tests/test_S1_split_fitness.py:434  [inventory_code]  # After downgrade: inventory_code must be back; batch/serial must be gone.
  tests/test_S1_split_fitness.py:435  [inventory_code]  assert "inventory_code" in cols_after_down, (
  tests/test_S1_split_fitness.py:436  [inventory_code]  f"inventory_code not restored after downgrade -1 (NFR-F6-4). Columns: {cols_after_down}"
  tests/test_S1_split_fitness.py:466  [inventory_code]  assert "inventory_code" not in cols_after_up, (
  tests/test_S1_split_fitness.py:467  [inventory_code]  f"inventory_code still present after re-upgrade (PI3). Columns: {cols_after_up}"
  tests/test_S2_reversible_down_migration.py:7  [inventory_code]  the combined inventory_code schema) behaves correctly per NFR-F6-10:
  tests/test_S2_reversible_down_migration.py:9  [inventory_code]  T15 (AC1-combined-column-restored):    inventory_code column re-appears
  tests/test_S2_reversible_down_migration.py:40  [inventory_code]  """T15 [AC1-combined-column-restored]: after downgrade -1, stock_records exposes inventory_code."""
  tests/test_S2_reversible_down_migration.py:49  [inventory_code]  assert "inventory_code" in columns, (
  tests/test_S2_reversible_down_migration.py:50  [inventory_code]  "inventory_code column not found on stock_records after downgrade -1 "
  tests/test_S2_reversible_down_migration.py:70  [inventory_code]  # Seed at head (batch_number + serial_number columns exist; inventory_code does not).
  tests/test_S2_reversible_down_migration.py:94  [inventory_code]  sa.text("SELECT inventory_code FROM stock_records WHERE sku = :sku"),
  tests/test_S2_reversible_down_migration.py:104  [inventory_code]  f"inventory_code mismatch after downgrade (AC2-code-recombined-from-parts): "
  tests/test_S2_reversible_down_migration.py:172  [inventory_code]  sa.text("SELECT inventory_code FROM stock_records WHERE sku = :sku"),
  tests/test_S2_reversible_down_migration.py:183  [inventory_code]  "inventory_code is NULL after downgrade for a non-conforming row "
  tests/test_S2_reversible_down_migration.py:187  [inventory_code]  f"inventory_code for non-conforming row (NULL batch/serial) must equal "
  tests/test_S3_stock_shows_split_fields_fitness.py:10  [inventory_code]  - fields named inventory_code in its response models (the old combined code
  tests/test_S3_stock_shows_split_fields_fitness.py:14  [inventory_code]  separate JSON fields and carries no inventory_code.
  tests/test_S3_stock_shows_split_fields_fitness.py:86  [inventory_code]  serial_number as separate fields, and must NOT carry inventory_code
  tests/test_S3_stock_shows_split_fields_fitness.py:89  [inventory_code]  This goes RED while the boundary still echoes inventory_code and goes
  tests/test_S3_stock_shows_split_fields_fitness.py:109  [inventory_code]  # inside the boundary. Scanning for 'inventory_code' as a Pydantic field
  tests/test_S3_stock_shows_split_fields_fitness.py:127  [inventory_code]  # Walk the class body looking for inventory_code field declarations.
  tests/test_S3_stock_shows_split_fields_fitness.py:135  [inventory_code]  assert field_name != "inventory_code", (
  tests/test_S3_stock_shows_split_fields_fitness.py:138  [inventory_code]  "declares 'inventory_code'. "

ASSESS a failed honest-GREEN verify for AC AC1-split-fields-shown in story S3-stock-shows-split-fields. The Driver made the current test pass, but the full-suite verify against the running app FAILED, some OTHER test(s) now fail. Inspect EVERY failing test (the COMPLETE set, not a sample) and decide per test:
(a) If the current AC INTENTIONALLY supersedes behavior those failing tests encode (the latest AC wins; e.g. a prior feature's test asserts an outcome this AC deliberately changes), FLAG them so the Driver may permissively refactor ONLY those. Scan COMPREHENSIVELY: when this AC drops, removes, or renames a column / field / table / endpoint, the superseded set is NOT only the tests that NAME it in a query/INSERT/assertion , it ALSO includes FITNESS / architecture / migration tests that assert a PROPERTY of the now-gone shape (migration reversibility like "after up() then down(), <col> is reconstructed", schema-shape checks like "<col> exists", invariants over the old column). Those are superseded too , a reversibility/fitness test for an obsoleted column encodes abandoned behavior. Miss one and the verify stays red and escalates, so list ALL of them in ONE flag-superseded call:
   lakebase-sftdd-cycle flag-superseded --feature F6-split-tracking-code --story S3-stock-shows-split-fields --ac AC1-split-fields-shown --reason "<new AC + what changed>" --test <path_or_nodeid> [--test ...] --tdd-dir /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044928/.sftdd
(b) If instead the failure is a GENUINE REGRESSION (the AC does NOT intend to change that behavior; the Driver's code is wrong), record your ROOT-CAUSE diagnosis so it travels to the Driver / the human instead of being lost. When the Driver can fix it, ALSO give a concrete repair directive (this routes a bounded Driver repair turn):
   lakebase-sftdd-cycle assess-regression --feature F6-split-tracking-code --story S3-stock-shows-split-fields --ac AC1-split-fields-shown --diagnosis "<the WHY: which behavior broke + the root cause>" [--fix "<what the Driver should change>"] --tdd-dir /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044928/.sftdd
   Include --fix ONLY when the fix is clear + within the Driver's reach (e.g. a wrong default, a missing filter, an off-by-one); OMIT --fix when it needs a human / a design or spec change (the orchestration then escalates carrying your diagnosis).
Flag ONLY tests the new AC truly supersedes; never flag a test just to make a red go away. For a regression, always write a diagnosis , never nothing. Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.
```

## Tools used

- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Bash ./scripts/lk lakebase-sftdd-cycle flag-superseded \
  --feature F6-split-trackin...

## Final reasoning

Done.
