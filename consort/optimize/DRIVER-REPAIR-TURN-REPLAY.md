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

## Smoke result (1 candidate, sonnet, turn 0053) , pipeline VALIDATED; fixed a handroll test_ids bug

Ran the single-candidate live smoke (commit 1e581502). What worked: `layReplayRepairCycle` ROUTED the
drive to a repair (`[executor] dispatch driver-repair`), the driver repaired live (265.6s), honest-GREEN
ran, and the judge scored it. It FAILED , and the diagnosis was a HANDROLL BUG, not a fundamental limit:

- The recorded build cadence is **story-level , ONE cycle per story.** The recorded S3 `cycle-001.json`
  (filed under the assessed AC's dir) covers the WHOLE story's tests `T31-T43` (all ACs), red_at+green_at.
- My first `layReplayRepairCycle` built `cycle-NNN` with only the **repaired AC's** test_ids (T31-T36),
  so the story's OTHER tests (T37-T43) had no cycle => "pending" => after the repair greened AC1 the drive
  routed to MORE BUILDING, never the story-level REVIEW. The next-step eval (`stopWhen: isDriverTurn`) then
  stopped at that driver turn (no navigator eval ran), and the marker capture picked up my SEEDED
  cycle-001 + regression-assessment (verified byte-identical = contamination) => review judge failed.

FIX (commit follows): build `cycle-001` with the **WHOLE story's** test_ids (the full test-list, not
filtered by ac), matching the recorded story-wide cycle. Then greening the repair completes the story =>
story-level REVIEW => review-verdict at the story dir => captured => judged. `0053` IS an appropriate
corpus record for tuning this turn , the earlier "handroll insufficient / need the recorder change"
conclusion was WRONG (the record + single-cycle handroll are fine; only the test_ids filter was the bug).

The recorder change (snapshot full pre-`.consort`) is still the cleaner GENERAL fix + retires the
synthesised cycle-NNN + DRIVER_TURN_SEEDS, but it is NOT required to tune the repair turn , the corrected
handroll suffices for story-cadence repairs like 0053.

Cleanup note: the smoke's teardown logged "dg-live-... still present after 5 delete attempts" , eventual-
consistency lag; a follow-up `list-projects` showed NO dg-live projects (it deleted).

## Panel result + discriminator fix (the repair turn now tunes)

Full 5-lever panel (turn 0053, live cloud). With the fresh-opus-high REVIEW judge, ALL 5 FAILED
`review:refactor-requested` , but the diagnosis (verified) was a discriminator flaw, not lever quality:
every candidate (incl opus) correctly routed the page (App.tsx SkuDetailPage refs=2) + had clean
layering/NFRs per the review, yet all failed on a home-row-link IA nuance the recorded CLEAN review
(0054) never required. A fresh opus-high re-review is simply STRICTER than the recorded reviewer, so
"no-worse than recorded" is systematically unfair for a subjective review.

FIX (commit 6265867c): judge the repair by CODE-equivalence to the recorded OUTPUT (buildDriverRepairCodeJudge
, functional equivalence of the candidate's client/app code vs the code the recorded repair produced),
GATED on honest-GREEN (repair resolved). Wired into sweepDriverGreen AND `--rejudge`. RE-JUDGING the
preserved panel (no live re-run , `--rejudge <run> --experiment driver-repair-panel.json`) with the code
judge: ALL 5 HOLD.

| candidate    | code-score | wall    | cost   |
|--------------|-----------:|--------:|-------:|
| sonnet (base)| 0.90       | 304.7s  | $0.460 |
| sonnet-e-low | 0.90       | 281.7s  | $0.342 |
| haiku        | **1.00**   | 307.0s  | **$0.243** |
| haiku-e-low  | 0.95       | 339.8s  | $0.287 |
| opus         | 0.95       | 323.8s  | $0.895 |

Finding: the repair turn is WELL-CONSTRAINED (fixDirective + failing tests pin the output), so even haiku
holds FULL code-equivalence (1.00) at ~baseline speed and ~1/4 the opus cost , opus is over-provisioned.
Timings are close (281-340s, n=1, noisy); the clear signal is COST (haiku $0.243 vs opus $0.895 at
equal-or-better quality). Confirm with replicas (like assess/red) before flipping the repair lever.

## Confirm sweep (haiku x3 + sonnet-e-low x3) => FLIPPED driver-repair to haiku

n=4 each (3 confirm replicas + the panel run), all HOLD code-equivalence vs the recorded output:

| lever        | code-equiv (mean) | wall (mean, range)      | cost (mean) |
|--------------|-------------------|-------------------------|-------------|
| haiku        | **0.99** (0.95-1.0)| 301.8s (260-358, sd 37) | **$0.20**   |
| sonnet-e-low | 0.91 (0.85-1.0)   | 282.2s (262-309, sd 17) | $0.31       |
| sonnet (base, n=1)| 0.90         | 304.7s                  | $0.46       |

Neither is a big SPEED win (all ~300s , the repair isn't slow enough per-turn to speed up much). The win
is COST + FIDELITY: haiku is cheapest (~$0.20, ~2.3x under the sonnet baseline) AND has the highest
code-equivalence (0.99 , its repairs match the recorded output best), holding across all 4 runs.
FLIPPED `driver-repair.json` agentOptions model sonnet -> **haiku** (only manifest on the `repair` turnKey;
the single config home). Resolver assertion added (consort-config.test.ts). All consumers now default to it.

## METHOD CORRECTION: two-turn quality (next-turn determination, ACTUAL navigator model)

Code-equivalence was the WRONG discriminator (there are always non-deterministic diffs; the navigator's
assessment prompts ALREADY gauge code quality). The correct method is the QUALITY of the NEXT turn: after
the repair, run the navigator's ACTUAL next assessment (a story-level REVIEW of the resolved code) and
compare ITS determination to the RECORDED next-step review , a TWO-TURN review (same/better/worse via
evaluateNextStepDetermination). Two fixes:
1. `runDriverGreenOnScaffold` next-turn eval now runs the navigator with its ACTUAL CONFIGURED model
   (resolveConsortSettings on the workspace = the applied-winner lever per turn: assess=opus, review=
   sonnet/low), NOT a pinned opus-high. The opus-high pin was pathologically strict , it flagged smells
   (a home-row-link IA nuance) the recorded reviewer passed, failing every correct repair. The actual
   configured reviewer matches the recorded reviewer's calibration => a fair comparison.
2. `buildDriverTurnCodeJudge` -> `buildDriverRepairNextStepJudge`: compare the candidate's captured
   next-turn review-verdict to the recorded next review (readRecordedNextReview, the turn-after's
   review-verdict), review evaluator, gated on honest-GREEN.

CONSEQUENCE: the earlier code-equivalence panel/confirm results (and the haiku flip) are INVALIDATED , they
must be re-run with this method (the preserved runs captured opus-high determinations, unusable here). Green
uses the same two-turn method already (buildDriverNextStepJudge); refactor's recorded next turn is
acceptance (no review), so it needs a forced post-refactor review , DEFERRED.
