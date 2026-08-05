// P2e optimize-apply: persist an APPROVED winning candidate's levers into the kit
// so the next invocation of that role uses them. Two lever kinds with different
// safety:
//   - Agent-.md levers (prompt / taskSuffix directive / tool scope / a whole
//     agent-overlay) are prose/data -> APPLIED DIRECTLY to
//     skills/consort/agents/<role>.md.
//   - Config levers (model / effort / session-scope / loop) live in TYPED SOURCE
//     (sftdd-config.ts defaultSftddConfig, agent-models.ts RECOMMENDED_MODELS, and
//     the role .md frontmatter `model:`). We do NOT regex-rewrite TS source; the
//     plan emits a precise SourceEditProposal (file + exact find/replace + a
//     regression-test note) for a normal reviewed edit.
// buildApplyPlan is pure; applyAgentMdLevers does the safe filesystem writes.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildApplyPlan,
  applyAgentMdLevers,
  formatApplyPlan,
  type ApplyPlan,
} from "../../scripts/sftdd/optimize-apply";
import type { Candidate } from "../../scripts/sftdd/optimize-candidates";

let kitDir: string;
let agentsDir: string;
beforeEach(() => {
  kitDir = mkdtempSync(join(tmpdir(), "optimize-apply-"));
  agentsDir = join(kitDir, "skills", "consort", "agents");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, "driver.md"),
    "---\nname: driver\nmodel: sonnet\ntools: Read, Edit, Bash\n---\n\n# Driver\n\nMake the failing test green.\n",
  );
});
afterEach(() => {
  rmSync(kitDir, { recursive: true, force: true });
});

describe("buildApplyPlan (pure)", () => {
  it("the baseline candidate is a no-op plan", () => {
    const plan = buildApplyPlan("driver", { id: "baseline", configOverrides: {} });
    expect(plan.agentMdEdits).toHaveLength(0);
    expect(plan.sourceEdits).toHaveLength(0);
  });

  it("a taskSuffix content lever becomes a directly-appliable agent-.md directive", () => {
    const cand: Candidate = { id: "c1", configOverrides: {}, content: { taskSuffix: " Prefer editing existing files." } };
    const plan = buildApplyPlan("driver", cand);
    expect(plan.agentMdEdits).toEqual([
      expect.objectContaining({ role: "driver", kind: "append-directive", value: expect.stringContaining("Prefer editing existing files") }),
    ]);
    expect(plan.sourceEdits).toHaveLength(0);
  });

  it("a tool-scope content lever becomes an agent-.md tools frontmatter edit", () => {
    const cand: Candidate = { id: "c1", configOverrides: {}, content: { allowedTools: ["Read", "Edit"] } };
    const plan = buildApplyPlan("driver", cand);
    expect(plan.agentMdEdits).toEqual([
      expect.objectContaining({ kind: "frontmatter-tools", value: "Read, Edit" }),
    ]);
  });

  it("a full agent-overlay content lever replaces the whole role .md", () => {
    const cand: Candidate = { id: "c1", configOverrides: {}, content: { agentOverlay: { role: "driver", markdown: "# tighter driver\n" } } };
    const plan = buildApplyPlan("driver", cand);
    expect(plan.agentMdEdits).toEqual([
      expect.objectContaining({ kind: "replace-file", value: "# tighter driver\n" }),
    ]);
  });

  it("a per-turn MODEL config lever becomes a SOURCE edit proposal (not auto-applied)", () => {
    const cand: Candidate = { id: "c1", configOverrides: { roles: { driver: { model: { green: "haiku" } } } } };
    const plan = buildApplyPlan("driver", cand);
    expect(plan.agentMdEdits).toHaveLength(0);
    expect(plan.sourceEdits.length).toBeGreaterThanOrEqual(1);
    const edit = plan.sourceEdits[0];
    expect(edit.file).toBe("consort/orchestrator/drive/sftdd-config.ts");
    expect(edit.rationale).toMatch(/driver.*green.*haiku/i);
    expect(edit.regressionTest).toBeTruthy();
  });

  it("a contextPackSuffix is reported as a manual proposal (dynamic injection, not a fixed directive)", () => {
    const cand: Candidate = { id: "c1", configOverrides: {}, content: { contextPackSuffix: " MODULE MAP: services/x.py" } };
    const plan = buildApplyPlan("driver", cand);
    expect(plan.agentMdEdits).toHaveLength(0);
    expect(plan.notes.join(" ")).toMatch(/contextPackSuffix/);
  });
});

describe("applyAgentMdLevers (filesystem)", () => {
  it("appends a directive to the role .md body and returns what it changed", () => {
    const plan = buildApplyPlan("driver", { id: "c1", configOverrides: {}, content: { taskSuffix: " Prefer edits." } });
    const applied = applyAgentMdLevers(kitDir, plan);
    const md = readFileSync(join(agentsDir, "driver.md"), "utf8");
    expect(md).toMatch(/Prefer edits\./);
    // frontmatter is preserved (append goes to the body, not the frontmatter)
    expect(md).toMatch(/^---\nname: driver/);
    expect(applied).toContain("driver.md");
  });

  it("rewrites the tools frontmatter in place", () => {
    const plan = buildApplyPlan("driver", { id: "c1", configOverrides: {}, content: { allowedTools: ["Read", "Edit"] } });
    applyAgentMdLevers(kitDir, plan);
    const md = readFileSync(join(agentsDir, "driver.md"), "utf8");
    expect(md).toMatch(/tools: Read, Edit\n/);
    // body preserved
    expect(md).toMatch(/Make the failing test green/);
  });

  it("replaces the whole file for an agent-overlay", () => {
    const plan = buildApplyPlan("driver", { id: "c1", configOverrides: {}, content: { agentOverlay: { role: "driver", markdown: "# new\n" } } });
    applyAgentMdLevers(kitDir, plan);
    expect(readFileSync(join(agentsDir, "driver.md"), "utf8")).toBe("# new\n");
  });

  it("does NOT touch source-edit proposals (those are for reviewed edits)", () => {
    const plan = buildApplyPlan("driver", { id: "c1", configOverrides: { roles: { driver: { model: { green: "haiku" } } } } });
    const applied = applyAgentMdLevers(kitDir, plan);
    // no agent-md change for a pure config lever
    expect(applied).toHaveLength(0);
    // the role .md is untouched
    expect(readFileSync(join(agentsDir, "driver.md"), "utf8")).toMatch(/model: sonnet/);
  });
});

describe("formatApplyPlan", () => {
  it("summarizes direct edits + surfaces the source-edit proposals to review", () => {
    const plan: ApplyPlan = buildApplyPlan("driver", {
      id: "c1",
      configOverrides: { roles: { driver: { model: { green: "haiku" } } } },
      content: { taskSuffix: " Prefer edits." },
    });
    const out = formatApplyPlan(plan);
    expect(out).toMatch(/driver/);
    expect(out).toMatch(/append-directive|Prefer edits/);
    expect(out).toMatch(/REVIEW|source edit|sftdd-config\.ts/);
  });
});
