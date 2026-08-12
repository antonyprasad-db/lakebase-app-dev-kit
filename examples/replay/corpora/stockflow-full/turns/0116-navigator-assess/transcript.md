# navigator-assess (navigator) , sonnet

## Prompt

```
DETERMINISTIC contract-clean has ALREADY localized the production-code references to the migration-dropped column(s) below , you do NOT need to re-find them. Record EXACTLY these as a driver-fixable regression via assess-regression --fix (path (b)), AND SEPARATELY flag any prior tests that assert the dropped column as superseded (path (a)) , a column drop needs BOTH the code fix and the test refactor in the same repair turn:
CONTRACT-INCOMPLETENESS (software-design-principles hard rule 9): a migration DROPPED inventory_code, but the running code still references it, so the app emits SQL for a column the database no longer has and crashes ("inventory_code does not exist") even though the migration succeeded. Remove or replace EVERY reference below in the SAME change , the ORM model field, every query/repository, every serializer/DTO, and every template/view , so the code matches the migrated schema. Do NOT edit the migration or any test to hide this; fix the production code:
  app/repositories/stock.py:61  [inventory_code]  any row with both columns NULL had a nonconforming inventory_code.

SUPERSEDED-TEST CANDIDATES (pre-localized; you do NOT need to search): the migration DROPPED inventory_code, and these PRIOR test lines still assert it, so the new AC supersedes them. Flag EXACTLY these test file(s) as superseded (path (a)) so the Driver may permissively refactor them in the SAME repair turn as the code fix. Do NOT hand-edit them to force green:
  tests/step_defs/test_S1_add_and_backfill_columns.py:4  [inventory_code]  T2 – AC1: location and inventory_code remain present and unchanged after migration.
  tests/step_defs/test_S1_add_and_backfill_columns.py:7  [inventory_code]  T9 – AC3: backfill leaves batch_number NULL when inventory_code has fewer than three segments.
  tests/step_defs/test_S1_add_and_backfill_columns.py:8  [inventory_code]  T10 – AC3: backfill leaves serial_number NULL when inventory_code has fewer than three segments.
  tests/step_defs/test_S1_add_and_backfill_columns.py:84  [inventory_code]  """Seed a row with a conforming inventory_code and DELETE it on teardown."""
  tests/step_defs/test_S1_add_and_backfill_columns.py:87  [inventory_code]  inventory_code = f"{location}-BATCH01-SER001"
  tests/step_defs/test_S1_add_and_backfill_columns.py:91  [inventory_code]  "INSERT INTO stock (sku, location, quantity, inventory_code) "
  tests/step_defs/test_S1_add_and_backfill_columns.py:95  [inventory_code]  {"sku": sku, "location": location, "qty": 1, "code": inventory_code},
  tests/step_defs/test_S1_add_and_backfill_columns.py:98  [inventory_code]  yield {"sku": sku, "location": location, "inventory_code": inventory_code}
  tests/step_defs/test_S1_add_and_backfill_columns.py:164  [inventory_code]  # T2 – Given / When / Then  (location and inventory_code unchanged)
  tests/step_defs/test_S1_add_and_backfill_columns.py:169  [inventory_code]  "a stock row is seeded with a known location and inventory_code on the real branch database",
  tests/step_defs/test_S1_add_and_backfill_columns.py:173  [inventory_code]  """Seed a row whose location and inventory_code values are known upfront."""
  tests/step_defs/test_S1_add_and_backfill_columns.py:176  [inventory_code]  inventory_code = f"{location}-BATCHKNOWN-SERKNOWN"
  tests/step_defs/test_S1_add_and_backfill_columns.py:180  [inventory_code]  "INSERT INTO stock (sku, location, quantity, inventory_code) "
  tests/step_defs/test_S1_add_and_backfill_columns.py:184  [inventory_code]  {"sku": sku, "location": location, "qty": 2, "code": inventory_code},
  tests/step_defs/test_S1_add_and_backfill_columns.py:187  [inventory_code]  yield {"sku": sku, "location": location, "inventory_code": inventory_code}
  tests/step_defs/test_S1_add_and_backfill_columns.py:218  [inventory_code]  @then("the seeded row has the same inventory_code value as before the migration")
  tests/step_defs/test_S1_add_and_backfill_columns.py:220  [inventory_code]  """T2: inventory_code is an additive migration — the source column must survive intact."""
  tests/step_defs/test_S1_add_and_backfill_columns.py:223  [inventory_code]  expected_code = seeded_ctx["inventory_code"]
  tests/step_defs/test_S1_add_and_backfill_columns.py:227  [inventory_code]  "SELECT inventory_code FROM stock WHERE sku = :sku AND location = :loc"
  tests/step_defs/test_S1_add_and_backfill_columns.py:234  [inventory_code]  assert row["inventory_code"] == expected_code, (
  tests/step_defs/test_S1_add_and_backfill_columns.py:235  [inventory_code]  f"inventory_code changed by migration: expected {expected_code!r}, "
  tests/step_defs/test_S1_add_and_backfill_columns.py:236  [inventory_code]  f"got {row['inventory_code']!r}"
  tests/step_defs/test_S1_add_and_backfill_columns.py:271  [inventory_code]  "a stock row with a conforming location-batch-serial inventory_code is seeded before the add-and-backfill migration",
  tests/step_defs/test_S1_add_and_backfill_columns.py:275  [inventory_code]  """Seed a stock row whose inventory_code matches <location>-<batch>-<serial>."""
  tests/step_defs/test_S1_add_and_backfill_columns.py:280  [inventory_code]  inventory_code = f"{location}-{batch_segment}-{serial_segment}"
  tests/step_defs/test_S1_add_and_backfill_columns.py:284  [inventory_code]  "INSERT INTO stock (sku, location, quantity, inventory_code) "
  tests/step_defs/test_S1_add_and_backfill_columns.py:288  [inventory_code]  {"sku": sku, "location": location, "qty": 1, "code": inventory_code},
  tests/step_defs/test_S1_add_and_backfill_columns.py:294  [inventory_code]  "inventory_code": inventory_code,
  tests/step_defs/test_S1_add_and_backfill_columns.py:311  [inventory_code]  @then("the seeded row has batch_number equal to the batch segment of its inventory_code")
  tests/step_defs/test_S1_add_and_backfill_columns.py:329  [inventory_code]  f"inventory_code was {conforming_ctx['inventory_code']!r}"
  tests/step_defs/test_S1_add_and_backfill_columns.py:338  [inventory_code]  @then("the seeded row has serial_number equal to the serial segment of its inventory_code")
  tests/step_defs/test_S1_add_and_backfill_columns.py:356  [inventory_code]  f"inventory_code was {conforming_ctx['inventory_code']!r}"
  tests/step_defs/test_S1_add_and_backfill_columns.py:366  [inventory_code]  "a stock row with a nonconforming two-segment inventory_code is seeded before the add-and-backfill migration",
  tests/step_defs/test_S1_add_and_backfill_columns.py:370  [inventory_code]  """Seed a stock row whose inventory_code has only two hyphen-delimited segments
  tests/step_defs/test_S1_add_and_backfill_columns.py:375  [inventory_code]  inventory_code = f"{location}-ONLYBATCH"
  tests/step_defs/test_S1_add_and_backfill_columns.py:379  [inventory_code]  "INSERT INTO stock (sku, location, quantity, inventory_code) "
  tests/step_defs/test_S1_add_and_backfill_columns.py:383  [inventory_code]  {"sku": sku, "location": location, "qty": 1, "code": inventory_code},
  tests/step_defs/test_S1_add_and_backfill_columns.py:386  [inventory_code]  yield {"sku": sku, "location": location, "inventory_code": inventory_code}
  tests/step_defs/test_S1_add_and_backfill_columns.py:397  [inventory_code]  """T9: a nonconforming inventory_code must leave batch_number NULL — not guessed or dropped."""
  tests/step_defs/test_S1_add_and_backfill_columns.py:412  [inventory_code]  f"batch_number should be NULL for nonconforming inventory_code "
  tests/step_defs/test_S1_add_and_backfill_columns.py:413  [inventory_code]  f"{nonconforming_ctx['inventory_code']!r}, got {row['batch_number']!r}"
  tests/step_defs/test_S1_add_and_backfill_columns.py:424  [inventory_code]  """T10: a nonconforming inventory_code must leave serial_number NULL — not guessed or dropped."""
  tests/step_defs/test_S1_add_and_backfill_columns.py:439  [inventory_code]  f"serial_number should be NULL for nonconforming inventory_code "
  tests/step_defs/test_S1_add_and_backfill_columns.py:440  [inventory_code]  f"{nonconforming_ctx['inventory_code']!r}, got {row['serial_number']!r}"
  tests/step_defs/test_S1_add_and_backfill_columns.py:463  [inventory_code]  "the migration must not drop rows whose inventory_code is nonconforming"
  tests/step_defs/test_S1_add_and_backfill_columns.py:608  [inventory_code]  "inventory_code": f"{locations[i]}-BATCH{i:02d}-SER{i:02d}",
  tests/step_defs/test_S1_add_and_backfill_columns.py:622  [inventory_code]  "INSERT INTO stock (sku, location, quantity, inventory_code) "
  tests/step_defs/test_S1_add_and_backfill_columns.py:629  [inventory_code]  "code": r["inventory_code"],
  tests/step_defs/test_S1_add_and_backfill_columns.py:736  [inventory_code]  overwritten by inventory_code segments during the backfill.
  tests/step_defs/test_S1_add_and_backfill_columns.py:757  [inventory_code]  "The migration must not derive or overwrite location from inventory_code."
  tests/step_defs/test_S1_add_and_backfill_columns.py:884  [inventory_code]  "INSERT INTO stock (sku, location, quantity, inventory_code) "
  tests/step_defs/test_S1_add_and_backfill_columns.py:993  [inventory_code]  "inventory_code": f"{locations[i]}-BATCH{i:02d}-SER{i:02d}",
  tests/step_defs/test_S1_add_and_backfill_columns.py:1013  [inventory_code]  "INSERT INTO stock (sku, location, quantity, inventory_code) "
  tests/step_defs/test_S1_add_and_backfill_columns.py:1020  [inventory_code]  "code": r["inventory_code"],
  tests/step_defs/test_S1_add_and_backfill_columns.py:1087  [inventory_code]  columns and backfills them from inventory_code.  It must leave the canonical
  tests/step_defs/test_S1_add_and_backfill_columns.py:1090  [inventory_code]  nonconforming, and NULL inventory_code rows is seeded to cover all backfill
  tests/step_defs/test_S1_add_and_backfill_columns.py:1099  [inventory_code]  # Conforming inventory_code: location-batch-serial.
  tests/step_defs/test_S1_add_and_backfill_columns.py:1103  [inventory_code]  "inventory_code": f"LOC-S1T21-A-{uid}-BAT01-SER01",
  tests/step_defs/test_S1_add_and_backfill_columns.py:1106  [inventory_code]  # Conforming inventory_code: different batch/serial.
  tests/step_defs/test_S1_add_and_backfill_columns.py:1110  [inventory_code]  "inventory_code": f"LOC-S1T21-B-{uid}-BAT02-SER02",
  tests/step_defs/test_S1_add_and_backfill_columns.py:1117  [inventory_code]  "inventory_code": f"LOC-S1T21-C-{uid}-ONLYBATCH",
  tests/step_defs/test_S1_add_and_backfill_columns.py:1136  [inventory_code]  "INSERT INTO stock (sku, location, quantity, inventory_code) "
  tests/step_defs/test_S1_add_and_backfill_columns.py:1143  [inventory_code]  "code": r["inventory_code"],
  tests/step_defs/test_S1_add_and_backfill_columns.py:1180  [inventory_code]  "location must not be derived from or overwritten by inventory_code "
  tests/step_defs/test_S1_add_and_backfill_columns.py:1246  [inventory_code]  "inventory_code": f"{locs[0]}-BATCH01-SER01",
  tests/step_defs/test_S1_add_and_backfill_columns.py:1252  [inventory_code]  "inventory_code": f"{locs[1]}-BATCH02-SER02",
  tests/step_defs/test_S1_add_and_backfill_columns.py:1261  [inventory_code]  "inventory_code": f"{locs[2]}-ONLYBATCH",
  tests/step_defs/test_S1_add_and_backfill_columns.py:1267  [inventory_code]  "inventory_code": f"{locs[3]}-ONLYBATCH",
  tests/step_defs/test_S1_add_and_backfill_columns.py:1273  [inventory_code]  "inventory_code": f"{locs[4]}-ONLYBATCH",
  tests/step_defs/test_S1_add_and_backfill_columns.py:1285  [inventory_code]  "INSERT INTO stock (sku, location, quantity, inventory_code) "
  tests/step_defs/test_S1_add_and_backfill_columns.py:1292  [inventory_code]  "code": r["inventory_code"],
  tests/step_defs/test_S1_add_and_backfill_columns.py:1335  [inventory_code]  f"The probe must surface the exact count of rows whose inventory_code did not "
  tests/step_defs/test_S1_file_stock.py:120  [inventory_code]  "the client POSTs a stock record with that SKU, location, quantity, and inventory_code \"WH-A-LOT-001\"",
  tests/step_defs/test_S1_file_stock.py:128  [inventory_code]  "inventory_code": "WH-A-LOT-001",
  tests/step_defs/test_S1_file_stock.py:199  [inventory_code]  @then("a subsequent GET for that SKU and location returns inventory_code \"WH-A-LOT-001\"")
  tests/step_defs/test_S1_file_stock.py:207  [inventory_code]  assert data.get("inventory_code") == "WH-A-LOT-001", (
  tests/step_defs/test_S1_file_stock.py:208  [inventory_code]  f"expected inventory_code 'WH-A-LOT-001', got: {data.get('inventory_code')!r}"
  tests/step_defs/test_S2_drop_combined_code.py:5  [inventory_code]  inventory_code alongside batch_number and serial_number), the inventory_code
  tests/step_defs/test_S2_drop_combined_code.py:9  [inventory_code]  `alembic upgrade head` leaves the DB at the S1 head revision — inventory_code
  tests/step_defs/test_S2_drop_combined_code.py:10  [inventory_code]  remains in the schema — and the assertion `"inventory_code" not in col_names` fails.
  tests/step_defs/test_S2_drop_combined_code.py:47  [inventory_code]  # T23 – Given  (seed a uuid-suffixed row while inventory_code still exists)
  tests/step_defs/test_S2_drop_combined_code.py:68  [inventory_code]  inventory_code is present at this point (S1 head migration has been applied).
  tests/step_defs/test_S2_drop_combined_code.py:75  [inventory_code]  inventory_code = f"{location}-BATCH01-SER001"
  tests/step_defs/test_S2_drop_combined_code.py:84  [inventory_code]  "INSERT INTO stock (sku, location, quantity, inventory_code) "
  tests/step_defs/test_S2_drop_combined_code.py:87  [inventory_code]  {"sku": sku, "loc": location, "code": inventory_code},
  tests/step_defs/test_S2_drop_combined_code.py:116  [inventory_code]  at the S1 head revision.  inventory_code remains in the schema, causing the
  tests/step_defs/test_S2_drop_combined_code.py:128  [inventory_code]  # T23 – Then  (inventory_code absent from stock table schema)
  tests/step_defs/test_S2_drop_combined_code.py:132  [inventory_code]  @then("the inventory_code column is absent from the stock table schema")
  tests/step_defs/test_S2_drop_combined_code.py:134  [inventory_code]  """T23: after the S2 drop migration, inventory_code must not appear in the
  tests/step_defs/test_S2_drop_combined_code.py:144  [inventory_code]  "the migration must only DROP the inventory_code column, not the whole table"
  tests/step_defs/test_S2_drop_combined_code.py:149  [inventory_code]  assert "inventory_code" not in col_names, (
  tests/step_defs/test_S2_drop_combined_code.py:150  [inventory_code]  f"inventory_code column is still present in the stock table after the S2 drop "
  tests/step_defs/test_S2_drop_combined_code.py:151  [inventory_code]  f"migration.  The S2 migration must issue DROP COLUMN inventory_code.  "
  tests/step_defs/test_S3_view_sku_detail.py:104  [inventory_code]  "inventory_code": tracking_code,
  tests/step_defs/test_S3_view_sku_detail.py:217  [inventory_code]  assert entry.get("inventory_code") == tracking_code, (
  tests/step_defs/test_S3_view_sku_detail.py:218  [inventory_code]  f"inventory_code mismatch: expected {tracking_code!r}, "
  tests/step_defs/test_S3_view_sku_detail.py:219  [inventory_code]  f"got {entry.get('inventory_code')!r} in {entry!r}"
  tests/test_S1_add_backfill_migration_reversible.py:85  [inventory_code]  for required in ("id", "sku", "location", "quantity", "inventory_code"):
  tests/test_stock_db_invariants.py:41  [inventory_code]  def _raw_insert(conn, sku, location, quantity, inventory_code=None):
  tests/test_stock_db_invariants.py:45  [inventory_code]  "INSERT INTO stock (sku, location, quantity, inventory_code) "
  tests/test_stock_db_invariants.py:46  [inventory_code]  "VALUES (:sku, :location, :quantity, :inventory_code)"
  tests/test_stock_db_invariants.py:52  [inventory_code]  "inventory_code": inventory_code,
  tests/test_stock_db_invariants.py:150  [inventory_code]  for required_col in ("id", "sku", "location", "quantity", "inventory_code"):

ASSESS a failed honest-GREEN verify for AC AC1-column-dropped in story S2-drop-combined-code. The Driver made the current test pass, but the full-suite verify against the running app FAILED, some OTHER test(s) now fail.
(a) If the current AC INTENTIONALLY supersedes behavior those failing tests encode, FLAG them so the Driver may permissively refactor ONLY those. The DETERMINISTIC gate has ALREADY pre-localized the COMPLETE superseded set (the SUPERSEDED-TEST CANDIDATES above , a grep of the migration's dropped symbol across every test, including FITNESS / architecture / migration reversibility tests). TRUST it: flag EXACTLY those file(s) in ONE flag-superseded call and do NOT re-read each candidate to re-verify (that re-verification never converges on a large drop set , it is the assess-spin failure). Only search beyond the list if you have concrete reason to believe it MISSED a failing test; otherwise flag the list as-is:
   ./scripts/lk consort-cycle flag-superseded --feature F6-split-tracking-code --story S2-drop-combined-code --ac AC1-column-dropped --reason "<new AC + what changed>" --test <path_or_nodeid> [--test ...] --tdd-dir <PROJECT_ROOT>/.consort
(b) If instead the failure is a GENUINE REGRESSION (the AC does NOT intend to change that behavior; the Driver's code is wrong), record your ROOT-CAUSE diagnosis so it travels to the Driver / the human instead of being lost. When the Driver can fix it, ALSO give a concrete repair directive (this routes a bounded Driver repair turn):
   ./scripts/lk consort-cycle assess-regression --feature F6-split-tracking-code --story S2-drop-combined-code --ac AC1-column-dropped --diagnosis "<the WHY: which behavior broke + the root cause>" [--fix "<what the Driver should change>"] --tdd-dir <PROJECT_ROOT>/.consort
   Include --fix ONLY when the fix is clear + within the Driver's reach (e.g. a wrong default, a missing filter, an off-by-one); OMIT --fix when it needs a human / a design or spec change (the orchestration then escalates carrying your diagnosis).
CRITICAL , recording the verdict is the ONLY output of this turn. The orchestration reads your verdict from <PROJECT_ROOT>/.consort/cycles/F6-split-tracking-code/S2-drop-combined-code/AC1-column-dropped/regression-assessment.json (the assess-regression command writes it). Writing green-failure.json or just explaining the fix in prose is NOT the verdict , without that file a DRIVER-FIXABLE regression wrongly escalates to a human and the sprint halts. Run the ONE command above as a SINGLE line (do not split across lines, do not wrap in bash -c). If for any reason the command will not run, FALL BACK to writing the file directly with the Write tool: {"diagnosis":"<why>","fix":"<what to change>"} at that exact path , the orchestration honors that too.
Flag ONLY tests the new AC truly supersedes; never flag a test just to make a red go away. For a regression, always record a diagnosis (+ fix when driver-fixable) , never nothing. Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.
```

