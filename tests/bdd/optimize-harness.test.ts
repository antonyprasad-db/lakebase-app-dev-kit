// P2b optimize-harness: runChampionWalk, the sequential per-handoff champion walk.
// For each handoff K: snapshot the pre-turn state ONCE, run each candidate N
// trials from that identical state, gate + time each trial, keep the FASTEST
// gate-passing candidate as the winner, overlay the winner once more (recorded),
// and continue from the winner's state. Every discarded attempt is reported to
// experiments/; only the winner advances.
//
// The engine is pure orchestration over INJECTED steps (runTrial + a
// snapshot factory), so the walk's decision logic , trials per candidate, median
// selection, gate-failure discarding, winner selection + tie-breaks , is unit-
// tested with no cloud, no model, no git. The real steps are wired by the CLI.

import { describe, expect, it } from "vitest";

import {
  runChampionWalk,
  type ChampionWalkDeps,
  type TrialResult,
  type HandoffPlan,
} from "../../scripts/sftdd/optimize-harness";
import { generateCandidates } from "../../scripts/sftdd/optimize-candidates";

/** A scripted runTrial: looks up a fixed outcome per (handoff, candidate id, trial). */
function scriptedDeps(
  script: Record<string, Record<string, TrialResult[]>>,
): { deps: ChampionWalkDeps; log: string[] } {
  const log: string[] = [];
  const trialCursor: Record<string, number> = {};
  return {
    log,
    deps: {
      async snapshot(handoff) {
        log.push(`snapshot:${handoff.id}`);
        return {
          async restore() {
            log.push(`restore:${handoff.id}`);
          },
          dispose() {
            log.push(`dispose:${handoff.id}`);
          },
        };
      },
      async runTrial({ handoff, candidate, trial }) {
        const key = `${handoff.id}|${candidate.id}`;
        const i = trialCursor[key] ?? 0;
        trialCursor[key] = i + 1;
        log.push(`trial:${handoff.id}:${candidate.id}:${trial}`);
        return script[handoff.id][candidate.id][i];
      },
      async recordWinner({ handoff, candidate }) {
        log.push(`recordWinner:${handoff.id}:${candidate.id}`);
      },
    },
  };
}

function pass(ms: number): TrialResult {
  return { gatePassed: true, durationMs: ms, costUsd: ms / 1000 };
}
function fail(ms: number): TrialResult {
  return { gatePassed: false, durationMs: ms, costUsd: ms / 1000, gateReason: "gate failed" };
}

const handoff: HandoffPlan = { id: "S1-green", role: "driver", story: "S1", buildMode: "green" };

