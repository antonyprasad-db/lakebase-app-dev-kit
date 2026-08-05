// Anti-recurrence guard: a reflection defect must heal the WHOLE story design in
// ONE revise. Regression (stockflow-rerecord run 4): S3 introduced an additive
// column the architect left undeclared; the reflect gate flagged a coupled
// spec-defect + testlist-defect, but the revise re-ran ONLY the routed role
// (test-strategist), never the architect, so the undeclared invariant was never
// declared and the test could not be written, the testlist-defect re-fired and
// hard-halted the headless capture. The fix: a reflect revise re-runs the full
// design lane (stales the architect's product + briefs the architect AND the
// test-strategist) and CO-HEALS every open reflect smell for the story, budgeted
// per-STORY (one re-design, then HIL). Hermetic, tmp .sftdd, no model.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acsDir, acJson, handbackFile } from "../../consort/config/sftdd-paths";
import { applyReviseSelfHeal } from "../../consort/orchestrator/status/revise";
import { recordBlockingSmellFlag } from "../../consort/gates/escalation";
import {
  readSmellsLog,
  priorReflectReviseCount,
  isReflectSmell,
} from "../../consort/smells/smells";
import { writePipeline, type StoryPipeline } from "../../consort/pipeline/story-pipeline";

const FEATURE = "F1-stock-visibility";
const STORY = "S3-sku-detail-view";

let tdd: string;

function pipelineBuilding(): StoryPipeline {
  return {
    version: 1,
    feature_id: FEATURE,
    stories: {
      [STORY]: {
        status: "building",
        gate: { status: "approved", history: [] },
        experiment: { slug: "exp1", status: "active", branch_id: "experiment-s3", opened_at: "t0" },
      },
    },
    build_queue: [],
    build_active: STORY,
  } as unknown as StoryPipeline;
}

function seedArchitectedAc(): void {
  mkdirSync(acsDir(tdd, FEATURE, STORY), { recursive: true });
  writeFileSync(
    acJson(tdd, FEATURE, STORY, "AC1-x"),
    JSON.stringify({
      id: "AC1-x",
      layer: "service",
      given: "g",
      when: "w",
      then: "t",
      status: "draft",
      architectural_notes: "the architect's prior product (must be staled on a reflect revise)",
    }) + "\n",
  );
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "reflect-coheal-"));
  writePipeline(tdd, pipelineBuilding());
  seedArchitectedAc();
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("reflect revise re-runs the full design lane and co-heals per story", () => {
  it("classifies the reflect smells", () => {
    expect(isReflectSmell("reflect-spec-defect")).toBe(true);
    expect(isReflectSmell("reflect-testlist-defect")).toBe(true);
    expect(isReflectSmell("cycle-stall")).toBe(false);
  });

  it("co-heals EVERY open reflect smell for the story in one revise", () => {
    recordBlockingSmellFlag(tdd, "reflect-spec-defect", "undeclared column", { story_id: STORY });
    recordBlockingSmellFlag(tdd, "reflect-testlist-defect", "no migration test", { story_id: STORY });

    applyReviseSelfHeal({
      featureId: FEATURE,
      story: STORY,
      smell: "reflect-testlist-defect",
      routedTo: "test-strategist",
      gate: "test_list",
      reason: "reflection gate found coupled defects",
      approver: "human-proxy",
      sftddDir: tdd,
    });

    const reflect = readSmellsLog(tdd).detected.filter((d) => isReflectSmell(d.smell) && d.story_id === STORY);
    expect(reflect.length).toBe(2);
    expect(reflect.every((d) => d.resolution_kind === "revised")).toBe(true);
    // The per-story budget is now spent, so a re-fired reflection is the hard halt.
    expect(priorReflectReviseCount(tdd, STORY)).toBeGreaterThanOrEqual(1);
  });

  it("re-runs the ARCHITECT (stales its product) and briefs both re-running roles", () => {
    recordBlockingSmellFlag(tdd, "reflect-testlist-defect", "no migration test for the new column", { story_id: STORY });

    applyReviseSelfHeal({
      featureId: FEATURE,
      story: STORY,
      smell: "reflect-testlist-defect",
      routedTo: "test-strategist",
      gate: "test_list",
      reason: "reflection gate found a coverage gap rooted in an undeclared invariant",
      approver: "human-proxy",
      sftddDir: tdd,
    });

    // architectural_notes cleared -> architectAnnotated reads false -> architect re-runs.
    const ac = JSON.parse(readFileSync(acJson(tdd, FEATURE, STORY, "AC1-x"), "utf8"));
    expect("architectural_notes" in ac).toBe(false);
    // The defect brief reached BOTH re-running design roles.
    expect(existsSync(handbackFile(tdd, FEATURE, "architect-reviewer", STORY))).toBe(true);
    expect(existsSync(handbackFile(tdd, FEATURE, "test-strategist", STORY))).toBe(true);
  });
});
