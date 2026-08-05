// LiveDriveStepAgent: the UNCONTAINED StepAgent for the LIVE drive (Stage 2, #578).
//
// The live drive's agent turns run against the REAL project tree, not a contained workspace: a
// design turn reads `.sftdd/…` paths its prompt names and writes its artifact into `.sftdd`; a
// build turn edits the accumulating real code tree (each turn reads the prior turns' code). That
// is the legacy model `commandsForAction` -> `execRunner` speaks, and it is CORRECT (containment
// is only for the isolated per-role TESTS). So to route the live drive THROUGH the StepExecutor
// without changing agent behavior, this agent does the one thing that is byte-identical by
// construction: it assembles the EXACT legacy `buildClaudeCommand(action, cfg)` and dispatches it
// through the SAME `cfg.runner` (execRunner) the legacy `perform()` used. It thereby inherits, for
// free, everything execRunner owns , per-role session warmth + the context-budget guard, the
// mid-turn overflow + transient-blip retries, the per-turn build-replay overlay, and set-phase/
// sync-backlog handling , none of which the contained ClaudeStepAgent has.
//
// This is the deliberate counterpart to ClaudeStepAgent (the CONTAINED agent the integration
// tests + per-role sweep use): same StepAgent interface, opposite I/O model. The executor's 7
// phases are agnostic to which one runs; provisionWorkspace decides the roots (for the live drive:
// workspaceDir = the real project, so "contained to the workspace" IS the project).

import { buildClaudeCommand, type DriveEffectsConfig } from "../../../scripts/sftdd/orchestrator-effects.js";
import { takeLastAgentTranscript } from "../../../scripts/sftdd/drive-runner.js";
import type { WorkflowAction } from "../../../scripts/sftdd/orchestrator-drive.js";
import type { StepAgent, AgentInvocation } from "./agent-types.js";
import type { AgentTurnResult } from "./claude-step-agent.js";

/**
 * The uncontained live agent. Constructed with the drive `cfg` (the runner + the per-turn model/
 * effort resolution live there); each invoke() builds the legacy command for the invocation's
 * action and runs it through `cfg.runner`. `lastResult` surfaces the turn's usage + final text
 * (read from the transcript the runner captured), duck-typed exactly like ClaudeStepAgent so the
 * executor's phase-6 telemetry read (`lastAgentResult()`) works unchanged.
 */
export class LiveDriveStepAgent implements StepAgent {
  lastResult: AgentTurnResult | undefined;

  constructor(private readonly cfg: DriveEffectsConfig) {}

  /** The `claude` command this agent will dispatch , EXACTLY the legacy buildClaudeCommand for
   *  the action. Exported as a method (not just run) so the parity golden can assert byte-identity
   *  against commandsForAction without spawning. */
  command(action: WorkflowAction): ReturnType<typeof buildClaudeCommand> {
    if (action.kind !== "invoke-role") {
      throw new Error(`LiveDriveStepAgent only dispatches invoke-role actions; got ${JSON.stringify(action)}`);
    }
    return buildClaudeCommand(action, this.cfg);
  }

  async invoke(invocation: AgentInvocation): Promise<void> {
    // Dispatch the EXACT legacy command through the SAME runner the legacy perform() uses , so the
    // spawn (cwd=projectDir, prompt naming .sftdd paths, session/replay/retry) is byte-identical.
    // The workspace the executor provisioned is the real project; the runner spawns in cfg.projectDir.
    void invocation.workspaceDir; // uncontained: the runner owns cwd (= project); the workspace IS the project.
    await this.cfg.runner.run(this.command(invocation.action));
    // Surface the turn's final text the runner captured (undefined under an injected/no-op runner).
    // Usage/tokens are logged by execRunner itself; the transcript carries the final text only.
    const finalText = takeLastAgentTranscript()?.finalText;
    this.lastResult = finalText ? { finalText } : {};
  }
}
