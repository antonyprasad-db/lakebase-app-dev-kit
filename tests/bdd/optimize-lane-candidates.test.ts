// P3-prep (#502): per-role candidate defaults for the DESIGN lane sweep. Design
// roles carry a SCALAR model/effort (roles.<role>.model = "opus"), not the
// per-turn map generateCandidates emits for build turns, so the lane sweep needs
// role-appropriate candidate sets. defaultLaneCandidates builds them: baseline +
// a model-downgrade + an effort-drop + one prompt/scope content variant , the
// "model + effort + a prompt/scope variant" axis. The navigator REFLECT turn is a
// critic gate (it FLAGS defects), not an authoring turn, so it is not swept.

import { describe, expect, it } from "vitest";

import { defaultLaneCandidates } from "../../scripts/sftdd/optimize-candidates";
import type { HandoffPlan } from "../../scripts/sftdd/optimize-harness";

function h(role: string, story?: string, buildMode?: string): HandoffPlan {
  return { id: `${story ? story + "-" : ""}${role}${buildMode ? "-" + buildMode : ""}`, role, story, buildMode };
}

describe("defaultLaneCandidates: design roles (scalar model/effort)", () => {
  it("baseline first, then a scalar model downgrade (opus->sonnet)", () => {
    const cands = defaultLaneCandidates(h("architect-reviewer", "S1"));
    expect(cands[0].id).toBe("baseline");
    const model = cands.find((c) => typeof c.configOverrides.roles?.["architect-reviewer"]?.model === "string");
    expect(model).toBeDefined();
    expect(model!.configOverrides.roles!["architect-reviewer"]!.model).toBe("sonnet");
  });

  it("includes an effort-drop candidate (default->low) as a scalar effort", () => {
    const cands = defaultLaneCandidates(h("dba", "S1"));
    const effort = cands.find((c) => c.configOverrides.roles?.dba?.effort === "low");
    expect(effort).toBeDefined();
  });

  it("includes one prompt/scope CONTENT variant (a scan-tightening taskSuffix)", () => {
    const cands = defaultLaneCandidates(h("test-strategist", "S1"));
    const content = cands.find((c) => c.content?.taskSuffix);
    expect(content).toBeDefined();
    expect(content!.content!.taskSuffix).toMatch(/./); // non-empty directive
  });

  it("ids are unique + stable", () => {
    const cands = defaultLaneCandidates(h("spec-author", "S1"));
    expect(new Set(cands.map((c) => c.id)).size).toBe(cands.length);
  });

  it("does NOT sweep the navigator reflect critic turn (returns baseline-only)", () => {
    const cands = defaultLaneCandidates(h("navigator", "S1", "reflect"));
    expect(cands).toHaveLength(1);
    expect(cands[0].id).toBe("baseline");
  });

  it("a feature-scope design role (ux-designer, no story) still gets a candidate set", () => {
    const cands = defaultLaneCandidates(h("ux-designer"));
    expect(cands.length).toBeGreaterThan(1);
    expect(cands.some((c) => typeof c.configOverrides.roles?.["ux-designer"]?.model === "string")).toBe(true);
  });
});

describe("defaultLaneCandidates: build roles (per-turn map)", () => {
  it("a build turn uses the per-turn model map (navigator RED)", () => {
    const cands = defaultLaneCandidates(h("navigator", "S1")); // no buildMode -> RED
    const model = cands.find((c) => {
      const m = c.configOverrides.roles?.navigator?.model;
      return m && typeof m === "object";
    });
    expect(model).toBeDefined();
  });
});
