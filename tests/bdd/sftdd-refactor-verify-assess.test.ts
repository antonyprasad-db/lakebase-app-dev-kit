// Refactor-verify supersession self-heal. A REFACTOR-phase verify failure used to
// hard-halt to the HIL; now it routes to a bounded Navigator supersession assess
// (flag prior superseded tests -> Driver permissively refactors ONLY those ->
// one honest re-verify), mirroring the deploy-verify assess. This guards the
// marker lifecycle + the drive routing. Regression: F6/S2 in the stockflow
// re-record halted here because the refactor retired a field an earlier story's
// test still asserted (a legitimate supersession with nowhere to route).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeRefactorVerifyAssessMarker,
  readRefactorVerifyAssessMarker,
  markRefactorVerifyAssessed,
  markRefactorVerifyRefactored,
  clearRefactorVerifyAssessMarker,
  refactorVerifyNeedsAssess,
  refactorVerifyRefactorPending,
} from "../../scripts/sftdd/refactor-verify-assess";
import { nextTransition, type DriveState } from "../../scripts/sftdd/orchestrator-drive";

const F = "F6-split-tracking-code";
const S = "S2-batch-serial-fields-in-stock-view";
let tdd: string;

function seedFeature(): void {
  // findFeatureDir resolves a feature by its dir under <sftdd>/features/<F>.
  mkdirSync(join(tdd, "features", F, "stories", S), { recursive: true });
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "refactor-verify-assess-"));
  seedFeature();
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("refactor-verify-assess marker lifecycle", () => {
  it("is assess-eligible on a fresh failure, not after it is assessed (one-shot)", () => {
    writeRefactorVerifyAssessMarker(tdd, F, S, { summary: "client suite failed", supersededAdvisory: "SkuDetailView.test.tsx asserts retired trackingEl" });
    expect(refactorVerifyNeedsAssess(tdd, F, S)).toBe(true);
    // The advisory is carried for the Navigator's assess directive.
    expect(readRefactorVerifyAssessMarker(tdd, F, S)?.superseded_advisory).toMatch(/trackingEl/);
    markRefactorVerifyAssessed(tdd, F, S, ["client/tests/pages/SkuDetailView.test.tsx::renders location rows"]);
    expect(refactorVerifyNeedsAssess(tdd, F, S)).toBe(false); // one shot spent
    expect(refactorVerifyRefactorPending(tdd, F, S)).toBe(true); // flagged set -> driver refactor
  });

  it("with NO flagged tests (the Navigator veto), assessed => not refactor-pending (escalates)", () => {
    writeRefactorVerifyAssessMarker(tdd, F, S, { summary: "genuine regression" });
    markRefactorVerifyAssessed(tdd, F, S); // no flagged tests
    expect(refactorVerifyRefactorPending(tdd, F, S)).toBe(false);
  });

  it("preserves the spent attempt across a re-detection (bound not reset)", () => {
    writeRefactorVerifyAssessMarker(tdd, F, S, { summary: "fail 1" });
    markRefactorVerifyAssessed(tdd, F, S);
    // A repeat failure re-writes the marker but must NOT resurrect the one shot.
    writeRefactorVerifyAssessMarker(tdd, F, S, { summary: "fail 2" });
    expect(refactorVerifyNeedsAssess(tdd, F, S)).toBe(false);
  });

  it("refactored + cleared behave correctly", () => {
    writeRefactorVerifyAssessMarker(tdd, F, S, { summary: "x" });
    markRefactorVerifyAssessed(tdd, F, S, ["a::b"]);
    markRefactorVerifyRefactored(tdd, F, S);
    expect(refactorVerifyRefactorPending(tdd, F, S)).toBe(false); // refactored -> no longer pending
    clearRefactorVerifyAssessMarker(tdd, F, S);
    expect(readRefactorVerifyAssessMarker(tdd, F, S)).toBeUndefined();
  });
});

describe("drive routes a refactor-verify failure to assess, then permissive refactor", () => {
  function buildState(over: Record<string, unknown>): DriveState {
    return {
      phase: "feature",
      buildActive: S,
      stories: {
        [S]: {
          design: {},
          build: { experimentCut: true, ...over },
        },
      },
    } as unknown as DriveState;
  }

  it("routes the Navigator assess-refactor turn when a refactor-verify failure is assess-eligible", () => {
    const a = nextTransition(buildState({ refactorVerifyAssessEligible: true }));
    expect(a).toMatchObject({ kind: "invoke-role", role: "navigator", story: S, buildMode: "assess-refactor" });
  });

  it("routes the Driver permissive-refactor turn once superseded tests are flagged", () => {
    const a = nextTransition(buildState({ refactorVerifyRefactorPending: true }));
    expect(a).toMatchObject({ kind: "invoke-role", role: "driver", story: S, buildMode: "refactor-superseded" });
  });

  it("assess pre-empts a plain refactor re-route (no blind re-refactor loop)", () => {
    // Both refactorStoryPending (unstamped after the failed verify) AND assess
    // eligible: the assess must win so the failure is diagnosed, not re-run.
    const a = nextTransition(buildState({ refactorStoryPending: true, refactorVerifyAssessEligible: true }));
    expect(a).toMatchObject({ buildMode: "assess-refactor" });
  });
});