## Tools used

- Bash {"command":"./scripts/lk consort-cycle flag-superseded --feature F6-split-tracking-code --story S2-drop-combined-code --ac AC1-column-dropped --reason \"AC1 drops the inventory_code column; all prior tests that seed, query, or assert on inventory_code are superseded by this migration\" --test tests/step_defs/test_S1_add_and_backfill_columns.py --test tests/step_defs/test_S1_file_stock.py --test tests/step_defs/test_S2_drop_combined_code.py --test tests/step_defs/test_S3_view_sku_detail.py --test tests/test_S1_add_backfill_migration_reversible.py --test tests/test_stock_db_invariants.py --tdd-dir <PROJECT_ROOT>/.consort","description":"Flag all superseded tests referencing dropped inventory_code column"}
- Bash {"command":"./scripts/lk consort-cycle assess-regression --feature F6-split-tracking-code --story S2-drop-combined-code --ac AC1-column-dropped --diagnosis \"app/repositories/stock.py:61 still references inventory_code after the S2 migration dropped the column; any ORM/query path through this repository emits SQL against a non-existent column and crashes with 'inventory_code does not exist'\" --fix \"Remove or replace the inventory_code field reference at app/repositories/stock.py:61 — delete the ORM model attribute, remove it from every SELECT/INSERT/UPDATE in the repository, remove it from any serializer/DTO, and remove it from any template/view that renders it — so the running code matches the migrated schema\" --tdd-dir <PROJECT_ROOT>/.consort","description":"Record regression diagnosis and fix directive for inventory_code reference in production code"}
- Bash {"command":"ls <PROJECT_ROOT>/.consort/cycles/F6-split-tracking-code/S2-drop-combined-code/AC1-column-dropped/","description":"Check existing cycle directory"}
- Write {"file_path":"<PROJECT_ROOT>/.consort/cycles/F6-split-tracking-code/S2-drop-combined-code/AC1-column-dropped/regression-assessment.json","content":"{\"diagnosis\":\"app/repositories/stock.py:61 still references inventory_code after the S2 migration dropped the column; any ORM/query path through this repository emits SQL against a non-existent column and crashes with 'inventory_code does not exist'\",\"fix\":\"Remove or replace the inventory_code field reference at app/repositories/stock.py:61 — delete the ORM model attribute, remove it from every SELECT/INSERT/UPDATE in the repository, remove it from any serializer/DTO, and remove it from any template/view that renders it — so the running code matches the migrated schema\",\"superseded_tests\":[\"tests/step_defs/test_S1_add_and_backfill_columns.py\",\"tests/step_defs/test_S1_file_stock.py\",\"tests/step_defs/test_S2_drop_combined_code.py\",\"tests/step_defs/test_S3_view_sku_detail.py\",\"tests/test_S1_add_backfill_migration_reversible.py\",\"tests/test_stock_db_invariants.py\"],\"superseded_reason\":\"AC1 drops the inventory_code column; all prior tests that seed, query, or assert on inventory_code are superseded by this migration\"}\n"}

## Final reasoning

Verdict written: regression (b) diagnosed with fix directive + superseded test set recorded.
