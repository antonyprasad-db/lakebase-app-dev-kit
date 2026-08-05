// role-levers: the candidate generator for the per-role chain sweep. A candidate is one point in
// the sweep space , a patch on the live role's AgentLevers (model / effort / tool scope). Baseline
// (the role's default levers, no patch) is always first so the sweep measures it under the same
// machinery as every candidate. Pure , no I/O.

import { describe, it, expect } from "vitest";
import { roleCandidates, BASELINE_ID } from "../optimization/role-levers";

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

  // Session warmth is a CROSS-TURN effect (a story's later cycles resuming the earlier session's
  // context + prompt cache). It cannot be measured on the default SINGLE-TURN chain substrate ,
  // there is no prior turn to resume , so the warm candidate is gated behind a multiTurn capability.
  describe("session-warmth lever (gated on a multi-turn substrate)", () => {
    it("is EXCLUDED by default (single-turn substrate cannot measure warm-vs-cold)", () => {
      const ids = roleCandidates("sonnet").map((c) => c.id);
      expect(ids).not.toContain("session-warm");
    });

    it("is INCLUDED when multiTurn:true (the future driver phase runs sequenced same-key turns)", () => {
      const cs = roleCandidates("sonnet", { multiTurn: true });
      const warm = cs.find((c) => c.id === "session-warm");
      expect(warm).toBeDefined();
      expect(warm!.levers.session).toBe("resume");
    });

    it("multiTurn:true is otherwise a SUPERSET , every default candidate still present, baseline first", () => {
      const base = roleCandidates("sonnet");
      const multi = roleCandidates("sonnet", { multiTurn: true });
      expect(multi[0].id).toBe(BASELINE_ID);
      for (const c of base) expect(multi.map((m) => m.id)).toContain(c.id);
      expect(multi.length).toBe(base.length + 1);
    });
  });
});
