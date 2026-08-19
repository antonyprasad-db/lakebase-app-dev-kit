# navigator-red lever panel , tune DOWN from the opus default

Turn `0088-navigator` (F6 S1-add-and-backfill-columns, the richest recorded RED turn), replayed through
the corpus-faithful lean path. Discriminator = functional coverage of the candidate's authored tests vs
the tests THAT turn recorded (makeOpusJudge functional:"tests"); all candidates cleared the coverage bar.

| candidate | wall | cost | turns | coverage | holds? |
|-----------|------|------|-------|----------|--------|
| **sonnet-e-low** | **129.4s** | **$0.54** | 24 | 0.97 | yes |
| opus (current default) | 188.0s | $1.02 | 18 | 0.96 | yes |
| haiku-e-low | 202.5s | $0.30 | 31 | 0.85 | yes (near floor) |
| haiku | 227.3s | $0.41 | 49 | 1.00 | yes |
| sonnet (default effort) | 687.2s | $2.08 | 51 | 0.95 | yes (OUTLIER) |

## The finding

RED is the mirror image of assess. Assess needs deep reasoning, so opus won there. RED is mechanical
(author the story's failing tests from the test-list spec), so the expensive model is OVER-PROVISIONED:

- **sonnet-e-low dominates the opus default**: ~31% faster (129.4s vs 188.0s), ~half the cost
  ($0.54 vs $1.02), and coverage is a statistical tie (0.97 vs 0.96). It is the candidate to adopt.
- haiku variants also hold coverage (RED doesn't misfire on haiku the way assess did), but they are
  SLOWER than sonnet-e-low here and haiku-e-low's 0.85 sits near the coverage floor (riskier).
- The plain-sonnet outlier (687.2s, 51 turns, $2.08) is a loud VARIANCE signal , RED run-to-run turn
  counts ranged 18-51. A single sonnet-e-low sample at 129.4s could be lucky.

## Call

sonnet-e-low is the tuning win for RED (faster + cheaper than the opus default, holds coverage). But
given the variance (the sonnet outlier), CONFIRM with replicas + a live opus baseline before flipping ,
exactly as the assess turn was confirmed. The harness crowns no winner because the coverage score only
matches (never beats) , orthogonal to the speed/cost objective. n=1 per candidate.
