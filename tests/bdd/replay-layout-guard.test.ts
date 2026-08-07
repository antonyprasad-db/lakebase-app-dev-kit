// Anti-drift guard for the replay dir consolidation: ONE machinery dir
// (examples/replay/) with the corpora nested under examples/replay/corpora/<name>/.
// Before this, the machinery (launchers + engine) was split across
// examples/replay-scenarios/ and examples/tdd-workflow-smoke/orchestrator/, with each
// tree's own corpus fused in. The shell + the TS test path constants resolve against
// this exact layout; if a future move re-scatters it, the corpus-resolution tests fail
// with an opaque ENOENT deep in a readFileSync. This guard fails FIRST, naming the
// canonical layout, so the drift is obvious at the source.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const REPLAY_DIR = path.join(REPO_ROOT, "examples", "replay");
const CORPORA_DIR = path.join(REPLAY_DIR, "corpora");

describe("replay layout: one machinery dir + corpora/ subdir (anti-drift)", () => {
  it("the machinery dir examples/replay/ exists with the shared engine + generic launchers", () => {
    expect(fs.existsSync(REPLAY_DIR), "examples/replay/ machinery dir present").toBe(true);
    for (const f of ["_replay-smoke.sh", "replay-scenario.sh", "capture-scenario.sh", "SCENARIOS.md"]) {
      expect(fs.existsSync(path.join(REPLAY_DIR, f)), `examples/replay/${f} present`).toBe(true);
    }
  });

  it("corpora live under examples/replay/corpora/<name>/, NOT beside the machinery", () => {
    expect(fs.existsSync(CORPORA_DIR), "examples/replay/corpora/ present").toBe(true);
    // bug-tracker is the engine's DEFAULT corpus (the ex-tdd-workflow-smoke corpus,
    // now just another corpora/ entry). Its recorded-artifacts/ is what run-smoke.sh
    // resolves by default, so its presence here is load-bearing.
    expect(
      fs.existsSync(path.join(CORPORA_DIR, "bug-tracker", "recorded-artifacts")),
      "corpora/bug-tracker/recorded-artifacts/ is the engine's default corpus",
    ).toBe(true);
    // At least one finalized scenario (a scenario.json) is nested under corpora/.
    const scenarioDirs = fs
      .readdirSync(CORPORA_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .filter((e) => fs.existsSync(path.join(CORPORA_DIR, e.name, "scenario.json")));
    expect(scenarioDirs.length, "at least one finalized scenario under corpora/").toBeGreaterThan(0);
  });

  it("the retired split trees are GONE (no examples/replay-scenarios, no examples/tdd-workflow-smoke)", () => {
    expect(
      fs.existsSync(path.join(REPO_ROOT, "examples", "replay-scenarios")),
      "examples/replay-scenarios/ was folded into examples/replay/ and must not return",
    ).toBe(false);
    expect(
      fs.existsSync(path.join(REPO_ROOT, "examples", "tdd-workflow-smoke")),
      "examples/tdd-workflow-smoke/ was folded into examples/replay/ and must not return",
    ).toBe(false);
  });
});
