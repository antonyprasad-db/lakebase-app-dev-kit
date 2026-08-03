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
  it("baseline first, then EVERY cheaper model tier as a scalar (opus->sonnet AND opus->haiku)", () => {
    const cands = defaultLaneCandidates(h("architect-reviewer", "S1"));
    expect(cands[0].id).toBe("baseline");
    // A scalar model-only downgrade candidate for each tier below opus.
    const models = cands
      .filter((c) => typeof c.configOverrides.roles?.["architect-reviewer"]?.model === "string" && c.configOverrides.roles?.["architect-reviewer"]?.effort === undefined)
      .map((c) => c.configOverrides.roles!["architect-reviewer"]!.model);
    expect(models).toEqual(expect.arrayContaining(["sonnet", "haiku"]));
  });

  it("includes effort-drop candidates as scalars (low AND medium)", () => {
    const cands = defaultLaneCandidates(h("dba", "S1"));
    const efforts = cands
      .filter((c) => c.configOverrides.roles?.dba?.effort !== undefined && c.configOverrides.roles?.dba?.model === undefined)
      .map((c) => c.configOverrides.roles!.dba!.effort);
    expect(efforts).toEqual(expect.arrayContaining(["low", "medium"]));
  });

  it("includes a model x effort CROSS at low (cheaper model AND less thinking together)", () => {
    const cands = defaultLaneCandidates(h("architect-reviewer", "S1"));
    const cross = cands.find(
      (c) =>
        typeof c.configOverrides.roles?.["architect-reviewer"]?.model === "string" &&
        c.configOverrides.roles?.["architect-reviewer"]?.effort === "low",
    );
    expect(cross).toBeDefined();
    expect(cross!.configOverrides.roles!["architect-reviewer"]!.model).toBe("sonnet");
    expect(cross!.id).toMatch(/m-sonnet-e-low/);
  });

  it("includes a HARD scan-tightening content variant: deny Grep/Glob + a directive (enforced, not just requested)", () => {
    const cands = defaultLaneCandidates(h("test-strategist", "S1"));
    const scan = cands.find((c) => c.content?.disallowedTools?.length);
    expect(scan).toBeDefined();
    // the scan lever DENIES the tree-scanning tools, so the tightening is enforced
    expect(scan!.content!.disallowedTools).toEqual(expect.arrayContaining(["Grep", "Glob"]));
    // and still carries the directive explaining the intent
    expect(scan!.content!.taskSuffix).toMatch(/./);
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
