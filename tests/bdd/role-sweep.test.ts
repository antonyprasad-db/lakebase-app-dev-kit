// role-sweep + role-sweep-report: the per-role sweep runner + its before/after report, exercised
// hermetically with a FAKE chain runner (canned turns), so the sweep logic , candidate iteration,
// conformance gating, crash-disqualify, ranking , is proven without spawning a model.

import { describe, it, expect } from "vitest";
import { runRoleSweep, type ChainRunner } from "../../consort/orchestrator/optimize/role-sweep";
import { reportRoleSweep, formatRoleSweepReport } from "../../consort/orchestrator/optimize/role-sweep-report";
import { roleCandidates } from "../../consort/orchestrator/optimize/role-levers";
import { ROLE_CHAINS } from "../../consort/orchestrator/optimize/role-chains";
import type { ManifestTurn } from "../../consort/orchestrator/manifest/manifest-runner";

const CHAIN = ROLE_CHAINS["test-strategist"];

/** A canned live turn for the chain, with a given outer duration + gate outcome. */
function fakeTurns(chain = CHAIN, opts: { ms: number; produced?: boolean; violations?: string[]; kind?: string } = { ms: 1000 }): ManifestTurn[] {
  const produced = opts.produced ?? true;
  const kind = opts.kind ?? "design-complete";
  return [
    // seed turn (mock/replay) , no telemetry needed for the gate
    { manifestId: `${chain.dir}-seed`, action: { kind: "invoke-role", role: "product-owner", mode: "author-requests" } as never, result: { bounded: { action: { kind: "invoke-role", role: "test-strategist", story: "S1" } } as never, producedPaths: [], violations: [] } },
    // live turn
    {
      manifestId: `${chain.dir}-live`,
      action: { kind: "invoke-role", role: "test-strategist", story: "S1" } as never,
      result: {
        bounded: { action: { kind } } as never,
        producedPaths: produced ? [`/ws/${chain.outputFile}`] : [],
        violations: opts.violations ?? [],
      },
      telemetry: { role: "test-strategist", outerDurationMs: opts.ms, agentResult: { usage: { inputTokens: 4, outputTokens: 100, durationMs: opts.ms - 200, numTurns: 3, costUsd: 0.1 } } },
    },
  ];
}

describe("runRoleSweep: iterate candidates, gate on conformance, disqualify crashers", () => {
  it("runs every candidate + gate-passes a clean conformant turn", async () => {
    const runner: ChainRunner = async () => fakeTurns(CHAIN, { ms: 500 });
    const trials = await runRoleSweep(CHAIN, roleCandidates("sonnet"), runner);
    expect(trials.length).toBe(roleCandidates("sonnet").length);
    expect(trials[0].candidateId).toBe("baseline");
    expect(trials.every((t) => t.gatePassed)).toBe(true);
  });

  it("does NOT gate-pass a turn with violations or a missing artifact", async () => {
    const bad: ChainRunner = async () => fakeTurns(CHAIN, { ms: 500, violations: ["test-list: bad shape"] });
    const trials = await runRoleSweep(CHAIN, [{ id: "baseline", levers: {} }], bad);
    expect(trials[0].gatePassed).toBe(false);

    const noArtifact: ChainRunner = async () => fakeTurns(CHAIN, { ms: 500, produced: false });
    const t2 = await runRoleSweep(CHAIN, [{ id: "baseline", levers: {} }], noArtifact);
    expect(t2[0].gatePassed).toBe(false);
  });

  it("DISQUALIFIES a crashing candidate + continues the sweep", async () => {
    let n = 0;
    const flaky: ChainRunner = async () => {
      n += 1;
      if (n === 2) throw new Error("boom (candidate 2 crashed)");
      return fakeTurns(CHAIN, { ms: 500 });
    };
    const trials = await runRoleSweep(CHAIN, roleCandidates("sonnet").slice(0, 3), flaky);
    expect(trials.length).toBe(3);
    expect(trials[1].disqualified).toBe(true);
    expect(trials[1].reason).toMatch(/boom/);
    expect(trials[0].gatePassed).toBe(true);
    expect(trials[2].gatePassed).toBe(true); // sweep continued past the crash
  });
});

describe("reportRoleSweep: rank gate-passers by wall-clock vs baseline", () => {
  it("names the fastest gate-passer as winner + computes % vs baseline", () => {
    const trials = [
      { candidateId: "baseline", levers: {}, gatePassed: true, telemetry: { role: "test-strategist", chain: "x#baseline", levers: {}, outerDurationMs: 600000, outcome: "produced" } },
      { candidateId: "m-opus", levers: { model: "opus" }, gatePassed: true, telemetry: { role: "test-strategist", chain: "x#m-opus", levers: { model: "opus" }, outerDurationMs: 300000, outcome: "produced" } },
      { candidateId: "e-low", levers: { effort: "low" }, gatePassed: false, disqualified: false, telemetry: { role: "test-strategist", chain: "x#e-low", levers: { effort: "low" }, outerDurationMs: 100, outcome: "blocked" } },
    ];
    const r = reportRoleSweep(trials);
    expect(r.baselineMs).toBe(600000);
    expect(r.winner?.candidateId).toBe("m-opus"); // fastest GATE-PASSER (e-low is faster but failed the gate)
    expect(r.winner?.speedupPct).toBeCloseTo(50, 0);
    // the report line mentions the winner + the speedup
    expect(formatRoleSweepReport(r)).toMatch(/m-opus/);
    expect(formatRoleSweepReport(r)).toMatch(/50/);
  });

  it("no winner when the ONLY gate-passer is the baseline (nothing beat it)", () => {
    const trials = [
      { candidateId: "baseline", levers: {}, gatePassed: true, telemetry: { role: "r", chain: "x#baseline", levers: {}, outerDurationMs: 100, outcome: "produced" } },
      { candidateId: "m-opus", levers: { model: "opus" }, gatePassed: false, disqualified: true, reason: "crash" },
    ];
    const r = reportRoleSweep(trials);
    expect(r.winner).toBeUndefined(); // baseline is not its own winner
    expect(formatRoleSweepReport(r)).toMatch(/no candidate beat the baseline/i);
  });
});
