// P2e optimize-apply.cli pure helpers: arg parsing, reading the recorded candidate
// from the sweep audit trail, and resolving the role from a handoff id.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseApplyArgs, readRecordedCandidate, roleFromHandoffId } from "../../bin/sftdd/optimize-apply.cli";

describe("parseApplyArgs", () => {
  it("parses the required flags + dry-run", () => {
    const a = parseApplyArgs(["--project-dir", "/p", "--handoff", "S1-driver-green", "--candidate", "c1", "--dry-run"]);
    expect(a).toEqual({ projectDir: "/p", handoff: "S1-driver-green", candidate: "c1", dryRun: true });
  });
  it("captures an explicit --kit-dir", () => {
    const a = parseApplyArgs(["--project-dir", "/p", "--handoff", "h", "--candidate", "c", "--kit-dir", "/kit"]);
    expect(a.kitDir).toBe("/kit");
  });
});

describe("roleFromHandoffId", () => {
  it("resolves a build handoff id (story-role-mode)", () => {
    expect(roleFromHandoffId("S1-driver-green")).toBe("driver");
    expect(roleFromHandoffId("S1-navigator-review")).toBe("navigator");
  });
  it("resolves a design story handoff (story-role)", () => {
    expect(roleFromHandoffId("S1-spec-author")).toBe("spec-author");
    expect(roleFromHandoffId("S1-architect-reviewer")).toBe("architect-reviewer");
  });
  it("resolves a feature handoff (role only)", () => {
    expect(roleFromHandoffId("ux-designer")).toBe("ux-designer");
  });
});

describe("readRecordedCandidate", () => {
  let projectDir: string;
  let experimentsDir: string;
  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "apply-cli-"));
    experimentsDir = join(projectDir, "experiments");
  });
  afterEach(() => rmSync(projectDir, { recursive: true, force: true }));

  it("reads the candidate object from the first trial dir", () => {
    const dir = join(experimentsDir, "S1-driver-green", "haiku-green", "trial-0");
    mkdirSync(dir, { recursive: true });
    const cand = { id: "haiku-green", configOverrides: { roles: { driver: { model: { green: "haiku" } } } } };
    writeFileSync(join(dir, "candidate.json"), JSON.stringify(cand));
    const got = readRecordedCandidate(experimentsDir, "S1-driver-green", "haiku-green");
    expect(got).toEqual(cand);
  });

  it("throws a clear error when the candidate was never swept", () => {
    expect(() => readRecordedCandidate(experimentsDir, "S1-driver-green", "nope")).toThrow(/no recorded candidate/);
  });
});
