// navigator-chains: test the BUILD_ROLE_CHAINS catalogue (red, assess, review, reflect entries)
// and the verdict-alignment judge for review/reflect turns. Verify that chain definitions
// are well-formed, expand correctly in the sweep CLI, and the judge correctly evaluates
// verdict alignment (decision match + substantive reasoning).

import { describe, it, expect } from "vitest";
import {
  BUILD_ROLE_CHAINS,
  type BuildRoleChain,
} from "../../consort/optimize/build-role-chains.js";
import {
  buildVerdictAlignmentJudgePrompt,
  parseVerdictAlignmentReply,
  type VerdictOutput,
} from "../../consort/evaluation/semantic-gate.js";

describe("BUILD_ROLE_CHAINS: navigator build chains", () => {
  it("has four navigator entries: red, assess, review, reflect", () => {
    const keys = Object.keys(BUILD_ROLE_CHAINS);
    expect(keys).toContain("navigator-red");
    expect(keys).toContain("navigator-assess");
    expect(keys).toContain("navigator-review");
    expect(keys).toContain("navigator-reflect");
  });

  it("red chain has correct assertKind and outputFile", () => {
    const chain = BUILD_ROLE_CHAINS["navigator-red"];
    expect(chain.assertKind).toBe("red");
    expect(chain.outputFile).toBe("tests");
    expect(chain.verdictFile).toBeUndefined();
  });

  it("assess chain has correct assertKind and outputFile", () => {
    const chain = BUILD_ROLE_CHAINS["navigator-assess"];
    expect(chain.assertKind).toBe("assess");
    expect(chain.outputFile).toContain(".consort/cycles");
    expect(chain.verdictFile).toBeUndefined();
  });

  it("review chain has assertKind='review' and a verdictFile", () => {
    const chain = BUILD_ROLE_CHAINS["navigator-review"];
    expect(chain.assertKind).toBe("review");
    expect(chain.verdictFile).toBeDefined();
    expect(chain.verdictFile).toContain("review-verdict.json");
  });

  it("reflect chain has assertKind='reflect' and a verdictFile", () => {
    const chain = BUILD_ROLE_CHAINS["navigator-reflect"];
    expect(chain.assertKind).toBe("reflect");
    expect(chain.verdictFile).toBeDefined();
    expect(chain.verdictFile).toContain("reflect-verdict.json");
  });

  it("every chain has a non-empty prompt", () => {
    for (const [name, chain] of Object.entries(BUILD_ROLE_CHAINS)) {
      expect(chain.prompt.length, `${name} prompt is empty`).toBeGreaterThan(0);
    }
  });

  it("every chain has extraSnapshotRoots including tests", () => {
    for (const [name, chain] of Object.entries(BUILD_ROLE_CHAINS)) {
      expect(Array.isArray(chain.extraSnapshotRoots), `${name} extraSnapshotRoots is not an array`).toBe(
        true,
      );
      expect(chain.extraSnapshotRoots.includes("tests"), `${name} does not include tests`).toBe(true);
    }
  });
});

describe("buildVerdictAlignmentJudgePrompt: verdict comparison prompt builder", () => {
  it("includes both verdicts in the review prompt", () => {
    const recorded: VerdictOutput = { refactor: false, notes: "clean design" };
    const candidate: VerdictOutput = { refactor: false, notes: "adheres to NFRs" };
    const prompt = buildVerdictAlignmentJudgePrompt(recorded, candidate, "review");
    expect(prompt).toContain("RECORDED verdict");
    expect(prompt).toContain("CANDIDATE verdict");
    expect(prompt).toContain("clean design");
    expect(prompt).toContain("adheres to NFRs");
  });

  it("includes decision fields in the review prompt", () => {
    const recorded: VerdictOutput = { refactor: true, notes: "has gaps" };
    const candidate: VerdictOutput = { refactor: true, notes: "found issues" };
    const prompt = buildVerdictAlignmentJudgePrompt(recorded, candidate, "review");
    expect(prompt).toContain("refactor");
    expect(prompt).toContain("decisionMatch");
  });

  it("includes both verdicts in the reflect prompt", () => {
    const recorded: VerdictOutput = { version: 1, passed: true, findings: [] };
    const candidate: VerdictOutput = { version: 1, passed: true, findings: [] };
    const prompt = buildVerdictAlignmentJudgePrompt(recorded, candidate, "reflect");
    expect(prompt).toContain("RECORDED verdict");
    expect(prompt).toContain("CANDIDATE verdict");
  });

  it("includes decision fields in the reflect prompt", () => {
    const recorded: VerdictOutput = { version: 1, passed: false, findings: ["gap: missing UI"] };
    const candidate: VerdictOutput = { version: 1, passed: false, findings: ["gap: no component"] };
    const prompt = buildVerdictAlignmentJudgePrompt(recorded, candidate, "reflect");
    expect(prompt).toContain("passed");
    expect(prompt).toContain("decisionMatch");
  });
});

describe("parseVerdictAlignmentReply: parse judge verdict", () => {
  it("parses a decision-match reply (passed=true)", () => {
    const reply = '{"decisionMatch": true, "substantive": true, "reason": "both say refactor=false"}';
    const outcome = parseVerdictAlignmentReply(reply);
    expect(outcome.passed).toBe(true);
    expect(outcome.decisionMatch).toBe(true);
    expect(outcome.substantive).toBe(true);
  });

  it("parses a decision-mismatch reply (passed=false)", () => {
    const reply = '{"decisionMatch": false, "reason": "candidate says refactor=true, recorded says false"}';
    const outcome = parseVerdictAlignmentReply(reply);
    expect(outcome.passed).toBe(false);
    expect(outcome.decisionMatch).toBe(false);
  });

  it("returns passed=false when decisionMatch=false regardless of substantive", () => {
    const reply = '{"decisionMatch": false, "substantive": true, "reason": "mismatch"}';
    const outcome = parseVerdictAlignmentReply(reply);
    expect(outcome.passed).toBe(false);
  });

  it("returns passed=false on unparseable reply", () => {
    const reply = "not json at all";
    const outcome = parseVerdictAlignmentReply(reply);
    expect(outcome.passed).toBe(false);
    expect(outcome.decisionMatch).toBe(false);
  });

  it("returns passed=false when substantive=false", () => {
    const reply = '{"decisionMatch": true, "substantive": false, "reason": "weak reasoning"}';
    const outcome = parseVerdictAlignmentReply(reply);
    expect(outcome.passed).toBe(false);
  });
});
