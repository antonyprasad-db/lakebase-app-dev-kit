# Driver-repair (and -refactor) turn replay , analysis + approach (do NOT re-analyze)

Goal: optimize the **driver-repair turn** the same way as green/red/assess , replay the recorded
turn under lever perturbations and find the config that does the repair **faster at the same quality**.
"Same quality" for a repair (locked with the user): the repair **resolves** (honest-GREEN passes) AND
the next-step **review is no-worse than the recorded** (same smells = same/pass, cleaner = better,
more/different smells = fail). Timing is the optimization axis (wall-clock vs the recorded model's
baseline candidate).

## The finding (why repair isn't a drop-in like green)

A recorded turn's `replay-set/` captures **pre-project (code) + inputs + prompt + levers** , but NOT
the pre-turn **`.consort` cycle state** the drive reads to DERIVE a repair/refactor's routing. Green
doesn't need it (its RED cycle is opened fresh by `beginNextPendingBatch`); repair/refactor DO.

To route the drive to a repair (`orchestrator-drive.ts:157` `repairRegressionAc`), it needs, in
`<consort>/cycles/<feature>/<story>/<ac>/`:
1. an **open-RED cycle record** `cycle-NNN.json` (`red_at` set, no `green_at`) , `storyTestProgress().openRed`
   is `cycles.filter(c => c.red_at && !c.green_at)` and a "cycle" is a `cycle-\d+\.json` file
   (`orchestrator-probe.ts:73`, `pipeline/cycle-record.ts`);
2. `green-failure.json` with `assessed:true` + a non-empty **`fixDirective`** + `repairAttempted != true`
   (`hasPendingRegressionFix` in `smells/supersession.ts` reads `fixDirective` from GREEN-FAILURE, not
   from regression-assessment.json);
3. `regression-assessment.json` , the driver's repair PROMPT reads it (`orchestrator-effects.ts:854`).

## It is ALL in the recorded turn (no reconstruction, a stand-in from actual data)

For sample `0053-driver-repair` (F1 `S3-view-sku-detail` / `AC1-detail-lists-sku-locations`):
- `green-failure.json` , present in the turn's own `files/.consort/cycles/.../AC1/green-failure.json`
  (`assessed:true`, `fixDirective` present, no `repairAttempted`). Copy verbatim.
- `regression-assessment.json` , present in `replay-set/inputs/regression-assessment` (the recorded
  fixDirective input, keys `{diagnosis, fix}`). Copy verbatim.
- `cycle-NNN.json` , the ONLY constructed piece. Build an open-RED `cycle-001.json` from the recorded
  data: feature/story/ac from the bundle, `test_ids` = the AC's items from the recorded
  `test-list-per-story.json` (AC1 = T31-T36), `red_at` = a fixed pre-turn timestamp, NO `green_at`.
  `experiment_slug`/`branch_id` are placeholders the EXISTING "REALIGN repair/refactor seed cycle
  markers" step in `runDriverGreenOnScaffold` rewrites to the just-cut experiment. (Template shape:
  `driver-green-setup/repair-seed/cycles/.../cycle-001.json`.)

This is the hand-curated stand-in **from the actual recorded data** , the legacy `DRIVER_TURN_SEEDS`
was the same idea but hand-curated for a DIFFERENT (reference-assets/stockflow-full StockViewPage)
scenario; we build it from the corpus turn instead.

## The rest is already in place

- **Substrate**: the cloud driver path (`runDriverGreenOnScaffold`) , scaffold + Lakebase branch +
  honest-GREEN. `layBundle`'s `if (b.replay) return` branch already lays pre-project + design +
  test-list + acs via `layReplayPreconditions`; it just needs the repair cycle markers laid too.
- **Next-step eval is STATE-DERIVED** (`runDriver(..., { stopWhen: isDriverTurn, maxSteps: 3 })`), and
  `isNavigatorEval` includes "review" , so a RESOLVED repair routes to a navigator **review** on its
  own (no eval rewrite). One fix: the marker capture reads the AC cycle dir
  (`cycleDir(consortDir, f, s, ac)`), but a review-verdict is STORY-level , also capture the story
  cycle dir.
- **Discriminator is reusable**: recorded `0053`'s next review (`0054`) is **`refactor:false` (clean)**,
  so "no-worse than recorded" = "candidate review clean", which the existing review evaluator
  (`evaluateReviewResolution` via `buildReplayTurnJudge` "review", reference = the turn-after `0054`
  review-verdict) already scores (clean => pass, smells => fail). No new evaluator.

## What to build now (the handroll, in the meantime)

1. `layBundle` replay branch (repair): construct + lay the cycle markers above from the corpus turn.
2. Marker capture: also snapshot the STORY cycle dir (for the review-verdict).
3. `buildReplayTurnJudge` "review" branch: reference = the turn-AFTER's `review-verdict.json` (captures
   `0054`); candidate = the captured next-step review; gate on honest-GREEN.
4. `driver-repair` experiment config (turn `0053`) + run the cloud sweep solo.

## Recorder change (so we STOP handrolling) , the real fix, PLANNED

Root cause = the recorder omits the pre-turn `.consort` cycle state from `replay-set/`. Fix: at turn
start, the recorder snapshots the turn's pre-`.consort` cycle dir (`cycles/<f>/<s>/<ac>/` , the
`cycle-NNN.json` + `green-failure.json` + `regression-assessment.json` + any `review-verdict.json`)
into `replay-set/pre-consort/`. Then:
- the replay path lays `replay-set/pre-consort/` verbatim , no constructed `cycle-NNN`, no per-turn
  handroll, works for EVERY turn kind (repair/refactor/green);
- `DRIVER_TURN_SEEDS` is **retired** (it exists only because this state was missing);
- existing corpora get a one-time **backfill**: reconstruct `pre-consort/` from the union of prior
  turns' produced cycle files (cycle record from the green turn, green-failure/regression from the
  assess) , the same data the handroll uses, done once per turn instead of in the harness.

Owner note: the handroll (above) and the recorder change produce the SAME bytes; the recorder change
just moves the assembly into the recorder + off the live harness. Prefer the recorder change once the
handroll has proven the turn-replay end to end.
