// Anti-recurrence guard: a scaffolded project MUST carry the kit's own .claude
// assets. The substrate scaffolder only deploys its own skill (it must not name
// the kit), so the kit's setup hook lays down the role agents, the kit skills,
// and the workflow commands. Regression: after the Consort rename + substrate
// extraction a live create-project produced NO .claude/agents/, so the driver's
// `claude --agent <role>` spawns resolved nothing and the design lane halted at
// turn 1. This test scaffolds the kit assets into a temp dir and asserts they
// land, so that can never ship again. Hermetic (no workspace).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { layDownKitClaudeAssets } from "../../consort/setup/project-consort-setup";
import { ALL_AGENT_ROLES } from "../../consort/config/agent-models";

describe("kit scaffolds its own .claude assets (agents/skills/commands)", () => {
  let target: string;

  beforeAll(() => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "kit-claude-assets-"));
    layDownKitClaudeAssets(target);
  });

  afterAll(() => {
    fs.rmSync(target, { recursive: true, force: true });
  });

  it("deploys every role agent so `claude --agent <role>` resolves", () => {
    const agentsDir = path.join(target, ".claude", "agents");
    expect(fs.existsSync(agentsDir)).toBe(true);
    const onDisk = fs
      .readdirSync(agentsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
    // Exactly the AgentRole set (the same invariant plugin.test.ts asserts for
    // the skill source), so every role the driver dispatches has a project agent.
    expect(onDisk).toEqual([...ALL_AGENT_ROLES].sort());
  });

  it("deploys the consort skill and the engineering canon the agents import", () => {
    const skillsDir = path.join(target, ".claude", "skills");
    for (const skill of [
      "consort",
      "software-design-principles",
      "architectural-design-principles",
      "ui-ux-design-principles",
    ]) {
      expect(
        fs.existsSync(path.join(skillsDir, skill, "SKILL.md")),
        `skill ${skill} should be scaffolded`,
      ).toBe(true);
    }
  });

  it("deploys the workflow commands with the version placeholder substituted", () => {
    const cmdDir = path.join(target, ".claude", "commands");
    for (const cmd of ["plan", "design", "build", "deploy", "sprint"]) {
      const p = path.join(cmdDir, `${cmd}.md`);
      expect(fs.existsSync(p), `command ${cmd}.md should be scaffolded`).toBe(true);
      expect(fs.readFileSync(p, "utf8")).not.toContain("${KIT_VERSION_AT_SCAFFOLD}");
    }
  });

  it("never clobbers an asset the substrate already wrote", () => {
    // A pre-existing skill dir (as the substrate deploys its own) is preserved.
    const preexisting = path.join(target, ".claude", "skills", "lakebase-scm-workflows");
    fs.mkdirSync(preexisting, { recursive: true });
    fs.writeFileSync(path.join(preexisting, "SKILL.md"), "SENTINEL");
    layDownKitClaudeAssets(target);
    expect(fs.readFileSync(path.join(preexisting, "SKILL.md"), "utf8")).toBe("SENTINEL");
  });
});
