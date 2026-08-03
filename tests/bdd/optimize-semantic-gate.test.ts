// The SEMANTIC-similarity quality bar: a design candidate's artifact must be
// semantically comparable to the recorded reference at that step (LLM-as-judge on a
// fixed model), on TOP of the structural self-check. Hermetic: the judge is stubbed
// (no model spawned), and a tiny fake kit-root holds recorded reference artifacts so
// resolveStepReference + evaluateSemanticGate are exercised end-to-end without cloud.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateSemanticGate,
  resolveStepReference,
  readCandidateArtifact,
  parseJudgeReply,
  buildJudgePrompt,
  SEMANTIC_THRESHOLD,
  type SemanticJudge,
} from "../../scripts/sftdd/optimize-semantic-gate";

let kitRoot: string;
let sftddDir: string;
const featureId = "F1-stock-visibility";

/** Seed a recorded reference artifact in a corpus under the fake kit root. */
function seedRef(corpus: string, rel: string, body: unknown): void {
  const p = join(kitRoot, "examples/sftdd-scenarios", corpus, "recorded-artifacts", rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body));
}
/** Seed the live candidate artifact under the project .sftdd. */
function seedCandidate(rel: string, body: unknown): void {
  const p = join(sftddDir, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body));
}

beforeEach(() => {
  kitRoot = mkdtempSync(join(tmpdir(), "sem-kit-"));
  sftddDir = mkdtempSync(join(tmpdir(), "sem-sftdd-"));
});
afterEach(() => {
  rmSync(kitRoot, { recursive: true, force: true });
  rmSync(sftddDir, { recursive: true, force: true });
});

const passJudge: SemanticJudge = async () => ({ score: 0.95 });
const failJudge: SemanticJudge = async () => ({ score: 0.4, missing: ["status_badge concept", "empty_state"] });

describe("resolveStepReference: which corpus + artifact backs each step", () => {
  it("ux -> canonical stockflow design-guide", () => {
    seedRef("stockflow", "design/design-guide.json", { components: { navbar: {} } });
    const ref = resolveStepReference({ kitRoot, step: "ux", featureId });
    expect(ref?.corpus).toBe("stockflow");
    expect(ref?.paths[0]).toMatch(/design\/design-guide\.json$/);
  });

  it("dba -> stockflow-RERECORD db-design (the only corpus that recorded it)", () => {
    seedRef("stockflow-rerecord", `features/${featureId}/db-design.json`, { tables: [] });
    const ref = resolveStepReference({ kitRoot, step: "dba", featureId });
    expect(ref?.corpus).toBe("stockflow-rerecord");
    expect(ref?.paths[0]).toMatch(/db-design\.json$/);
  });

  it("acs -> the UNION of every recorded story's ACs (feature-aggregate, not per-slug)", () => {
    seedRef("stockflow", `features/${featureId}/stories/S1-record-stock/acs/AC1.json`, { id: "AC1" });
    seedRef("stockflow", `features/${featureId}/stories/S2-x/acs/AC1.json`, { id: "AC1" });
    seedRef("stockflow", `features/${featureId}/stories/S2-x/acs/AC2.json`, { id: "AC2" });
    const ref = resolveStepReference({ kitRoot, step: "acs", featureId });
    expect(ref?.paths).toHaveLength(3); // union across stories
  });

  it("returns null when the corpus/artifact is not on disk (bar not applicable)", () => {
    expect(resolveStepReference({ kitRoot, step: "ux", featureId })).toBeNull();
  });
});

describe("evaluateSemanticGate: judge decides comparability above the structural floor", () => {
  it("passes when the judge scores >= threshold", async () => {
    seedRef("stockflow", "design/design-guide.json", { components: { navbar: {}, table: {} } });
    seedCandidate("design/design-guide.json", { components: { navbar: {}, table: {}, extra: {} } });
    const out = await evaluateSemanticGate({ kitRoot, sftddDir, featureId, step: "ux", judge: passJudge });
    expect(out.passed).toBe(true);
    expect(out.score).toBe(0.95);
  });

  it("FAILS when the judge scores below threshold, naming the dropped intent", async () => {
    seedRef("stockflow", "design/design-guide.json", { components: { navbar: {}, status_badge: {}, empty_state: {} } });
    seedCandidate("design/design-guide.json", { components: { navbar: {} } });
    const out = await evaluateSemanticGate({ kitRoot, sftddDir, featureId, step: "ux", judge: failJudge });
    expect(out.passed).toBe(false);
    expect(out.reason).toMatch(/status_badge/);
    expect(out.reason).toMatch(/0\.40 < 0\.85/);
  });

  it("SKIPS (passes) when there is no recorded reference , structural floor stands alone", async () => {
    seedCandidate("design/design-guide.json", { components: {} });
    let judged = false;
    const spyJudge: SemanticJudge = async () => { judged = true; return { score: 1 }; };
    const out = await evaluateSemanticGate({ kitRoot, sftddDir, featureId, step: "ux", judge: spyJudge });
    expect(out.skipped).toBe(true);
    expect(out.passed).toBe(true);
    expect(judged).toBe(false); // no reference => judge never called
  });

  it("FAILS when the reference exists but the candidate produced no artifact", async () => {
    seedRef("stockflow", "design/design-guide.json", { components: { navbar: {} } });
    const out = await evaluateSemanticGate({ kitRoot, sftddDir, featureId, step: "ux", judge: passJudge });
    expect(out.passed).toBe(false);
    expect(out.reason).toMatch(/no artifact/);
  });

  it("uses the module threshold constant (0.85)", () => {
    expect(SEMANTIC_THRESHOLD).toBe(0.85);
  });
});

describe("judge prompt + reply parsing", () => {
  it("prompt asks for MEANING not wording, and demands a JSON score verdict", () => {
    const p = buildJudgePrompt("ux", "{ref}", "{cand}");
    expect(p).toMatch(/MEANING, not wording/i);
    expect(p).toMatch(/"score"/);
    expect(p).toMatch(/REFERENCE/);
    expect(p).toMatch(/CANDIDATE/);
  });

  it("parses a clean JSON verdict", () => {
    const v = parseJudgeReply('{"score": 0.9, "missing": []}');
    expect(v.score).toBe(0.9);
    expect(v.missing).toEqual([]);
  });

  it("extracts the verdict even when wrapped in prose", () => {
    const v = parseJudgeReply('Here is my assessment.\n{"score": 0.72, "missing": ["toast"]}\nDone.');
    expect(v.score).toBe(0.72);
    expect(v.missing).toEqual(["toast"]);
  });

  it("a reply with no parseable score scores 0 (a judge that cannot answer must NOT pass the candidate)", () => {
    const v = parseJudgeReply("I could not determine similarity.");
    expect(v.score).toBe(0);
  });

  it("clamps out-of-range scores to [0,1]", () => {
    expect(parseJudgeReply('{"score": 1.4}').score).toBe(1);
    expect(parseJudgeReply('{"score": -0.2}').score).toBe(0);
  });
});
