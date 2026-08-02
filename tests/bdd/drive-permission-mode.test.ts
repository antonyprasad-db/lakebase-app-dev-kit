// The drive spawns role agents headless (claude -p). A scaffolded project ships NO
// .claude/settings.json, so without an explicit permission mode the subagent
// DEFAULTS TO PROMPTING , and headless there is nothing to answer the prompt. The
// first attempt (acceptEdits) auto-approves file writes but NOT Bash, so the role's
// own kit-CLI calls (its self-check `lakebase-sftdd-response-formatter`, the cycle
// stamps, ls/cat) still prompted + retried, wasting round-trips inside the very turn
// we time (the live design sweep: "self-check ... blocked pending approval", turns
// 100-144s dominated by blocked retries). A headless SFTDD role agent must both
// WRITE its artifact AND RUN kit CLIs, so the drive uses bypassPermissions , the mode
// a fully-unattended drive needs (and what prior captures relied on via an ambient
// default). Scoped to a throwaway, isolated, scaffolded project driven headless (the
// claude -p subagents there), NOT this session/repo. User-approved 2026-08-02.

import { describe, expect, it } from "vitest";

import { claudeBaseArgs } from "../../scripts/sftdd/drive.cli";

describe("claudeBaseArgs: headless permission mode", () => {
  it("uses --permission-mode bypassPermissions so a headless role agent can write AND run its kit CLIs", () => {
    const args = claudeBaseArgs({ kind: "claude", role: "spec-author", model: "opus", task: "draft the spec" });
    const i = args.indexOf("--permission-mode");
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe("bypassPermissions");
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
});
