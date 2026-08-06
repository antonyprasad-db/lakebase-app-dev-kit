# dba (dba) , opus

## Prompt

```
Realize the physical database schema for story S1-split-columns-migration into /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044928/.sftdd/features/F6-split-tracking-code/db-design.json (+ a short db-design.md narrative). Story S1-split-columns-migration's ACs are: AC1-batch-serial-columns-added, AC2-conforming-code-split, AC3-combined-code-dropped, AC4-nonconforming-code-left-null, AC5-all-rows-preserved, AC6-nonconforming-count-surfaced, AC7-migration-reversible, AC8-location-unchanged. Read architecture.json (service_backed, layers, persistence_invariants) , the architect owns that logical contract; you produce the PHYSICAL realization and do NOT re-author the invariants. Declare tables[] (columns with explicit type/nullable/default, primary_key, unique_constraints, foreign_keys, checks, indexes) and this story's schema_changes[] (the per-story migration plan the build lane authors the Alembic migration from; keep an expand/contract column split or drop reversible). Populate realizes_invariants[] as a flat array of the architecture.json persistence_invariant id STRINGS (bare ids, not objects) , an uncovered invariant hard-blocks the spec gate. This feature is service_backed. Mirror the architect's models package (app/models/), one table per domain object. Realize EVERY declared persistence_invariant and list its id in realizes_invariants[]: PI1-batch-serial-nullable [not_null on stock_records] (batch_number and serial_number are added as NULLABLE columns so a nonconforming code (AC4) can persist NULL rather than an invented value; the migration does not impose NOT NULL on them.); PI2-location-key-preserved [unique on stock_records] (The (sku, location) composite uniqueness key established by F1 stays intact; the split migration writes only batch_number/serial_number and never mutates location (AC8).); PI3-rows-preserved [migration_reversible on stock_records] (The up-migration is additive-then-backfill-then-drop with no row deletes, so every pre-migration row survives (AC5, R1); the downgrade reconstructs inventory_code from location+batch+serial and restores the prior schema shape (AC7).). Write every artifact under the ABSOLUTE artifact root /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044928/.sftdd (this feature: /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044928/.sftdd/features/F6-split-tracking-code/; this story: /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044928/.sftdd/features/F6-split-tracking-code/stories/S1-split-columns-migration/); use that absolute path and never resolve or guess the project root yourself. Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.
```

## Tools used

- Read /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Bash ls /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-...
- Bash cat /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801...
- Write /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Write /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Bash ./scripts/lk lakebase-sftdd-response-formatter --role dba --feature F6-split-tra...

## Final reasoning

Conformance passed. Artifacts written to `F6-split-tracking-code/db-design.{json,md}`.
