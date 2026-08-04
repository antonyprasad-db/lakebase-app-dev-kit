// integration-chain: a folder-discovery runner , point it at a manifest directory + a start
// action, and it loads EVERY manifest in that folder and drives runManifestChain from the start,
// following each turn's routing to the next matching manifest until the chain leaves the set.
// "Anything in the manifest folder participates" , dropping a new manifest whose `match` is
// reached by the chain's routing pulls it in automatically. LEAN: runs in a throwaway `.sftdd`
// workspace, no cloud project (a chain with one live agent still only needs a temp dir + the
// agent-report channel).

import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runManifestChain, type ManifestRunnerDeps, type ManifestTurn } from "../manifest/manifest-runner.js";
import { loadStepManifests, type StepManifest } from "../manifest/step-manifest.js";
import type { StepInstructions } from "../agents/spec-author-breakdown-step-types.js";
import type { WorkflowAction } from "../../../scripts/sftdd/orchestrator-drive.js";
import type { DriveEffectsConfig } from "../../../scripts/sftdd/orchestrator-effects.js";
import type { AgentBuildContext } from "../agents/agent-catalogue.js";

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
