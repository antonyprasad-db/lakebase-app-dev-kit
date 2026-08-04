// role-sweep + role-sweep-report: the per-role sweep runner + its before/after report, exercised
// hermetically with a FAKE chain runner (canned turns) + a STUB judge, so the sweep logic ,
// candidate iteration, conformance gating, QUALITY gating vs a baseline, crash-disqualify,
// ranking , is proven without spawning a model.

import { describe, it, expect } from "vitest";
import { runRoleSweep, type ChainRunner, type ChainRunResult } from "../../consort/orchestrator/optimize/role-sweep";
import { reportRoleSweep, formatRoleSweepReport } from "../../consort/orchestrator/optimize/role-sweep-report";
import { roleCandidates } from "../../consort/orchestrator/optimize/role-levers";
import { ROLE_CHAINS } from "../../consort/orchestrator/optimize/role-chains";
import type { SemanticJudge } from "../../scripts/sftdd/optimize-semantic-gate";
import type { ManifestTurn } from "../../consort/orchestrator/manifest/manifest-runner";

const CHAIN = ROLE_CHAINS["test-strategist"];

/** A canned chain run: the seed + live turns, plus the captured artifact the quality gate scores. */
function fakeRun(chain = CHAIN, opts: { ms: number; produced?: boolean; violations?: string[]; kind?: string; artifact?: string } = { ms: 1000 }): ChainRunResult {
  const produced = opts.produced ?? true;
  const kind = opts.kind ?? "design-complete";
  const turns: ManifestTurn[] = [
    { manifestId: `${chain.dir}-seed`, action: { kind: "invoke-role", role: "product-owner", mode: "author-requests" } as never, result: { bounded: { action: { kind: "invoke-role", role: "test-strategist", story: "S1" } } as never, producedPaths: [], violations: [] } },
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
  const artifact = opts.artifact ?? (produced ? '{"items":[1,2,3]}' : undefined);
  const producedArtifacts = artifact !== undefined ? { [chain.outputFile]: artifact } : {};
  return { turns, producedArtifacts };
}

/** A stub judge that scores by artifact marker: contains "THIN" -> 0.5 (below bar); else 0.95. */
const stubJudge: SemanticJudge = async ({ candidate }) => ({ score: candidate.includes("THIN") ? 0.5 : 0.95, missing: candidate.includes("THIN") ? ["dropped coverage"] : [] });

describe("runRoleSweep: iterate candidates, gate on conformance, disqualify crashers", () => {
  it("runs every candidate + gate-passes a clean conformant turn (no quality gate)", async () => {
    const runner: ChainRunner = async () => fakeRun(CHAIN, { ms: 500 });
    const trials = await runRoleSweep(CHAIN, roleCandidates("sonnet"), runner);
    expect(trials.length).toBe(roleCandidates("sonnet").length);
    expect(trials[0].candidateId).toBe("baseline");
    expect(trials.every((t) => t.gatePassed)).toBe(true);
  });

  it("does NOT gate-pass a turn with violations or a missing artifact", async () => {
    const bad: ChainRunner = async () => fakeRun(CHAIN, { ms: 500, violations: ["test-list: bad shape"] });
    const trials = await runRoleSweep(CHAIN, [{ id: "baseline", levers: {} }], bad);
    expect(trials[0].gatePassed).toBe(false);

    const noArtifact: ChainRunner = async () => fakeRun(CHAIN, { ms: 500, produced: false });
    const t2 = await runRoleSweep(CHAIN, [{ id: "baseline", levers: {} }], noArtifact);
    expect(t2[0].gatePassed).toBe(false);
  });

  it("DISQUALIFIES a crashing candidate + continues the sweep", async () => {
    let n = 0;
    const flaky: ChainRunner = async () => {
      n += 1;
      if (n === 2) throw new Error("boom (candidate 2 crashed)");
      return fakeRun(CHAIN, { ms: 500 });
    };
    const trials = await runRoleSweep(CHAIN, roleCandidates("sonnet").slice(0, 3), flaky);
    expect(trials.length).toBe(3);
    expect(trials[1].disqualified).toBe(true);
    expect(trials[1].reason).toMatch(/boom/);
    expect(trials[0].gatePassed).toBe(true);
    expect(trials[2].gatePassed).toBe(true);
  });
});

describe("runRoleSweep with a QUALITY gate: score the captured artifact vs a baseline", () => {
  it("a thorough artifact passes quality; a THIN one fails it (but conformance still passed)", async () => {
    // baseline is thorough; the one candidate produces a THIN artifact.
    const runner: ChainRunner = async (_c, _a, candidateId) =>
      fakeRun(CHAIN, { ms: 200, artifact: candidateId === "m-haiku" ? '{"items":[1] THIN}' : '{"items":[1,2,3]}' });
    const trials = await runRoleSweep(CHAIN, [{ id: "baseline", levers: {} }, { id: "m-haiku", levers: { model: "haiku" } }], runner, {
      quality: { referenceText: '{"items":[1,2,3,4]}', judge: stubJudge, kind: "tests", threshold: 0.75 },
    });
    const baseline = trials.find((t) => t.candidateId === "baseline")!;
    const haiku = trials.find((t) => t.candidateId === "m-haiku")!;
    // Conformance passed for both; quality separates them.
    expect(baseline.gatePassed).toBe(true);
    expect(baseline.qualityPassed).toBe(true);
    expect(baseline.telemetry?.semanticScore).toBeCloseTo(0.95, 2);
    expect(haiku.gatePassed).toBe(true); // conformant
    expect(haiku.qualityPassed).toBe(false); // but THIN vs baseline
    expect(haiku.telemetry?.semanticScore).toBeCloseTo(0.5, 2);
  });

  it("with no quality gate configured, qualityPassed is undefined (conformance-only, prior behavior)", async () => {
    const runner: ChainRunner = async () => fakeRun(CHAIN, { ms: 200 });
    const trials = await runRoleSweep(CHAIN, [{ id: "baseline", levers: {} }], runner);
    expect(trials[0].qualityPassed).toBeUndefined();
  });

  it("DISCRIMINATOR gate: a clean 'equivalent' candidate is quality-PASS + records the classification (clean=best, not a miss)", async () => {
    // The judge returns a classification (build discriminator), driving pass by classification,
    // NOT score>=threshold. A clean 'equivalent' verdict is the best outcome.
    const discJudge: SemanticJudge = async ({ candidate }) =>
      candidate.includes("BROKEN")
        ? ({ score: 0.2, classification: "insufficient", nextStep: "escalate" } as never)
        : ({ score: 0.6, classification: "equivalent", nextStep: "accept" } as never);
    const runner: ChainRunner = async (_c, _a, candidateId) =>
      fakeRun(CHAIN, { ms: 200, artifact: candidateId === "m-haiku" ? '{"x":"BROKEN"}' : '{"x":"clean"}' });
    const trials = await runRoleSweep(CHAIN, [{ id: "baseline", levers: {} }, { id: "m-haiku", levers: { model: "haiku" } }], runner, {
      quality: { referenceText: "ref", judge: discJudge, kind: "code" },
    });
    const baseline = trials.find((t) => t.candidateId === "baseline")!;
    const haiku = trials.find((t) => t.candidateId === "m-haiku")!;
    // clean 'equivalent' => quality PASS even though score (0.6) is below the usual 0.75 bar.
    expect(baseline.qualityPassed).toBe(true);
    expect(baseline.telemetry?.classification).toBe("equivalent");
    expect(baseline.telemetry?.nextStep).toBe("accept");
    // 'insufficient' => the only real fail.
    expect(haiku.qualityPassed).toBe(false);
    expect(haiku.telemetry?.classification).toBe("insufficient");
  });
});

describe("reportRoleSweep: rank winners by wall-clock among QUALITY-HOLDING candidates", () => {
  it("a faster candidate that FAILS quality is NOT the winner", () => {
    const trials = [
      { candidateId: "baseline", levers: {}, gatePassed: true, qualityPassed: true, telemetry: { role: "test-strategist", chain: "x#baseline", levers: {}, outerDurationMs: 600000, outcome: "produced", semanticScore: 0.95 } },
      // faster but THIN (quality failed) , must NOT win despite being fastest.
      { candidateId: "m-haiku", levers: { model: "haiku" }, gatePassed: true, qualityPassed: false, telemetry: { role: "test-strategist", chain: "x#m-haiku", levers: { model: "haiku" }, outerDurationMs: 190000, outcome: "produced", semanticScore: 0.5 } },
      // slower than haiku but holds quality , the legitimate winner.
      { candidateId: "m-opus", levers: { model: "opus" }, gatePassed: true, qualityPassed: true, telemetry: { role: "test-strategist", chain: "x#m-opus", levers: { model: "opus" }, outerDurationMs: 300000, outcome: "produced", semanticScore: 0.9 } },
    ];
    const r = reportRoleSweep(trials);
    expect(r.winner?.candidateId).toBe("m-opus"); // NOT m-haiku (failed quality)
    expect(r.winner?.speedupPct).toBeCloseTo(50, 0);
    const report = formatRoleSweepReport(r);
    expect(report).toMatch(/m-opus/);
    // the thin faster one is surfaced as rejected-for-quality, not silently dropped.
    expect(report).toMatch(/m-haiku/);
    expect(report).toMatch(/quality/i);
  });

  it("surfaces a clean-converged (equivalent) candidate as a POSITIVE note, not merely 'passed'", () => {
    const trials = [
      { candidateId: "baseline", levers: {}, gatePassed: true, qualityPassed: true, telemetry: { role: "driver", chain: "x#baseline", levers: {}, outerDurationMs: 600000, outcome: "produced", classification: "regression", nextStep: "driver-repair-with-directive" } },
      { candidateId: "m-sonnet", levers: { model: "sonnet" }, gatePassed: true, qualityPassed: true, telemetry: { role: "driver", chain: "x#m-sonnet", levers: { model: "sonnet" }, outerDurationMs: 300000, outcome: "produced", classification: "equivalent", nextStep: "accept" } },
    ];
    const r = reportRoleSweep(trials);
    const report = formatRoleSweepReport(r);
    expect(report).toMatch(/converged clean/i);
    expect(report).toMatch(/driver-fixable regression|regression/i);
  });

  it("falls back to conformance-only ranking when no candidate has a quality verdict", () => {
    const trials = [
      { candidateId: "baseline", levers: {}, gatePassed: true, telemetry: { role: "r", chain: "x#baseline", levers: {}, outerDurationMs: 600000, outcome: "produced" } },
      { candidateId: "m-opus", levers: { model: "opus" }, gatePassed: true, telemetry: { role: "r", chain: "x#m-opus", levers: { model: "opus" }, outerDurationMs: 300000, outcome: "produced" } },
    ];
    const r = reportRoleSweep(trials);
    expect(r.winner?.candidateId).toBe("m-opus");
  });
});
