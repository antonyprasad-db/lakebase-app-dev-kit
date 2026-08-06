// Stage 2 (#578) parity gate: the UNCONTAINED live agent (LiveDriveStepAgent) must dispatch the
// EXACT command the legacy drive spawns for an action. It builds `buildClaudeCommand(action, cfg)`
// and runs it through cfg.runner , so routing the live drive THROUGH the StepExecutor with this
// agent changes only the plumbing, never the spawn. This test asserts the byte-identity: the
// agent's command equals the `claude` DriveCommand inside commandsForAction's output for the same
// action + cfg. If it drifts, the executor-dispatch path would silently change agent behavior.

import { describe, it, expect } from "vitest";
import {
  commandsForAction,
  type DriveCommand,
  type DriveEffectsConfig,
} from "../../consort/orchestrator/drive/orchestrator-effects";
import type { WorkflowAction } from "../../consort/orchestrator/drive/orchestrator-drive";
import { LiveDriveStepAgent } from "../../consort/orchestrator/agents/live-drive-step-agent";

function cfg(over: Partial<DriveEffectsConfig> = {}): DriveEffectsConfig {
  return {
    projectDir: "/p",
    consortDir: "/p/.sftdd",
    featureId: "F1-stock-visibility",
    runner: { async run() {} },
    modelForRole: () => "sonnet",
    approver: "human-proxy",
    deployTarget: "local",
    ...over,
  };
}

/** The single `claude` command the legacy branch emits for an action (the spawn under test). */
function legacyClaude(action: WorkflowAction, c: DriveEffectsConfig): DriveCommand | undefined {
  return commandsForAction(action, c).find((cmd) => cmd.kind === "claude");
}

describe("LiveDriveStepAgent.command ≡ the legacy claude spawn (Stage 2 parity)", () => {
  const cases: Array<[string, WorkflowAction]> = [
    ["spec-author breakdown", { kind: "invoke-role", role: "spec-author", mode: "breakdown" }],
    ["architect per-story", { kind: "invoke-role", role: "architect-reviewer", story: "S1-record-stock" }],
    ["dba per-story", { kind: "invoke-role", role: "dba", story: "S1-record-stock" }],
    ["test-strategist per-story", { kind: "invoke-role", role: "test-strategist", story: "S1-record-stock" }],
    ["ux-designer", { kind: "invoke-role", role: "ux-designer" }],
  ] as unknown as Array<[string, WorkflowAction]>;

  it.each(cases)("%s: agent command deep-equals the legacy claude command", (_label, action) => {
    const c = cfg();
    const agent = new LiveDriveStepAgent(c);
    const legacy = legacyClaude(action, c);
    expect(legacy, "the legacy branch must emit a claude command for this action").toBeDefined();
    expect(agent.command(action)).toEqual(legacy);
  });

  it("honors per-turn model tiering exactly as the legacy path (byte-identical under a modelForTurn cfg)", () => {
    // A driver GREEN turn under model tiering , the agent's command must carry the SAME model the
    // legacy spawn would (proving the agent reuses buildClaudeCommand's resolution, not its own).
    const c = cfg({ modelForTurn: (r, t) => (r === "driver" && t === "green" ? "haiku" : "sonnet") });
    const green: WorkflowAction = { kind: "invoke-role", role: "driver", story: "S1-record-stock" };
    const agent = new LiveDriveStepAgent(c);
    expect(agent.command(green)).toEqual(legacyClaude(green, c));
  });

  it("dispatches the exact command through cfg.runner on invoke (uncontained: the runner owns cwd)", async () => {
    const dispatched: DriveCommand[] = [];
    const c = cfg({ runner: { async run(cmd) { dispatched.push(cmd); } } });
    const action: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };
    const agent = new LiveDriveStepAgent(c);
    await agent.invoke({ action, workspaceDir: "/ignored-uncontained", inputs: {}, instructions: { prompt: "unused" } });
    // Exactly one command dispatched, and it is the legacy claude command (NOT the injected prompt).
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual(legacyClaude(action, c));
  });

  it("rejects a non-invoke-role action (only agent turns dispatch through this agent)", () => {
    const agent = new LiveDriveStepAgent(cfg());
    expect(() => agent.command({ kind: "planning-complete" } as WorkflowAction)).toThrow(/invoke-role/i);
  });
});
