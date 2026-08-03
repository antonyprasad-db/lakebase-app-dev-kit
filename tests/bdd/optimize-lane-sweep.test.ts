// P3-prep (#502): runLaneSweep , the multi-handoff walk that sweeps EVERY role
// handoff in a lane (design or build), not just one. The design lane has inter-turn
// dependencies (a winner's artifact feeds the next turn), so the sweep must be
// SEQUENTIAL: position on the next handoff -> champion-walk it -> record the winner
// (which advances the drive) -> re-plan -> repeat until the lane boundary. This
// tests that loop with position + sweep injected (no cloud). The per-handoff walk
// itself is runChampionWalk (already tested).

import { describe, expect, it } from "vitest";

import { runLaneSweep, type LaneSweepDeps } from "../../scripts/sftdd/optimize-live";
import type { HandoffPlan, HandoffResult } from "../../scripts/sftdd/optimize-harness";

function res(handoffId: string, winnerId: string): HandoffResult {
  return {
    handoffId,
    baselineMs: 1000,
    candidates: [{ candidateId: winnerId, medianMs: 500, medianCostUsd: 1, trials: [], disqualified: false }],
    winner: { candidateId: winnerId, medianMs: 500, medianCostUsd: 1 },
  };
}

describe("runLaneSweep", () => {
  it("sweeps each handoff the lane yields, in order, until the lane is exhausted", async () => {
    // A scripted lane: spec-author -> architect -> dba -> (done).
    const handoffs: (HandoffPlan | null)[] = [
      { id: "S1-spec-author", role: "spec-author", story: "S1" },
      { id: "S1-architect-reviewer", role: "architect-reviewer", story: "S1" },
      { id: "S1-dba", role: "dba", story: "S1" },
      null, // lane boundary (design-complete)
    ];
    let i = 0;
    const swept: string[] = [];
    const deps: LaneSweepDeps = {
      positionNext: async () => handoffs[Math.min(i++, handoffs.length - 1)],
      sweepOne: async (h) => {
        swept.push(h.id);
        return res(h.id, `${h.role}-m-sonnet`);
      },
    };
    const result = await runLaneSweep(deps);
    expect(swept).toEqual(["S1-spec-author", "S1-architect-reviewer", "S1-dba"]);
    expect(result.walk.map((w) => w.handoffId)).toEqual(["S1-spec-author", "S1-architect-reviewer", "S1-dba"]);
    expect(result.walk.every((w) => w.winner.candidateId.endsWith("-m-sonnet"))).toBe(true);
  });

  it("stops immediately when the lane is already at its boundary (positionNext -> null)", async () => {
    const deps: LaneSweepDeps = {
      positionNext: async () => null,
      sweepOne: async () => {
        throw new Error("should not sweep when there is no handoff");
      },
    };
    const result = await runLaneSweep(deps);
    expect(result.walk).toEqual([]);
  });

  it("bounds the loop (a lane that never advances throws instead of spinning)", async () => {
    const stuck: HandoffPlan = { id: "S1-spec-author", role: "spec-author", story: "S1" };
    const deps: LaneSweepDeps = {
      positionNext: async () => stuck, // always the same handoff -> not advancing
      sweepOne: async (h) => res(h.id, "baseline"),
    };
    await expect(runLaneSweep(deps, { maxHandoffs: 4 })).rejects.toThrow(/did not advance|too many/i);
  });

  it("startFrom: ADVANCES already-settled upstream handoffs (baseline, no sweep) and SWEEPS only from the target on", async () => {
    // spec-author is already optimized + applied to the kit; re-sweeping its 4
    // candidates to REACH architect is pure waste. startFrom advances the settled
    // upstream handoffs cheaply (one baseline run each, to move the drive forward)
    // and champion-walks only the target handoff onward.
    const handoffs: (HandoffPlan | null)[] = [
      { id: "S1-spec-author", role: "spec-author", story: "S1" },
      { id: "S1-architect-reviewer", role: "architect-reviewer", story: "S1" },
      { id: "S1-dba", role: "dba", story: "S1" },
      null,
    ];
    let i = 0;
    const advanced: string[] = [];
    const swept: string[] = [];
    const deps: LaneSweepDeps = {
      positionNext: async () => handoffs[Math.min(i++, handoffs.length - 1)],
      sweepOne: async (h) => { swept.push(h.id); return res(h.id, `${h.role}-e-low`); },
      advanceOne: async (h) => { advanced.push(h.id); },
    };
    const result = await runLaneSweep(deps, { startFrom: "S1-architect-reviewer" });
    // spec-author was advanced (not swept); architect + dba were swept.
    expect(advanced).toEqual(["S1-spec-author"]);
    expect(swept).toEqual(["S1-architect-reviewer", "S1-dba"]);
    // The report only carries the SWEPT handoffs (the advanced ones produced no result).
    expect(result.walk.map((w) => w.handoffId)).toEqual(["S1-architect-reviewer", "S1-dba"]);
  });
});
