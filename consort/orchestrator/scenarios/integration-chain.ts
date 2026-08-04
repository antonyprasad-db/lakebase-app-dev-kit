// integration-chain: a folder-discovery runner , point it at a manifest directory + a start
// action, and it loads EVERY manifest in that folder and drives runManifestChain from the start,
// following each turn's routing to the next matching manifest until the chain leaves the set.
// "Anything in the manifest folder participates" , dropping a new manifest whose `match` is
// reached by the chain's routing pulls it in automatically. LEAN: runs in a throwaway `.sftdd`
// workspace, no cloud project (a chain with one live agent still only needs a temp dir + the
// agent-report channel).

import { mkdtempSync, mkdirSync, rmSync, cpSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { runManifestChain, type ManifestRunnerDeps, type ManifestTurn } from "../manifest/manifest-runner.js";
import { loadStepManifests, type StepManifest } from "../manifest/step-manifest.js";
import type { StepInstructions } from "../agents/agent-types.js";
import type { WorkflowAction } from "../../../scripts/sftdd/orchestrator-drive.js";
import type { DriveEffectsConfig } from "../../../scripts/sftdd/orchestrator-effects.js";
import { buildAgent, type AgentBuildContext } from "../agents/agent-catalogue.js";

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
  /** Per-role instruction bundle (the live agent's prompt). Receives the run's workspace dir so
   *  a build chain can compute the real buildContextPack against the SEEDED workspace .sftdd. */
  instructionsFor?(manifest: StepManifest, workspaceDir: string): StepInstructions;
  /** OPTIONAL agent override , build the StepAgent for a manifest imperatively instead of
   *  resolving manifest.agent via the catalogue. This is the LEVER-INJECTION seam the per-role
   *  optimize sweep uses: return a ClaudeStepAgent built from patched levers (model/effort/tool
   *  scope) for the live role's manifest, and undefined for the others (so they fall through to
   *  the catalogue = the replay seed). When absent, every manifest resolves via the catalogue
   *  (the default live run). */
  agentFor?(manifest: StepManifest): import("../agents/agent-types.js").StepAgent | undefined;
  /** OPTIONAL extra workspace-relative roots (besides `.sftdd`) to include in the preserved
   *  producedArtifacts snapshot. A BUILD-turn chain's navigator/driver writes CODE at the
   *  workspace root (tests/, app/), which the default `.sftdd`-only snapshot would drop , naming
   *  those roots here preserves them. Default empty ⇒ design chains snapshot only `.sftdd`
   *  (byte-identical to before). */
  extraSnapshotRoots?: string[];
}

/** What one integration-chain run reports. */
export interface IntegrationChainResult {
  turns: ManifestTurn[];
  /** The workspace the chain ran in (already removed by the time this returns). */
  workspaceDir: string;
  /** ALWAYS-ON artifact preservation: a snapshot of the produced `.sftdd` tree ({workspace-
   *  relative path -> file contents}), read BEFORE the workspace is torn down. Every run keeps
   *  its produced outputs , telemetry alone cannot reproduce or re-judge a result, so this is
   *  not optional (see the preserve-experiment-artifacts rule). A caller (the sweep) persists
   *  this to a durable per-experiment dir + can score any file in it. */
  producedArtifacts: Record<string, string>;
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
    ...(config.instructionsFor ? { instructionsFor: (m: StepManifest, _a: WorkflowAction, ws: string) => config.instructionsFor!(m, ws) } : {}),
    // Lever-injection seam: when a config.agentFor returns an override for a manifest, use it;
    // otherwise fall back to the catalogue (manifest.agent) so the seed/other steps are unchanged.
    // Only wired when config.agentFor is set, so the default run is byte-identical.
    ...(config.agentFor
      ? {
          agentFor: (m: StepManifest) => {
            const override = config.agentFor!(m);
            return override ?? buildAgent(m.agent!, { workspaceDir, ...agentContext });
          },
        }
      : {}),
    provisionWorkspace: (m: StepManifest) => {
      const outputPaths = config.outputPathsByRole?.[m.role];
      return outputPaths ? { workspaceDir, outputPaths } : { workspaceDir };
    },
  };
  // A live claude agent resolves the kit for its self-check/log; point at the kit root.
  process.env.LAKEBASE_KIT_DIR = process.cwd();

  try {
    const turns = await runManifestChain(config.start, manifests, runnerDeps);
    // ALWAYS preserve the produced outputs BEFORE teardown: snapshot the whole `.sftdd` tree
    // (every file the run wrote) into a {relpath -> contents} map. A run's produced artifacts
    // must survive the throwaway workspace , telemetry alone cannot reproduce or re-judge a
    // result (see the preserve-experiment-artifacts rule). A caller persists this to a durable
    // per-experiment dir. Never optional.
    const producedArtifacts = snapshotTree(join(workspaceDir, ".sftdd"), workspaceDir);
    // A BUILD chain's navigator/driver writes CODE at the workspace root (tests/, app/); the
    // default `.sftdd`-only snapshot drops it. Merge in any declared extra roots so the produced
    // code survives teardown too. Design chains pass none => this is a no-op (byte-identical).
    for (const root of config.extraSnapshotRoots ?? []) {
      Object.assign(producedArtifacts, snapshotTree(join(workspaceDir, root), workspaceDir));
    }
    return { turns, workspaceDir, producedArtifacts };
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

/** Snapshot every file under `root` into a { path-relative-to-`relTo` : contents } map. Used to
 *  preserve a run's produced artifacts before the workspace is torn down. Absent root -> {}. */
function snapshotTree(root: string, relTo: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(root)) return out;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) out[relative(relTo, abs)] = readFileSync(abs, "utf8");
    }
  };
  walk(root);
  return out;
}
