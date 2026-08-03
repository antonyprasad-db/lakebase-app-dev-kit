// Golden equivalence for the manifest-driven command assembly. The Template Method's
// commandsFromManifest(action, cfg) must produce a DriveCommand[] BYTE-IDENTICAL to the
// legacy per-role branch of commandsForAction for the same action , that deep-equality is
// what lets a legacy branch be retired safely (migrate one action at a time; delete a
// branch only after its golden passes). This slice proves it for the spec-author breakdown
// step, and that the opt-in cfg flag leaves the default drive untouched.

import { describe, it, expect } from "vitest";
import {
  commandsForAction,
  commandsFromManifest,
  type DriveEffectsConfig,
} from "../../scripts/sftdd/orchestrator-effects";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive";

function cfg(over: Partial<DriveEffectsConfig> = {}): DriveEffectsConfig {
  return {
    projectDir: "/p",
    sftddDir: "/p/.tdd",
    featureId: "F1-stock-visibility",
    runner: { async run() {} },
    modelForRole: () => "sonnet",
    approver: "human-proxy",
    deployTarget: "local",
    ...over,
  };
}

const BREAKDOWN: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };

describe("commandsFromManifest ≡ commandsForAction (golden equivalence)", () => {
  it("spec-author breakdown: byte-identical command list", () => {
    const legacy = commandsForAction(BREAKDOWN, cfg());
    const fromManifest = commandsFromManifest(BREAKDOWN, cfg());
    expect(fromManifest).toEqual(legacy);
  });

  it("reproduces the breakdown structural commands in order (reset, claude, verify, sync, reconcile)", () => {
    const cmds = commandsFromManifest(BREAKDOWN, cfg());
    expect(cmds).toBeDefined();
    // [reset-breakdown, claude, verify-artifact, sync-breakdown, log-reconcile].
    expect(cmds!.map((c) => (c.kind === "cli" ? `cli:${c.args[0]}` : c.kind))).toEqual([
      "cli:reset-breakdown",
      "claude",
      "verify-artifact",
      "cli:sync-breakdown",
      "cli:--reconcile",
    ]);
  });

  it("honors the same model/effort levers as the legacy path", () => {
    const c = cfg({ modelForRole: (r) => (r === "spec-author" ? "opus" : "sonnet") });
    const legacy = commandsForAction(BREAKDOWN, c);
    const fromManifest = commandsFromManifest(BREAKDOWN, c);
    expect(fromManifest).toEqual(legacy);
    expect((fromManifest![1] as { model: string }).model).toBe("opus");
  });

  it("returns undefined for an action with no manifest (the default path is untouched)", () => {
    const noManifest: WorkflowAction = { kind: "planning-complete" };
    expect(commandsFromManifest(noManifest, cfg())).toBeUndefined();
  });
});
