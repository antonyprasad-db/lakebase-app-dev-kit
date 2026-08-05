# driver-green-setup , the self-contained code-asset bundle for the driver-GREEN LIVE check

This directory is the SETUP BUNDLE for `driver-green-executor-dispatch-live.test.ts` (via
`driver-build-support.ts`'s `runDriverGreenLive`). It is deliberately SELF-CONTAINED: the live
driver-GREEN check reaches ONLY here for its pre-step assets, never out to the moving evaluation
corpus (`consort/orchestrator/optimize/evaluation/fixtures`) or `examples/…`. Copied in once, pinned.

## Layout
- `code-assets/` , the POST-RED F6/S3 application tree the run overlays onto a freshly-scaffolded
  project: `app/` + `alembic/` + `client/` + `tests/` INCLUDING the story's AUTHORED RED tests
  (`tests/test_S3_stock_shows_split_fields_fitness.py`, `client/tests/pages/StockView.test.tsx`).
  This is the state right after the Navigator's RED turn , so the driver GREEN has a REAL failing
  test to make pass (an honest-GREEN verify, not a vacuous one). It does NOT carry
  `deploy-targets.yaml` / `scripts/run-tests.sh` / the alembic env / Makefile , those are the
  "package preconditions" that come from the real `createProject` scaffold (the bundle is overlaid
  ON TOP of the scaffold, which provides the honest-GREEN infra).
- `design/` , the design artifacts the driver's context pack reads: `architecture.json`,
  `db-design.json`, `test-list.json` (feature master; the routine scopes S3's items into the
  per-story list), `architecture/conventions.json` (the module LAYOUT), and
  `stories/S3-stock-shows-split-fields/acs/AC1-split-fields-shown.json`.

## Why POST-RED (002), not pre-RED (001)
The driver GREEN's correctness gate is the honest-GREEN verify (alembic upgrade + the project's
tests against the live branch). With no failing test authored, that verify is vacuous. So the bundle
pins the tree AFTER the RED turn , the tests exist and fail , and the live driver makes them pass.

## Provenance
Captured from the stockflow-rerecord corpus (F6-split-tracking-code / S3-stock-shows-split-fields,
turn 002-navigator + the recorded design artifacts), pinned here so the check is stable and
corpus-independent.
