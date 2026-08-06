// LIVE, LEAN (gated RUN_LIVE_STEP=1): the DESIGN half of the shared regression comparison suite.
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/live/design-equivalence-live.test.ts
//
// This closes the corpus-comparison gap the A-full executor-dispatch proofs left open: those proved
// each design turn DISPATCHES through the shipped executor + lands a well-FORMED artifact (conformance
// validators), but NEVER compared the produced artifact SEMANTICALLY to the recorded reference. This
// suite drives every design role through the SAME shipped performViaExecutor path (the catalogue's
// DESIGN_LIVE_SPECS, one source of truth with the per-role dispatch proofs), then , before teardown ,
// judges the produced artifact against the SHARED reference-asset pin via evaluateSemanticGate (the
// relocated consort/evaluation judge, the SAME one the optimization sweep uses). Design bar: >= 0.85.
//
// LEAN , model-API only, NO cloud (design roles are tool-scoped Write/Read, never touch Lakebase).
// The judge is a FIXED opus `claude -p` (makeOpusJudge), constant across roles so the bar never moves.
// Reference resolution honours CONSORT_REFERENCE_CORPUS (default = the shipped pin); a step with no
// pinned reference skips its judgment (skipped:true) rather than false-passing , the coverage guard
// (tests/bdd/reference-assets-coverage-guard.test.ts) is what asserts the pin HAS every design ref.

import { describe, it, expect } from "vitest";
import {
  runDesignExecutorDispatchLive,
  designSpec,
  DESIGN_LIVE_STEPS,
  FEATURE,
} from "./executor-dispatch-live-support.js";
import { evaluateSemanticGate, makeOpusJudge, SEMANTIC_THRESHOLD } from "../../../consort/evaluation/semantic-gate.js";
import type { TurnKey } from "../../../consort/orchestrator/settings/project-settings.js";

const KIT = process.cwd();

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE: design artifacts are SEMANTICALLY equivalent to the pin (executor output vs recorded reference)", () => {
  it.each(DESIGN_LIVE_STEPS.map((s) => [s] as [TurnKey]))(
    "design step %s: executor output >= %s semantic coverage of the pinned reference",
    async (step) => {
      const spec = designSpec(step);
      await runDesignExecutorDispatchLive(spec, {
        afterProduce: async (consortDir) => {
          // Judge the produced artifact against the pin at spec.step , the SHARED judge, the SHARED
          // reference resolver. A step whose reference is not on disk skips (never a false pass); the
          // coverage guard is the separate assertion that the pin CARRIES every design reference.
          const outcome = await evaluateSemanticGate({
            kitRoot: KIT,
            consortDir,
            featureId: FEATURE,
            step: spec.step,
            judge: makeOpusJudge({ cwd: KIT }),
          });
          // eslint-disable-next-line no-console
          console.log(
            `[design-equivalence] ${step}: ${outcome.skipped ? "SKIPPED (no pinned reference)" : outcome.passed ? `PASSED (score ${outcome.score?.toFixed(2)} >= ${SEMANTIC_THRESHOLD})` : `FAILED , ${outcome.reason}`}`,
          );
          expect(
            outcome.passed,
            `${step}: produced artifact not semantically equivalent to the pin , ${outcome.reason ?? "below threshold"}`,
          ).toBe(true);
        },
      });
    },
    900_000,
  );
});
