# architect-reviewer (architect-reviewer) , opus

## Prompt

```
Annotate story S2-stock-by-location-table's acceptance criteria + nfrs.md coverage. Story S2-stock-by-location-table's ACs are: AC1-table-lists-stock-by-location, AC2-quantity-right-aligned, AC3-empty-location-state. For EVERY one of this story's ACs, write a non-empty "architectural_notes" field into its acs/<AC>.json (the layer it lives in + how it realizes the design). This is your distinctive per-AC product; the design gate verifies every AC carries it and the spec-author's "layer" field does NOT count. architectural_notes are per-AC, so annotate this story's ACs even when the feature-level architecture.json already exists from an earlier story. In architecture.json, make an EXPLICIT service_backed call (required): set service_backed:true if the feature persists data (a DB table/migration) or carries business logic, and then you MUST declare boundary, service, and repository layers (plus a "models" PACKAGE app/models/, one module per domain object, NOT a flat app/models.py, when it persists entities); set false ONLY for a trivial static/read-through endpoint. An Infra-layer AC or a migration/schema/storage NFR while service_backed is false hard-blocks the gate. When service_backed:true you MUST also declare architecture.json persistence_invariants[]: the DB-level guarantees the schema enforces (each with id, type one of unique|foreign_key|cascade|not_null|check|transactional|migration_reversible, table, and a one-line brief), covering unique/composite keys, foreign keys + cascade rules, NOT NULL / CHECK constraints, any transactional-atomicity boundary, and migration reversibility. The test-strategist must cover each with a real-branch test; a service_backed feature with no persistence_invariants hard-blocks the gate. REUSE the established project architecture conventions (set by F1-stock-visibility): boundary=app/routes (react), service=app/services, repository=app/repositories, models=app/models. Declare the SAME role -> module paths in architecture.json, do NOT remap or rename an established layer; a divergent layout hard-blocks the spec gate and mismatches the inherited code. Write every artifact under the ABSOLUTE artifact root /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044928/.sftdd (this feature: /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044928/.sftdd/features/F1-stock-visibility/; this story: /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044928/.sftdd/features/F1-stock-visibility/stories/S2-stock-by-location-table/); use that absolute path and never resolve or guess the project root yourself. Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.
```

## Tools used

- Bash cd /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-...
- Edit /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Edit /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Edit /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-044...
- Bash cd /Users/kevin.hartman/code/tdd-workflow-smoke/stockflow-rerecord-cap-20260801-...

## Final reasoning

All three S2 ACs annotated; conventions and NFR coverage inherited from architecture.json. Self-check passes.
