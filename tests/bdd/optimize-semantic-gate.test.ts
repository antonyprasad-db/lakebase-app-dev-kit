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
  // Part 2: the build-code DISCRIMINATOR (mirrors the navigator assess turn).
  buildDiscriminatorPrompt,
  parseDiscriminatorReply,
  buildRedCoverageJudgePrompt,
  evaluateNavigatorAssessAlignment,
  type DiscriminatorVerdict,
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

  it("propose -> canonical stockflow planning/feature-proposals.md (was a silent-skip GAP)", () => {
    // Regression: `propose` produces planning/feature-proposals.md and a baseline exists in
    // BOTH corpora, but it used to fall into corpusForStep/stepArtifactPath's `default` case
    // -> null -> the quality gate silently skipped, running the propose sweep scoreless.
    seedRef("stockflow", "planning/feature-proposals.md", "# Sprint 1 proposal\n- F1\n");
    const ref = resolveStepReference({ kitRoot, step: "propose", featureId });
    expect(ref?.corpus).toBe("stockflow");
    expect(ref?.paths[0]).toMatch(/planning\/feature-proposals\.md$/);
  });

  it("estimate -> canonical stockflow planning/estimates.json (NOT architecture.json)", () => {
    // Regression: `estimate` produces planning/estimates.json, but stepArtifactPath returned
    // architectureJson -> the estimate gate compared an estimates candidate against an
    // architecture reference (wrong artifact entirely). It must resolve estimates.json.
    seedRef("stockflow", `features/${featureId}/architecture.json`, { feature_id: featureId });
    seedRef("stockflow", "planning/estimates.json", { estimates: [{ feature_id: featureId, size: "M" }] });
    const ref = resolveStepReference({ kitRoot, step: "estimate", featureId });
    expect(ref?.corpus).toBe("stockflow");
    expect(ref?.paths[0]).toMatch(/planning\/estimates\.json$/);
  });

  it("returns null when the corpus/artifact is not on disk (bar not applicable)", () => {
    expect(resolveStepReference({ kitRoot, step: "ux", featureId })).toBeNull();
  });
});

