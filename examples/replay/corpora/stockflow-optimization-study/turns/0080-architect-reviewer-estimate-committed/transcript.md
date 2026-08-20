# architect-reviewer-estimate-committed (architect-reviewer) , opus

## Prompt

```
Estimate the sprint's COMMITTED feature(s) with a t-shirt size (XS/S/M/L/XL). Read each committed feature's request at <PROJECT_ROOT>/.consort/features/<F>/feature-request.md, then ADD one entry per committed feature to <PROJECT_ROOT>/.consort/planning/estimates.json keyed by its REAL feature id (e.g. "F1-stock-visibility", not a "FP" candidate id), each {"feature_id":"<F>","size":"<XS|S|M|L|XL>","rationale":"<why>"}. KEEP every existing estimate already in the file (merge, do not overwrite the candidate sizes). This is the size sync-backlog stamps into the per-sprint backlog, so the committed backlog shows real sizing. Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.
```

## Tools used

- Bash {"command":"cat <PROJECT_ROOT>/.consort/planning/estimates.json; echo \"---FEATURES---\"; ls <PROJECT_ROOT>/.consort/features/","description":"Read estimates and list features"}
- Read {"file_path":"<PROJECT_ROOT>/.consort/features/F6-split-tracking-code/feature-request.md"}
- Edit {"replace_all":false,"file_path":"<PROJECT_ROOT>/.consort/planning/estimates.json","old_string":"      \"rationale\": \"Outbound movement plus the hard invariant: transactional overcommit rejection with no double-allocation, both rejection and success paths observable in the SPA.\"\n    }\n  ]","new_string":"      \"rationale\": \"Outbound movement plus the hard invariant: transactional overcommit rejection with no double-allocation, both rejection and success paths observable in the SPA.\"\n    },\n    {\n      \"feature_id\": \"F6-split-tracking-code\",\n      \"size\": \"S\",\n      \"rationale\": \"Single-table schema refactor on the F1 stock row: add batch/serial columns, delimiter-parse backfill of variable-width codes, drop the combined column, reversible down-path, plus an integrity probe surfacing nonconforming-row counts.\"\n    }\n  ]"}

## Final reasoning

Estimated F6-split-tracking-code as S; merged into estimates.json.
