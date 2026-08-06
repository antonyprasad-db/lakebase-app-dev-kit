// Hermetic test for the test-analyst roster preparer: the pure projection that bridges the TS
// TEST_ANALYST_CATALOGUE into the supervisor's turn, filtered by the project's uiTrack. Proves the
// renderer includes all 3 analysts when uiTrack is on and drops `client` when off (the no-frontend
// case), always keeps fitness+behavior, and emits a parseable fenced JSON roster; and that the
// registered "test-analyst-roster" preparer resolves through resolvePreparer + reads project.uiTrack
// from projectDir (via a scaffolded consort-config.json).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderTestAnalystRoster } from "../../consort/test-list/test-analyst-roster";
import { resolvePreparer } from "../../consort/orchestrator/build/preconditions";

/** Extract the fenced JSON payload from a rendered roster block. */
function parseRoster(block: string): { analysts: Array<{ kind: string; focus_prompt: string; inputs: string[]; model: string; effort?: string; tool_scope?: string[] }> } {
  const m = block.match(/```json\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`no fenced json in roster block:\n${block}`);
  return JSON.parse(m[1]);
}

describe("renderTestAnalystRoster: uiTrack gates client", () => {
  it("uiTrack:true renders all three analysts, each with a focus_prompt + inputs", () => {
    const roster = parseRoster(renderTestAnalystRoster({ projectDir: "/tmp/p", uiTrack: true }));
    expect(roster.analysts.map((a) => a.kind).sort()).toEqual(["behavior", "client", "fitness"]);
    for (const a of roster.analysts) {
      expect(a.focus_prompt.length, `${a.kind} focus_prompt`).toBeGreaterThan(40);
      expect(a.inputs.length, `${a.kind} inputs`).toBeGreaterThan(0);
    }
  });
  it("uiTrack:false drops client (behavior + fitness only)", () => {
    const roster = parseRoster(renderTestAnalystRoster({ projectDir: "/tmp/p", uiTrack: false }));
    expect(roster.analysts.map((a) => a.kind).sort()).toEqual(["behavior", "fitness"]);
  });
  it("the block instructs the supervisor to spawn one Task per entry + reconcile", () => {
    const block = renderTestAnalystRoster({ projectDir: "/tmp/p", uiTrack: true });
    expect(block).toMatch(/TEST-ANALYST ROSTER/);
    expect(block).toMatch(/Task subagent/i);
    expect(block).toMatch(/RECONCILE/i);
  });
  it("each entry carries the advisory levers (model + effort + tool_scope) for the supervisor to restate", () => {
    const roster = parseRoster(renderTestAnalystRoster({ projectDir: "/tmp/p", uiTrack: true }));
    for (const a of roster.analysts) {
      expect(a.model?.length, `${a.kind} model`).toBeGreaterThan(0);
      expect(["low", "default", "high"], `${a.kind} effort`).toContain(a.effort);
      expect(a.tool_scope?.length ?? 0, `${a.kind} tool_scope`).toBeGreaterThan(0);
    }
  });
  it("the header tells the supervisor to set model + RESTATE effort/tool_scope per spawn (Task has no such params)", () => {
    const block = renderTestAnalystRoster({ projectDir: "/tmp/p", uiTrack: true });
    expect(block).toMatch(/model to the entry/i);
    expect(block).toMatch(/effort/i);
    expect(block).toMatch(/tool_scope|Confine your work/i);
  });
});

describe('resolvePreparer("test-analyst-roster"): reads project.uiTrack from projectDir', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "roster-preparer-"));
  });
  afterEach(() => rmSync(projectDir, { recursive: true, force: true }));

  function seedUiTrack(value: boolean) {
    // resolveProjectSettings reads .lakebase/consort-config.json (project.uiTrack).
    mkdirSync(join(projectDir, ".lakebase"), { recursive: true });
    writeFileSync(join(projectDir, ".lakebase", "consort-config.json"), JSON.stringify({ project: { uiTrack: value } }));
  }

  const ctx = (pd: string) => ({ consortDir: join(pd, ".consort"), featureId: "F1-x", story: "S1-y", ac: "", projectDir: pd });

  it("a uiTrack:true project yields the 3-analyst roster", () => {
    seedUiTrack(true);
    const roster = parseRoster(resolvePreparer("test-analyst-roster")(ctx(projectDir)));
    expect(roster.analysts.map((a) => a.kind).sort()).toEqual(["behavior", "client", "fitness"]);
  });
  it("a uiTrack:false (or unset) project drops client", () => {
    seedUiTrack(false);
    const roster = parseRoster(resolvePreparer("test-analyst-roster")(ctx(projectDir)));
    expect(roster.analysts.map((a) => a.kind).sort()).toEqual(["behavior", "fitness"]);
  });
  it("no projectDir => defaults to no-frontend (behavior + fitness)", () => {
    const roster = parseRoster(resolvePreparer("test-analyst-roster")({ consortDir: "/tmp/c", featureId: "F1-x", story: "S1-y", ac: "" }));
    expect(roster.analysts.map((a) => a.kind).sort()).toEqual(["behavior", "fitness"]);
  });
});