describe("readCandidateArtifact: reads the SAME artifact the reference resolves (parity)", () => {
  it("propose reads planning/feature-proposals.md from the candidate .sftdd", () => {
    seedCandidate("planning/feature-proposals.md", "# candidate proposal\n");
    expect(readCandidateArtifact({ sftddDir, step: "propose", featureId })).toContain("candidate proposal");
  });

  it("estimate reads planning/estimates.json from the candidate .sftdd (not architecture.json)", () => {
    seedCandidate(`features/${featureId}/architecture.json`, { feature_id: featureId });
    seedCandidate("planning/estimates.json", { estimates: [{ feature_id: featureId, size: "L" }] });
    const body = readCandidateArtifact({ sftddDir, step: "estimate", featureId });
    expect(body).toContain('"size":"L"'); // estimates.json content (compact), not architecture
    expect(body).toContain("estimates");
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

// ── Part 2: the build-code DISCRIMINATOR ───────────────────────────────────────
// Unlike the flat design/functional similarity score, the discriminator mirrors what
// the navigator ASSESS turn does: it CLASSIFIES the produced code and names the NEXT
// STEP the evaluation warrants (accept / permissive-refactor-superseded / driver-repair
// / escalate). A CLEAN verdict ("equivalent"/"accept" , nothing to refactor, no
// regression) is the BEST outcome (the candidate converged cleaner than the recorded
// baseline that needed the assess->repair spiral), NEVER a miss.

describe("build discriminator: prompt asks for a classification + next step, states clean=best", () => {
  it("code prompt asks to classify + name the next step and marks a clean verdict as best", () => {
    const p = buildDiscriminatorPrompt("code", "{ref}", "{cand}");
    expect(p).toMatch(/classif/i);
    expect(p).toMatch(/next step/i);
    expect(p).toMatch(/equivalent/);
    expect(p).toMatch(/superseded-shift/);
    expect(p).toMatch(/regression/);
    expect(p).toMatch(/insufficient/);
    // The refinement: a clean/equivalent verdict is the BEST result, not a low score.
    expect(p).toMatch(/best|ideal|better than/i);
    expect(p).toMatch(/REFERENCE/);
    expect(p).toMatch(/CANDIDATE/);
  });
});

describe("parseDiscriminatorReply: classification + next step + optional diagnosis/fixDirective", () => {
  it("parses a clean equivalent/accept verdict", () => {
    const v = parseDiscriminatorReply('{"score":0.95,"classification":"equivalent","nextStep":"accept","missing":[]}');
    expect(v.classification).toBe("equivalent");
    expect(v.nextStep).toBe("accept");
    expect(v.score).toBe(0.95);
  });

  it("parses a superseded-shift verdict", () => {
    const v = parseDiscriminatorReply('{"score":0.8,"classification":"superseded-shift","nextStep":"permissive-refactor-superseded"}');
    expect(v.classification).toBe("superseded-shift");
    expect(v.nextStep).toBe("permissive-refactor-superseded");
  });

  it("parses a driver-fixable regression with a diagnosis + fixDirective", () => {
    const v = parseDiscriminatorReply('{"score":0.5,"classification":"regression","nextStep":"driver-repair-with-directive","diagnosis":"missing page","fixDirective":"create StockViewPage.tsx"}');
    expect(v.classification).toBe("regression");
    expect(v.nextStep).toBe("driver-repair-with-directive");
    expect(v.diagnosis).toMatch(/missing page/);
    expect(v.fixDirective).toMatch(/StockViewPage/);
  });

  it("an unparseable reply defaults to insufficient/escalate (fail-safe: a judge that cannot answer must NOT pass)", () => {
    const v = parseDiscriminatorReply("I cannot classify this.");
    expect(v.classification).toBe("insufficient");
    expect(v.nextStep).toBe("escalate");
  });

  it("an unknown classification string defaults to insufficient/escalate", () => {
    const v = parseDiscriminatorReply('{"score":0.9,"classification":"looks-great","nextStep":"ship-it"}');
    expect(v.classification).toBe("insufficient");
    expect(v.nextStep).toBe("escalate");
  });
});

describe("build discriminator gate: clean verdict is a PASS (best), only insufficient fails", () => {
  const oracle = (v: DiscriminatorVerdict): SemanticJudge => async () => v;
  const runGate = async (verdict: DiscriminatorVerdict) => {
    // A driver build turn (role=driver => kind=code). Seed a recorded-build ref + a
    // candidate app/ tree so the gate reaches the judge.
    seedRef("stockflow", `features/${featureId}/architecture.json`, { feature_id: featureId }); // unrelated; ensure corpus dir exists
    const rbApp = join(kitRoot, "examples/sftdd-scenarios/stockflow/recorded-build", "features", featureId, "stories", "S1", "turns", "003-driver", "code", "app");
    mkdirSync(rbApp, { recursive: true });
    writeFileSync(join(rbApp, "models.py"), "class Stock: pass\n");
    mkdirSync(join(sftddDir, "..", "app"), { recursive: true });
    writeFileSync(join(sftddDir, "..", "app", "models.py"), "class Stock: pass\n");
    const { evaluateBuildFunctionalGate } = await import("../../scripts/sftdd/optimize-semantic-gate");
    return evaluateBuildFunctionalGate({
      kitRoot,
      projectDir: join(sftddDir, ".."),
      featureId,
      storyIndex: 0,
      role: "driver",
      judge: oracle(verdict),
    });
  };

  it("equivalent/accept => PASS (the clean, best outcome)", async () => {
    const out = await runGate({ score: 0.95, classification: "equivalent", nextStep: "accept" });
    expect(out.passed).toBe(true);
    expect(out.classification).toBe("equivalent");
    expect(out.nextStep).toBe("accept");
  });

  it("superseded-shift => PASS (viable, mirrors assess flag-superseded)", async () => {
    const out = await runGate({ score: 0.8, classification: "superseded-shift", nextStep: "permissive-refactor-superseded" });
    expect(out.passed).toBe(true);
  });

  it("regression + fixDirective => PASS (viable, driver-fixable)", async () => {
    const out = await runGate({ score: 0.6, classification: "regression", nextStep: "driver-repair-with-directive", fixDirective: "do X" });
    expect(out.passed).toBe(true);
  });

  it("insufficient/escalate => the ONLY real FAIL", async () => {
    const out = await runGate({ score: 0.2, classification: "insufficient", nextStep: "escalate" });
    expect(out.passed).toBe(false);
  });
});

describe("evaluateNavigatorAssessAlignment: navigator verdict must align with the independent oracle", () => {
  const oracleVerdict = (over: Partial<DiscriminatorVerdict>): DiscriminatorVerdict => ({
    score: 0.9,
    classification: "regression",
    nextStep: "driver-repair-with-directive",
    ...over,
  });

  it("PASSES when the navigator's regression-assessment matches the oracle's regression call", () => {
    // Navigator wrote regression-assessment.json (a genuine regression + a fix directive).
    const markerDir = mkdtempSync(join(tmpdir(), "assess-marker-"));
    writeFileSync(join(markerDir, "regression-assessment.json"), JSON.stringify({ diagnosis: "missing page", fixDirective: "create StockViewPage" }));
    const r = evaluateNavigatorAssessAlignment({ oracleVerdict: oracleVerdict({}), navigatorMarkerDir: markerDir });
    expect(r.passed).toBe(true);
    expect(r.classificationMatch).toBe(true);
    rmSync(markerDir, { recursive: true, force: true });
  });

  it("FAILS when the navigator called a genuine regression 'superseded' (misclassification)", () => {
    const markerDir = mkdtempSync(join(tmpdir(), "assess-marker-"));
    writeFileSync(join(markerDir, "superseded-tests.json"), JSON.stringify({ tests: ["tests/a.py"], reason: "retired" }));
    const r = evaluateNavigatorAssessAlignment({ oracleVerdict: oracleVerdict({}), navigatorMarkerDir: markerDir });
    expect(r.passed).toBe(false);
    expect(r.classificationMatch).toBe(false);
    rmSync(markerDir, { recursive: true, force: true });
  });

  it("PASSES the clean case: oracle says equivalent/accept and the navigator wrote no marker", () => {
    const markerDir = mkdtempSync(join(tmpdir(), "assess-marker-"));
    const r = evaluateNavigatorAssessAlignment({
      oracleVerdict: oracleVerdict({ classification: "equivalent", nextStep: "accept" }),
      navigatorMarkerDir: markerDir,
    });
    expect(r.passed).toBe(true);
    rmSync(markerDir, { recursive: true, force: true });
  });

  it("PASSES a superseded match only when the flagged-test set overlaps the oracle's (>= 0.5 Jaccard)", () => {
    const markerDir = mkdtempSync(join(tmpdir(), "assess-marker-"));
    writeFileSync(join(markerDir, "superseded-tests.json"), JSON.stringify({ tests: ["tests/a.py", "tests/b.py"], reason: "retired" }));
    const r = evaluateNavigatorAssessAlignment({
      oracleVerdict: { score: 0.8, classification: "superseded-shift", nextStep: "permissive-refactor-superseded", supersededTests: ["tests/a.py", "tests/b.py"] },
      navigatorMarkerDir: markerDir,
    });
    expect(r.passed).toBe(true);
    expect(r.overlap).toBeGreaterThanOrEqual(0.5);
    rmSync(markerDir, { recursive: true, force: true });
  });
});

describe("buildRedCoverageJudgePrompt: RED tests judged vs the test-list SPEC (coverage + faithfulness)", () => {
  it("asks whether every test-list item is COVERED and FAITHFULLY asserted, not matched to recorded tests", () => {
    const p = buildRedCoverageJudgePrompt('{"tests":[{"id":"T1"}]}', '[{"id":"AC1"}]', "def test_x(): ...");
    expect(p).toMatch(/coverage/i);
    expect(p).toMatch(/faithful/i);
    expect(p).toMatch(/test-list|test list/i);
    // The bar is the SPEC. The prompt should make explicit it is NOT matching recorded tests.
    expect(p).toMatch(/not against any recorded tests|not.*recorded tests/i);
    expect(p).toMatch(/"score"/);
  });
});