describe("runChampionWalk: winner selection", () => {
  it("keeps the fastest gate-passing candidate (median of N passing trials)", async () => {
    const cands = [
      { id: "baseline", configOverrides: {} },
      { id: "fast", configOverrides: {} },
    ];
    const { deps } = scriptedDeps({
      "S1-green": {
        baseline: [pass(1000), pass(1000), pass(1000)],
        fast: [pass(400), pass(500), pass(600)], // median 500
      },
    });
    const result = await runChampionWalk({ handoffs: [handoff], candidates: cands, trials: 3 }, deps);
    expect(result.walk[0].winner.candidateId).toBe("fast");
    expect(result.walk[0].winner.medianMs).toBe(500);
    // baseline is reported for the before/after diff
    expect(result.walk[0].baselineMs).toBe(1000);
  });

  it("a candidate that fails the gate on ANY trial is discarded (never wins)", async () => {
    const cands = [
      { id: "baseline", configOverrides: {} },
      { id: "flaky", configOverrides: {} },
    ];
    const { deps } = scriptedDeps({
      "S1-green": {
        baseline: [pass(1000), pass(1000), pass(1000)],
        flaky: [pass(100), fail(50), pass(100)], // one gate failure => disqualified
      },
    });
    const result = await runChampionWalk({ handoffs: [handoff], candidates: cands, trials: 3 }, deps);
    expect(result.walk[0].winner.candidateId).toBe("baseline");
    // the disqualified candidate is still reported as an attempt
    const flaky = result.walk[0].candidates.find((c) => c.candidateId === "flaky");
    expect(flaky?.disqualified).toBe(true);
  });

  it("falls back to baseline when NO candidate beats it", async () => {
    const cands = [
      { id: "baseline", configOverrides: {} },
      { id: "slower", configOverrides: {} },
    ];
    const { deps } = scriptedDeps({
      "S1-green": {
        baseline: [pass(500), pass(500), pass(500)],
        slower: [pass(900), pass(900), pass(900)],
      },
    });
    const result = await runChampionWalk({ handoffs: [handoff], candidates: cands, trials: 3 }, deps);
    expect(result.walk[0].winner.candidateId).toBe("baseline");
  });

  it("tie on median => lower cost wins", async () => {
    const cands = [
      { id: "baseline", configOverrides: {} },
      { id: "a", configOverrides: {} },
      { id: "b", configOverrides: {} },
    ];
    const { deps } = scriptedDeps({
      "S1-green": {
        baseline: [pass(1000), pass(1000), pass(1000)],
        a: [{ gatePassed: true, durationMs: 500, costUsd: 9 }, { gatePassed: true, durationMs: 500, costUsd: 9 }, { gatePassed: true, durationMs: 500, costUsd: 9 }],
        b: [{ gatePassed: true, durationMs: 500, costUsd: 1 }, { gatePassed: true, durationMs: 500, costUsd: 1 }, { gatePassed: true, durationMs: 500, costUsd: 1 }],
      },
    });
    const result = await runChampionWalk({ handoffs: [handoff], candidates: cands, trials: 3 }, deps);
    expect(result.walk[0].winner.candidateId).toBe("b");
  });
});

describe("runChampionWalk: state discipline", () => {
  it("snapshots once per handoff, restores after every trial, records the winner", async () => {
    const cands = [
      { id: "baseline", configOverrides: {} },
      { id: "fast", configOverrides: {} },
    ];
    const { deps, log } = scriptedDeps({
      "S1-green": {
        baseline: [pass(1000)],
        fast: [pass(400)],
      },
    });
    await runChampionWalk({ handoffs: [handoff], candidates: cands, trials: 1 }, deps);
    // one snapshot for the handoff
    expect(log.filter((l) => l === "snapshot:S1-green")).toHaveLength(1);
    // a restore after each of the 2 trials
    expect(log.filter((l) => l === "restore:S1-green")).toHaveLength(2);
    // winner recorded once
    expect(log).toContain("recordWinner:S1-green:fast");
    // snapshot disposed at the end
    expect(log).toContain("dispose:S1-green");
  });

  it("runs handoffs sequentially, each with its own snapshot", async () => {
    const h2: HandoffPlan = { id: "S1-review", role: "navigator", story: "S1", buildMode: "review" };
    const cands = [{ id: "baseline", configOverrides: {} }];
    const { deps, log } = scriptedDeps({
      "S1-green": { baseline: [pass(100)] },
      "S1-review": { baseline: [pass(100)] },
    });
    await runChampionWalk({ handoffs: [handoff, h2], candidates: cands, trials: 1 }, deps);
    expect(log.indexOf("snapshot:S1-green")).toBeLessThan(log.indexOf("snapshot:S1-review"));
    expect(log).toContain("recordWinner:S1-green:baseline");
    expect(log).toContain("recordWinner:S1-review:baseline");
  });
});

describe("runChampionWalk: integrates with generateCandidates", () => {
  it("accepts a generated candidate list", async () => {
    const cands = generateCandidates({ role: "driver", models: { green: ["haiku"] } });
    const script: Record<string, TrialResult[]> = {};
    for (const c of cands) script[c.id] = [pass(c.id === "baseline" ? 1000 : 300)];
    const { deps } = scriptedDeps({ "S1-green": script });
    const result = await runChampionWalk({ handoffs: [handoff], candidates: cands, trials: 1 }, deps);
    expect(result.walk[0].candidates).toHaveLength(cands.length);
  });
});
