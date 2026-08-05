// Build-turn numbering must be PER-STORY and RESUME-SAFE. The recorder once used
// a per-drive-process counter (reset to 0 on resume), so a story built across a
// resume got a second turn mislabeled 001-… that sorts BEFORE its earlier 007-…
// dirs, corrupting the replay order. nextBuildTurnNumber seeds the next ordinal
// from what is already on disk for that story, so a resumed capture CONTINUES the
// sequence instead of restarting it. Hermetic: real fs, tmpdirs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { nextBuildTurnNumber, recordBuildTurn, turnSlug } from "../../consort/pipeline/record-build.js";

const F = "F1-x";
const S = "S1-y";
let corpus: string;
let proj: string;
let tdd: string;

function existingTurn(slug: string): void {
  mkdirSync(join(corpus, "features", F, "stories", S, "turns", slug, "code"), { recursive: true });
}

beforeEach(() => {
  corpus = mkdtempSync(join(tmpdir(), "recb-corpus-"));
  proj = mkdtempSync(join(tmpdir(), "recb-proj-"));
  tdd = join(proj, ".tdd");
  mkdirSync(join(proj, "app"), { recursive: true });
  writeFileSync(join(proj, "app", "main.py"), "# code\n");
});
afterEach(() => {
  rmSync(corpus, { recursive: true, force: true });
  rmSync(proj, { recursive: true, force: true });
});

describe("nextBuildTurnNumber (per-story, resume-safe)", () => {
  it("starts at 1 for a story with no recorded turns", () => {
    expect(nextBuildTurnNumber(corpus, F, S)).toBe(1);
  });

  it("continues from the highest recorded turn (a resume does not restart at 1)", () => {
    existingTurn("001-navigator");
    existingTurn("002-driver");
    existingTurn("003-navigator-review");
    expect(nextBuildTurnNumber(corpus, F, S)).toBe(4);
  });

  it("keys on the NUMERIC prefix (not lexical), so 010 outranks 002", () => {
    existingTurn("008-navigator");
    existingTurn("009-driver");
    existingTurn("010-navigator-review");
    expect(nextBuildTurnNumber(corpus, F, S)).toBe(11);
  });

  it("is per-story: a sibling story's turns do not bump this story's next", () => {
    mkdirSync(join(corpus, "features", F, "stories", "S2-other", "turns", "005-driver", "code"), { recursive: true });
    expect(nextBuildTurnNumber(corpus, F, S)).toBe(1);
  });

  it("ignores reflect turns' numbering gaps but still advances past them", () => {
    existingTurn("001-navigator-reflect");
    existingTurn("002-navigator");
    expect(nextBuildTurnNumber(corpus, F, S)).toBe(3);
  });
});

describe("recordBuildTurn writes at the seeded per-story ordinal", () => {
  it("a resumed turn lands AFTER the earlier ones (007 then 008, never a stray 001)", () => {
    // Simulate a story built up to 007 in a prior session.
    for (const s of ["005-navigator", "006-driver", "007-navigator-review"]) existingTurn(s);
    const n = nextBuildTurnNumber(corpus, F, S); // 8
    const dir = recordBuildTurn({
      recordBuildDir: corpus, projectDir: proj, sftddDir: tdd,
      featureId: F, story: S, turn: n, role: "driver", mode: "refactor",
    });
    expect(dir.endsWith(turnSlug(8, "driver", undefined, "refactor"))).toBe(true);
    expect(dir).toMatch(/008-driver-refactor$/);
  });
});
