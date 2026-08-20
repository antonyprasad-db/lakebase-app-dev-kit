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

## Recorder change (so we STOP handrolling) , DONE; handroll RETIRED

Root cause = the recorder omitted the pre-turn `.consort` state from `replay-set/`. Fixed + the handroll retired:
- **Capture** (`recordReplaySet`, turn-recorder.ts): at turn start (pre-state), snapshots the FULL pre-turn
  `.consort` STATE tree into `replay-set/pre-consort/` , everything the drive reads to derive routing
  (cycles/features/experiments/design/architecture/planning/sprints/deploy/escalations + smells/workflow/
  run-config/selection-log). EXCLUDES append-only event STREAMS (`agent-log.jsonl`, `correspondence.jsonl` ,
  already mirrored separately, and O(turns^2) if snapshotted per-turn) + runtime ephemera (`*.pid/lock/sock`,
  `agent-live.log`) via `preConsortKeep`. Hermetic: replay-set-recorder.test.ts.
- **Replay** (`layBundle`, driver-build-support.ts): lays `replay-set/pre-consort/` VERBATIM (`cpSync`) as the
  starting `.consort` , works for EVERY turn kind, no constructed `cycle-NNN`. A repair/refactor turn WITHOUT
  pre-consort now THROWS a clear error pointing at a pre-consort corpus (the handroll is gone).

RETIRED (proven first, per the owner): `layReplayDriverPreCycle` (the handroll) + `DRIVER_TURN_SEEDS` (the
legacy seed) are DELETED. PROOF (live, 1-pass): replayed `0067-driver-refactor` from stockflow-optimization-study
with `LAKEBASE_SFTDD_CORPUS_DIR` pointed at it , `[layBundle] laid pre-turn .consort verbatim` (no handroll),
the drive routed the S3 refactor from the verbatim state, refactored, forced re-review CLEAN, honest-GREEN
judge PASSED (355.5s). Consequences:
- Repair/refactor replays now REQUIRE a pre-consort corpus. The only one today is **stockflow-optimization-study**
  (recorded with the recorder change). Run repair/refactor experiments with
  `LAKEBASE_SFTDD_CORPUS_DIR=examples/replay/corpora/stockflow-optimization-study` (a new env override on
  `CORPUS_DIR`). The default `replayBundleForTurn` turns + the driver-repair/refactor-panel configs now point at
  that corpus's turns (repair=0065-driver-repair, refactor=0067-driver-refactor).
- GREEN needs no pre-consort (opens its own RED cycle) , its default stays the stockflow-full `0156-driver`.
- stockflow-full (pre-recorder-change) can still replay GREEN/RED/assess/review, but NOT repair/refactor (no
  pre-consort) , that is intentional (fail loud), not a regression.

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

## Corrected-method panel result , haiku flip REVERTED; 0053 (clean) is untunable; use a smelly sample

