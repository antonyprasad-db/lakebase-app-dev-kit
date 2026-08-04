// role-levers: the candidate generator for the per-role chain sweep. A candidate is one point in
// the sweep space , a patch on the live role's AgentLevers (model / effort / tool scope). Baseline
// (the role's default levers, no patch) is always first so the sweep measures it under the same
// machinery as every candidate. Pure , no I/O.

import { describe, it, expect } from "vitest";
import { roleCandidates, BASELINE_ID } from "../../consort/orchestrator/optimize/role-levers";

describe("roleCandidates: model tiers x effort rungs x scan-tight, baseline first", () => {
  it("baseline is always first, with no lever patch", () => {
    const cs = roleCandidates("sonnet");
    expect(cs[0].id).toBe(BASELINE_ID);
    expect(cs[0].levers).toEqual({});
  });

  it("tries every OTHER model tier (cheaper AND more capable)", () => {
    const ids = roleCandidates("sonnet").map((c) => c.id);
    // base=sonnet -> other tiers haiku + opus.
    expect(ids).toContain("m-haiku");
    expect(ids).toContain("m-opus");
    expect(ids).not.toContain("m-sonnet"); // never re-tries the baseline model
  });

  it("tries each cheaper effort rung (low, medium)", () => {
    const ids = roleCandidates("opus").map((c) => c.id);
    expect(ids).toContain("e-low");
    expect(ids).toContain("e-medium");
  });

  it("crosses each other model with low effort (model change AND less thinking together)", () => {
    const cs = roleCandidates("sonnet");
    const cross = cs.find((c) => c.id === "m-opus-e-low");
    expect(cross).toBeDefined();
    expect(cross!.levers.model).toBe("opus");
    expect(cross!.levers.effort).toBe("low");
  });

  it("includes a scan-tight candidate that denies Grep/Glob", () => {
    const tight = roleCandidates("sonnet").find((c) => c.id === "scan-tight");
    expect(tight).toBeDefined();
    expect(tight!.levers.disallowedTools).toEqual(expect.arrayContaining(["Grep", "Glob"]));
  });

  it("a model patch carries only model; an effort patch only effort", () => {
    const cs = roleCandidates("opus");
    expect(cs.find((c) => c.id === "m-haiku")!.levers).toEqual({ model: "haiku" });
    expect(cs.find((c) => c.id === "e-low")!.levers).toEqual({ effort: "low" });
  });
});
