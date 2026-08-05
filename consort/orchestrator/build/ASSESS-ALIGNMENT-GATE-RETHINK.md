# Design follow-up: the navigator-ASSESS alignment gate is measuring the wrong thing

Status: RESOLVED. The delta-vs-ground-truth redesign SHIPPED in the optimize/eval layer
(`optimize-semantic-gate.ts` `evaluateNavigatorAssessAlignment` + `makeSupersessionDeltaJudge`,
commit 7a30073d). Task #572 then source-checked the REAL drive and confirmed it is CORRECTLY
optimize-only: the drive routes directly off the navigator's assess marker with NO verdict-
alignment check, and the honest-GREEN re-verify (not a verdict gate) is the runtime functional
backstop , a wrong flag/directive fails re-verify, which re-arms a bounded number of self-heal
rounds then escalates. Runtime has no recorded ground truth to align against, so the gate could
not live there even in principle; it is an EVALUATION instrument, not a runtime gate. No drive
change , see PRODUCTION-IMPROVEMENTS-PLAN.md #3. The finding + evidence below are retained as the
rationale for the delta-judge design.

## What happened (the evidence)

The navigator-assess chain judges the navigator's discriminator verdict (which prior tests are
superseded by a column-drop) against an INDEPENDENT opus oracle that re-reads the driver code cold
and forms its own verdict. Gate passes iff they align (classification match + superseded-set Jaccard
≥ 0.5).

S1 live run (`AC1-batch-serial-columns-added`, pure supersession):

- **Navigator: correct + fast.** Flagged 7 test files, in 119s, with 0 Read / 0 Grep (it trusted
  the pre-localized `supersededTestRefs`). Its 7 files are **BYTE-IDENTICAL to the recorded corpus
  ground truth** (the canonical navigator's superseded-tests.json for this turn). By the only
  objective reference we have, the navigator's answer is exactly right.
- **Oracle: diverged.** classification matched (`superseded-shift` = `superseded-shift`) but the
  oracle's superseded SET differed enough that Jaccard = 0.43 < 0.5 → gate FAILED.

So the gate failed a **provably-correct** navigator because a NOISIER estimator (a cold LLM reading
raw code, WITHOUT the deterministic pre-localization the navigator had) picked a different set.

## The design flaw

I made a **fuzzier signal the arbiter of a better-grounded one.** The oracle:
- reads raw driver code with NO pre-localization advisory (the navigator gets `supersededTestRefs`,
  a deterministic grep of the dropped symbol across the test tree , the oracle does not);
- is a single cold LLM opinion, inherently non-deterministic on set membership;
- has no access to the ground truth the navigator effectively reconstructed.

Yet the gate treats the oracle as reference and the navigator as candidate. When the navigator is
MORE correct than the oracle (as here), the gate produces a false negative. Jaccard-on-exact-paths
compounds it: it cannot distinguish "reasonable disagreement on 1 borderline file" from "wrong
classification" , a 6/7 overlap and a 4/7 overlap are both just numbers below a hard bar.

## Are these turn results non-deterministic-but-comparable-in-coverage?

Yes , and that is the key reframing. Two correct assessors of the SAME supersession can legitimately
differ on set membership at the margin (is a fitness test that only INDIRECTLY references the dropped
column "superseded"? reasonable people/LLMs differ). The classification (superseded-shift vs
regression) is the load-bearing judgment; the exact file set is coverage that varies within a band.
The navigator matching ground truth exactly shows the CORE is deterministic-enough; the oracle
diverging shows the ORACLE is the noisy party, not the navigator.

## Better options than "Jaccard vs a cold oracle" (to debate)

The question isn't just "loosen the bar" , it's "are we discriminating with the right heuristic?"
Options, roughly in increasing fidelity:

1. **Loosen Jaccard (cheapest).** Drop the threshold (e.g. 0.5 → 0.3) or require only classification
   match + non-empty overlap. Quick, but keeps a noisy oracle as arbiter , treats the symptom.

2. **Ground truth as reference, oracle as fallback (recommended primary).** When a recorded
   superseded-tests.json exists for this turn (it does , the corpus), score the navigator's set
   against the RECORDED set, not a fresh oracle. That is the objective reference; the navigator hit
   it exactly here. Reserve the cold oracle ONLY for turns with no recorded baseline. This flips the
   arbiter from "a noisy re-derivation" to "the canonical answer."

3. **Coverage-equivalence, not set-equality.** Judge whether the two sets are COVERAGE-EQUIVALENT
   (do they supersede the same BEHAVIORS / the same dropped-symbol references?), via the opus judge
   framing FUNCTION-not-form , the same philosophy as the build discriminator. Two sets that differ
   by one indirectly-referencing fitness test are coverage-equivalent; a set that misses the core
   drop is not. This tolerates benign non-determinism while still catching a real miss.

4. **Give the oracle the SAME grounding.** If we keep an oracle, feed it the deterministic
   `supersededTestRefs` advisory too (as the navigator gets), so it is not strictly noisier than the
   thing it judges. Reduces divergence, but an oracle handed the answer is a weak independent check.

5. **Classification-match is the gate; set-overlap is a REPORTED metric, not a hard fail.** Since the
   classification is the load-bearing decision and set membership legitimately varies, PASS on
   classification match + surface the Jaccard/coverage delta as an observability number (flag only a
   gross miss, e.g. overlap < 0.2, or a core-symbol test dropped). Honest about what is
   deterministic vs what is a judgment band.

## Recommendation

Combine 2 + 3 + 5: **score against the recorded ground-truth set when present (2); judge
coverage-equivalence rather than exact set-equality (3); make classification-match the hard gate and
report the coverage delta rather than hard-failing on a Jaccard threshold (5).** Keep the cold oracle
only as the no-baseline fallback. Also fix a preservation gap surfaced here: the oracle's raw verdict
+ both sets must be persisted per run (currently only the alignment summary is logged), per the
preserve-experiment-artifacts rule , without the sets on disk this analysis required re-derivation.

## What NOT to conclude

Do NOT read S1 as "the navigator/discriminator is broken." The opposite: the navigator produced the
canonical answer fast and cheaply. The gate is what needs redesign , it currently can fail a correct
turn. Until the gate is reworked, the assess DISCRIMINATOR (classification + marker authoring) is
proven correct on S1 (matches ground truth) and the CLASSIFICATION aligned with the oracle; only the
set-equality sub-check is over-strict.