Re-ran the 5-lever panel with the CORRECT method (two-turn determination, actual navigator model). Result:
ALL 5 FAILED review:refactor-requested (sonnet 284.6s, sonnet-e-low 241.9s, haiku 315.9s, haiku-e-low 239.2s,
opus 329.0s); the earlier smoke-haiku was the ONLY clean run (review:clean, 235.7s). So ~1/6 runs hold the
clean bar , the actual-model review reliably finds the reachability/IA smell that recorded 0053->0054 did not.
The method DISCRIMINATES fairly (not opus-high all-fail, not code-equiv all-pass), but 0053's recorded-CLEAN
review is a HARD, high-variance bar that live repairs rarely hold => NOT tunable (can't rank holders).

ACTIONS: (1) REVERTED driver-repair haiku->sonnet (the flip's code-equiv basis is invalid; the correct
method does not support haiku , 1/2 haiku runs clean). driver-repair is UNTUNED (base sonnet) until a proper
run. (2) For tuning, use a recorded-SMELLY sample (0037 F1-S2 or 0158 F6-S3, both recorded review:refactor-
requested) , the bar becomes "no-worse than that recorded smell", which candidates reproducing the recorded
quality can HOLD => rankable. 0053 stays the pipeline-validation sample, not the tuning sample.

## Driver-REFACTOR turn , the tuning target + the forced-re-review pipeline (BUILT)

Tuning target (user-locked): the refactor **completes CLEANLY in this one step** , a clean refactor leaves no
smell, so no follow-on refactor loop is needed. Success == the post-refactor code passes a fresh review
(refactor:false). This is NOT code-equivalence (non-deterministic diffs always exist); it is the two-turn
QUALITY method , the navigator's ACTUAL review (configured model, not opus-high) gauges the refactored code.

Corpus sample: **`0039-driver-refactor`** (F1 `S2-view-home-stock-table`, story-level, `ac:""`). The recorded
review directive (`0038`'s review-verdict, at `recorded-artifacts/cycles/F1/S2/review-verdict.json`) is
`refactor:true` with design-vocabulary CSS smells (HomePage.tsx `<table>` missing `className="table"`;
`stock-table__quantity` undefined vs the guide's `.table__num`). The refactor must resolve THOSE.

Why refactor needed a forced re-review (repair did not): a resolved repair routes to a navigator review on
its OWN (state-derived). A refactor's recorded NEXT turn is **acceptance** (`0040`) , no natural re-review. So
the harness FORCES one: after the refactor turn, `runDriverGreenOnScaffold` (refactor branch) **resets the
story review state** (removes the story `review.json` + seeded `review-verdict.json`), leaving green +
unreviewed => the drive's `reviewStoryPending` routes a FRESH navigator review of the refactored code. Its
verdict lands at the story cycle dir, captured into `nextStepMarker` (`review-verdict.json`).

What was built (commit on feat/driver-green-levers):
1. `layReplayDriverPreCycle` refactor branch , seeds BOTH `review.json` (refactor_requested, routes
   `refactorPending`, verbatim from the turn's own `.consort`) AND `review-verdict.json` (the directive, the
   refactor route's REQUIRED process event, from `CORPUS_RA`). Story-level cycle (`green_at` set = all-green).
2. Forced post-refactor re-review (the review-state reset above), reviewer on the CONFIGURED navigator model.
3. Judge `buildDriverRefactorNextStepJudge(feature, story)` , DRY-shared `buildReviewResolutionJudge` (repair
   uses it too): gate on honest-GREEN, then `evaluateNextStepDetermination(review)` (=> `evaluateReviewResolution`)
   compares the forced review-verdict to the recorded directive , **refactor:false => PASS (resolved/clean,
   one-step, terminal); refactor:true => FAIL (same issue = unresolved / different = new problem).** Reference
   = `readRecordedRefactorDirective` (the UPSTREAM directive from `CORPUS_RA`, NOT the turn-after which is
   acceptance). Wired into `sweepDriverGreen` AND `--rejudge` (`isRefactorExperiment`). Config
   `driver-refactor-panel.json` (5 levers, `ac:""`). Hermetic: bdd 927 suites green, tsc clean.

Beyond model levers, the preserved tool-call traces (`transcripts/`) inform prompt-revision levers if a clean
one-step refactor proves hard to hold.

## Smoke result (1 candidate, sonnet, turn 0039) , pipeline VALIDATED end to end + fixed a stopWhen bug

Two live single-candidate smokes (RUN_LIVE_STEP=1 LAKEBASE_TEST_E2E=1) proved the WHOLE path, and the two
runs happened to exercise BOTH judge branches (non-determinism is the point):
- Routing: `[executor] dispatch driver-refactor` fired (seeded review.json refactor_requested + review-verdict
  process event route it). The refactor resolved the recorded design-token smells (className="table",
  `.table__num` on the quantity cell), 19 client tests green.
- Forced re-review: after the refactor, the review-state reset routes `[executor] dispatch navigator-review`
  (the recorded flow would go straight to acceptance). It runs on the CONFIGURED navigator model, writes the
  story review-verdict, captured into nextStepMarker.
- Judge: run #1's review came back CLEAN (`refactor:false`) => would PASS (resolved in one step). Run #2's
  sonnet refactor left a DIFFERENT smell (an empty-state NFR , renderStockSection returns null for
  loading/error) => review `refactor:true` => judge FAILED (`review:refactor-requested`, quality below
  baseline), 282.8s , a LEGITIMATE quality verdict, not a DQ.

BUG FOUND + FIXED (commit 3eed018c): the next-step eval ran the drive with `stopWhen=isDriverTurn`, so a CLEAN
review (which routes to acceptance -> promote `git checkout production`, a branch the scaffold lacks) threw and
DQ'd the candidate on a harness artifact. (Repair never hit this: its review requests refactor => next action
IS a driver turn => stops.) Fixed: stop once the ONE navigator-eval turn has run, whether the drive hands back
to a driver turn OR advances past the eval (`evalTurnRan` guard + maxSteps backstop). Re-smoke: no DQ, clean
FAIL verdict. Config fix (commit 1abb0a8b): a refactor turn is story-scoped => `ac` optional in the experiment
config (loadExperimentConfig required it for non-RED turns). Local dg-live orphans verified gone (list-projects
= 0; eventual-consistency lag, not a leak).

FINDING (like 0053 repair): 0039's clean-in-one-step bar is HIGH-VARIANCE for sonnet , run #1 clean, run #2 left
a different NFR smell. A single run is NOT decisive; the panel must use REPLICAS and rank levers by clean-HOLD
rate (fraction of runs the post-refactor review is clean), not one shot.

## Panel result (5 levers x 3 replicas, turn 0039) => WINNER: OPUS (shipped v0.3.9)

Ran the full panel with replicas (rank by clean-HOLD rate, tiebreak wall then cost):

| lever         | clean-hold | mean wall | mean cost |
|---------------|-----------:|----------:|----------:|
| **opus**      | **2/3**    | **334s**  | \$0.361   |
| haiku-e-low   | 2/3        | 394s      | \$0.179   |
| sonnet        | 2/3        | 710s      | \$0.409   |
| sonnet-e-low  | 2/3 (1 DQ) | 827s      | \$0.248   |
| haiku (was default) | **1/3** | 1142s   | \$0.207   |

Four levers tie at 2/3 clean-hold; the prior HAIKU default is the WORST (1/3, and it THRASHES , ~1142s, ~3-4x
the others). Among the 2/3 holders OPUS is the FASTEST (~334s , it nails the refactor without churn), and that
efficiency makes it CHEAPER than sonnet (\$0.361 vs \$0.409) despite the per-token premium , opus DOMINATES
sonnet on all three axes. vs haiku-e-low: opus is faster (334 vs 394) at ~2x cost (+\$0.18/turn), but
haiku-e-low rides the haiku family that showed the worst full-effort result, so its low-effort 2/3 is not a
tier to trust for a QUALITY-CRITICAL turn. Refactor is judgment-heavy (find + resolve ALL smells) => the
strongest tier wins, exactly like ASSESS. FLIPPED all three refactor manifests (driver-refactor,
-refactor-deploy, -refactor-superseded) model haiku -> **opus** (the single per-turn config home) + resolver
assertion (consort-config.test.ts). Shipped in v0.3.9. The sonnet-e-low DQ was an INFRA hiccup (the throwaway
worktree's client vitest needed npm install , it had already resolved the smells correctly), not a quality or
routing failure. Residual: 2/3 (not 3/3) is the variance ceiling for a single-turn model lever; a future
prompt-revision lever (enumerate ALL open review-verdict notes, not just the design-token ones , the FAIL runs
left an empty-state NFR unaddressed) could push toward 3/3, informed by the preserved `transcripts/` tool traces.
