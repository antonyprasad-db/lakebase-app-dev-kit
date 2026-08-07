# stockflow-optimize (work in progress)

A wall-clock optimization re-record of StockFlow F1, captured via the per-handoff
optimization harness (`optimize-scenario.sh` / `lakebase-sftdd-optimize`). At each
role handoff the harness tries candidate variants (model / effort / session warmth /
loop granularity, plus prompt / reference / inject-vs-scan / tool-scope content
variants) from an identical pre-turn state, keeps the FASTEST candidate that still
passes the same gates, and lets only that WINNER survive here. Every attempt is
preserved under `experiments/`; the surviving `turns/` + `recorded-artifacts/` +
`recorded-build/` are a clean, replayable, internally-consistent corpus.

## Layout
- `intake/` , the design source (product-overview / nfrs / design-brief + the app
  icon asset), fed to the run via `--inputs-from`.
- `recorded-artifacts/features/F1-stock-visibility/feature-request.md` , the PO's
  committed ask the capture seeds.
- `scenario.json.pending` , the manifest. It is renamed to `scenario.json` ONLY when
  the corpus is finalized (the kit convention: a `scenario.json` marks a dir as a
  committed, replay-ready scenario, and `replay-scenarios.test.ts` then requires the
  full corpus). Until then the manifest stays `.pending` so the scenario suite does
  not treat this in-progress dir as a shippable corpus.
- `experiments/` (produced) , every discarded candidate attempt + `champion-walk.json`
  (per handoff: winning candidate + config/content variant + time vs baseline).
- `turns/` + `recorded-artifacts/` + `recorded-build/` (produced) , the surviving
  winners only.

## Goal
Same-quality artifacts (every handoff still gate-passing) with less wall-clock than the
`stockflow-rerecord` baseline (whose `TIMING.md` shows the navigator/driver build lane
is ~84% of the time). The generalizable winning levers are promoted separately into the
kit (agent prompts + `sftdd-config` defaults), gated.
