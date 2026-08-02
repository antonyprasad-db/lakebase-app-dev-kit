// The drive spawns role agents headless (claude -p). A scaffolded project ships NO
// .claude/settings.json, so without an explicit permission mode the subagent
// DEFAULTS TO PROMPTING for file writes , and headless there is nothing to answer
// the prompt, so every Write/mkdir of the role's artifact (e.g. feature-spec.json)
// is refused and the role produces nothing (the live stockflow-optimize design
// sweep: "haven't granted it yet ... cannot create feature-spec.json"). The spawn
// must therefore declare acceptEdits so role agents can write their artifacts
// autonomously (the minimal grant , file edits/writes, NOT a full permission
// bypass). This guards that the base spawn args carry it.

import { describe, expect, it } from "vitest";

import { claudeBaseArgs } from "../../scripts/sftdd/drive.cli";

describe("claudeBaseArgs: headless write permission", () => {
  it("includes --permission-mode acceptEdits so a headless role agent can write its artifact", () => {
    const args = claudeBaseArgs({ kind: "claude", role: "spec-author", model: "opus", task: "draft the spec" });
    const i = args.indexOf("--permission-mode");
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe("acceptEdits");
  });

  it("still carries the core headless flags (-p, --agent, --model, stream-json)", () => {
    const args = claudeBaseArgs({ kind: "claude", role: "driver", model: "sonnet", task: "t" });
    expect(args[0]).toBe("-p");
    expect(args).toContain("--agent");
    expect(args).toContain("driver");
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
  });

  it("does NOT use the dangerous full bypass (acceptEdits is the minimal write grant)", () => {
    const args = claudeBaseArgs({ kind: "claude", role: "spec-author", model: "opus", task: "t" });
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args).not.toContain("--allow-dangerously-skip-permissions");
    expect(args).not.toContain("bypassPermissions");
  });
});
