// integration-chain: a folder-discovery runner , point it at a manifest directory + a start
// action, and it loads EVERY manifest in that folder and drives runManifestChain from the start,
// following each turn's routing to the next matching manifest until the chain leaves the set.
// "Anything in the manifest folder participates" , dropping a new manifest whose `match` is
// reached by the chain's routing pulls it in automatically. LEAN: runs in a throwaway `.sftdd`
// workspace, no cloud project (a chain with one live agent still only needs a temp dir + the
// agent-report channel).

import { mkdtempSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runManifestChain, type ManifestRunnerDeps, type ManifestTurn } from "../manifest/manifest-runner.js";
import { loadStepManifests, type StepManifest } from "../manifest/step-manifest.js";
import type { StepInstructions } from "../agents/spec-author-breakdown-step-types.js";
import type { WorkflowAction } from "../../../scripts/sftdd/orchestrator-drive.js";
import type { DriveEffectsConfig } from "../../../scripts/sftdd/orchestrator-effects.js";
import type { AgentBuildContext } from "../agents/agent-catalogue.js";

/** Copy the kit's role agent definitions (skills/consort/agents/*.md) into
 *  <workspaceDir>/.claude/agents/ so a spawned `claude --agent <role>` resolves them. The kit's
 *  agents live in the repo (NOT in the scm-utils package's deployClaudeAgents), so this copies
 *  from there directly. A plain file copy , the load-bearing bit a live agent needs from the
 *  workspace, with no cloud project. */
export function layDownKitAgents(workspaceDir: string, kitDir: string = process.cwd()): void {
  const src = join(kitDir, "skills", "consort", "agents");
  if (!existsSync(src)) throw new Error(`layDownKitAgents: kit agents dir not found at ${src}`);
  const dest = join(workspaceDir, ".claude", "agents");
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

/** What the caller supplies to run an integration chain from a manifest folder. */
export interface IntegrationChainConfig {
  /** Directory of manifests to load (ALL .json in it participate). */
  manifestDir: string;
  /** The recorded intake the replay agents copy from. */
  intakeDir: string;
  /** The feature id the chain designs. */
  feature: string;
  /** The action the chain starts from. */
  start: WorkflowAction;
  /** Per-role output-path remap (a live agent writes to a baked cwd-relative path, e.g.
   *  ux-designer -> .sftdd/design/design-guide.json). Keyed by role. */
  outputPathsByRole?: Record<string, Record<string, string>>;
  /** Per-role instruction bundle (the live agent's prompt). */
  instructionsFor?(manifest: StepManifest): StepInstructions;
}

/** What one integration-chain run reports. */
export interface IntegrationChainResult {
  turns: ManifestTurn[];
  /** The workspace the chain ran in (already removed by the time this returns). */
  workspaceDir: string;
}

/**
 * Run an integration chain end to end in a throwaway `.sftdd` workspace, following the loaded
 * manifests' routing from `start`. The live agent (if any) authors an agent-report the
 * orchestrator formats into a conformant agent-log (formatAgentReports on). Removes the
 * workspace in a finally. No cloud , the whole chain is a temp dir.
 */
export async function runIntegrationChain(config: IntegrationChainConfig): Promise<IntegrationChainResult> {
  const manifests = loadStepManifests(config.manifestDir);
  const workspaceDir = mkdtempSync(join(tmpdir(), "integration-chain-"));
  mkdirSync(join(workspaceDir, ".sftdd"), { recursive: true });
  // Lay the kit's role agent definitions into <workspaceDir>/.claude/agents/ so a LIVE claude
  // step can resolve `--agent <role>` (spec-author / ux-designer / ...). This is the ONE thing a
  // live agent needs from the workspace that a bare temp dir lacks , a plain file copy from the
  // kit's own agent defs, NOT a cloud project. (claudeBaseArgs passes --setting-sources project
  // so the CLI loads these project-local agents.)
  layDownKitAgents(workspaceDir);

  const agentContext: Omit<AgentBuildContext, "workspaceDir"> = {
    corpusRoot: config.intakeDir,
    kitDir: process.cwd(),
  };

  const runnerDeps: ManifestRunnerDeps = {
    workspaceDir,
    cfg: {
      projectDir: workspaceDir,
      sftddDir: join(workspaceDir, ".sftdd"),
      featureId: config.feature,
    } as DriveEffectsConfig,
    agentContext,
    formatAgentReports: true,
    ...(config.instructionsFor ? { instructionsFor: (m: StepManifest) => config.instructionsFor!(m) } : {}),
    provisionWorkspace: (m: StepManifest) => {
      const outputPaths = config.outputPathsByRole?.[m.role];
      return outputPaths ? { workspaceDir, outputPaths } : { workspaceDir };
    },
  };
  // A live claude agent resolves the kit for its self-check/log; point at the kit root.
  process.env.LAKEBASE_KIT_DIR = process.cwd();

  try {
    const turns = await runManifestChain(config.start, manifests, runnerDeps);
    return { turns, workspaceDir };
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
