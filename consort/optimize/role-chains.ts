// role-chains: the per-role chain CATALOGUE + a single runner, the shared substrate for BOTH
// the per-role live tests (tests/integration/live/) AND the per-role optimize sweep
// (role-sweep.ts). Each entry names a chain dir (which carries the <dir>-seed replay + <dir>-live
// claude manifests), the artifact the live role must produce, and the live-turn prompt. One
// isolated role turn, recorded inputs replayed in, no full-project scaffold , the isolation the
// whole manifest/chain layer exists to give, so a role can be instrumented + lever-swept alone.
//
// The catalogue is DATA (prompts + paths), so it belongs with the optimize family, not buried in
// a test helper. runRoleChainLive drives ONE chain through runIntegrationChain and returns the
// turns; it accepts an optional per-manifest agent override (the lever-injection seam the sweep
// uses to patch the live role's model/effort/tool-scope for a candidate). The live tests call it
// with no override (default levers from the manifest); the sweep calls it once per candidate.

import { join } from "node:path";
import { runIntegrationChain } from "../orchestrator/scenarios/integration-chain.js";
import type { StepManifest } from "../orchestrator/steps/manifest.js";
import type { StepAgent } from "../orchestrator/agents/agent-types.js";
import type { ManifestTurn } from "../orchestrator/runners/manifest-runner.js";
import type { WorkflowAction } from "../orchestrator/workflow/workflow-vocabulary.js";

/** Kit-root-relative locations the chains read from. Resolved against process.cwd() (the kit
 *  root) by the caller; kept as constants so both the tests and the sweep agree. */
export const MANIFESTS_REL = "tests/integration/manifests";
export const INTAKE_REL = "tests/integration/intake";
export const FEATURE = "F1-stock-visibility";
export const STORY = "S1-file-stock";

/** Workspace-relative roots a DESIGN role writes its output under (features/... or planning/...),
 *  OUTSIDE .sftdd/. runRoleChainLive snapshots these in addition to .sftdd so the produced
 *  artifact is captured in producedArtifacts (keyed by its workspace-relative path == outputFile)
 *  , which is what the QUALITY GATE + evidence preservation both key on. Without this the gate
 *  silently skips (the scoreless-sweep defect). Every ROLE_CHAINS.outputFile lives under one of
 *  these; a `role-chains.test.ts` guard asserts that invariant so a new chain can't regress it. */
export const SNAPSHOT_ROOTS = ["features", "planning", "design"] as const;

/** The chain always starts from the PO seed action (the replay seed manifest matches it). */
export const PO_SEED: WorkflowAction = { kind: "invoke-role", role: "product-owner", mode: "author-requests" };

const REPORT_BLOCK =
  "As the LAST thing in your reply, emit a fenced report block:\n" +
  "```agent-report\n" +
  `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
  "```\n";
const NO_SHELL =
  ` Then STOP , do NOT run any shell command, do NOT run npx or ./scripts/lk, do NOT self-verify (the orchestrator validates your work). `;

/** One role chain's definition (the DATA that drives both the live test + the sweep). */
export interface RoleChain {
  /** Human name for the test title / report. */
  name: string;
  /** The chain dir under tests/integration/manifests/; its manifest ids are <dir>-seed/-live. */
  dir: string;
  /** The artifact the live role writes (workspace-relative = the manifest output filename). */
  outputFile: string;
  /** The live-turn prompt handed to the real agent. */
  prompt: string;
  /** OPTIONAL quality-gate reference override (intake-relative). When the recorded `outputFile`
   *  is a WIDER scope than what the isolated turn is given the inputs to produce (e.g. the
   *  test-strategist writes the feature MASTER test-list, but a per-story chain is seeded ONE
   *  story's ACs), the discriminator must score against the matching SLICE, not the full artifact
   *  , else every candidate scores "thin" for a scope reason, not a quality reason. Absent =>
   *  score against `outputFile` (the default; the produced artifact IS the whole recorded one). */
  referenceFile?: string;
}

/** The per-role chain catalogue, keyed by a short handle (also the live role). Each maps 1:1 to a
 *  manifest dir; the manifest ids are derived (<dir>-seed / <dir>-live). */
export const ROLE_CHAINS: Record<string, RoleChain> = {
  "spec-author-story": {
    name: "spec-author per-story ACs",
    dir: "spec-author-story-chain",
    outputFile: `features/${FEATURE}/stories/${STORY}/acs/AC1-file-stock-record.json`,
    prompt:
      `You are the Spec Author. From the provided inputs (the product overview + the story stub, ` +
      `in this prompt , do NOT search the filesystem), draft the acceptance criteria for story ` +
      `${STORY}. WRITE at least this file, relative to your current working directory:\n` +
      `  - features/${FEATURE}/stories/${STORY}/acs/AC1-file-stock-record.json\n` +
      `Each AC file is a JSON object whose "id" equals its basename (AC1-file-stock-record), with ` +
      `given/when/then and a status. Author real, testable criteria from the story stub.` +
      NO_SHELL + REPORT_BLOCK,
  },
  "architect-reviewer": {
    name: "architect-reviewer per-story",
    dir: "architect-reviewer-chain",
    outputFile: `features/${FEATURE}/architecture.json`,
    prompt:
      `You are the Architect Reviewer. From the provided inputs (the NFR brief + the story AC, in ` +
      `this prompt), author the feature architecture. WRITE exactly this file, relative to your ` +
      `current working directory:\n` +
      `  - features/${FEATURE}/architecture.json\n` +
      `It MUST declare feature_id, an explicit service_backed boolean, layers[] (each role + ` +
      `module), and , when service_backed , persistence_invariants[] (each id/type/table/brief). ` +
      `This feature persists stock records, so it is service_backed with a real schema.` +
      NO_SHELL + REPORT_BLOCK,
  },
  dba: {
    name: "dba per-story schema",
    dir: "dba-chain",
    outputFile: `features/${FEATURE}/db-design.json`,
    prompt:
      `You are the DBA. From the provided architecture.json (in this prompt , the architect owns ` +
      `the logical contract: service_backed, layers, persistence_invariants), produce the PHYSICAL ` +
      `schema. WRITE exactly this file, relative to your current working directory:\n` +
      `  - features/${FEATURE}/db-design.json\n` +
      `Declare feature_id, tables[] (columns with type/nullable, primary_key, unique_constraints, ` +
      `foreign_keys, checks, indexes), this story's schema_changes[], and realizes_invariants[] as ` +
      `a FLAT array of the architecture.json persistence_invariant id STRINGS (bare ids, not objects). ` +
      `Do NOT re-author the invariants; physically realize them.` +
      NO_SHELL + REPORT_BLOCK,
  },
  "test-strategist": {
    name: "test-strategist per-story",
    dir: "test-strategist-chain",
    outputFile: `features/${FEATURE}/test-list.json`,
    // Scored against the S1 SLICE of the recorded master, not the full 32-item/3-story master:
    // this chain is invoked for story S1 (the real drive's per-story invocation unit) and seeded
    // S1's ACs, so the faithful reference is the S1-scoped items. All 5 persistence invariants are
    // covered within S1's slice, so an S1 test-list still passes the coverage gate.
    referenceFile: `features/${FEATURE}/test-list.S1-slice.json`,
    prompt:
      `You are the Test Strategist, invoked for story ${STORY}. From the provided inputs (ALL of ` +
      `story ${STORY}'s ACs + architecture.json + db-design.json, in this prompt , do NOT search the ` +
      `filesystem), produce the feature master test list covering EVERY provided AC. WRITE exactly ` +
      `this file, relative to your current working directory:\n` +
      `  - features/${FEATURE}/test-list.json\n` +
      `Order the story's tests; map each test's ac_id to one of the provided ACs' EXACT ids, and ` +
      `cover each provided AC at least once. Cover EVERY architecture.json persistence_invariant with ` +
      `a real-branch fitness test that sets "invariant_id". Every DB-writing test must own its state ` +
      `(a per-run-unique key). Conform to test-list.schema.json.` +
      NO_SHELL + REPORT_BLOCK,
  },
  "spec-author-propose": {
    name: "spec-author propose (sprint plan lane)",
    dir: "spec-author-propose-chain",
    outputFile: `planning/feature-proposals.md`,
    prompt:
      `You are the Spec Author in the sprint plan lane. From the provided product overview + NFR ` +
      `brief (in this prompt), propose the sprint's candidate features. WRITE exactly this file, ` +
      `relative to your current working directory:\n` +
      `  - planning/feature-proposals.md\n` +
      `One candidate feature per section (a heading + a short scope), so the Architect can size ` +
      `them and the PO can commit a backlog.` +
      NO_SHELL + REPORT_BLOCK,
  },
  "architect-estimator": {
    name: "architect-estimator (estimate)",
    dir: "architect-estimator-chain",
    outputFile: `planning/estimates.json`,
    prompt:
      `You are the Architect estimating the sprint's candidate features. From the provided ` +
      `feature-proposals.md (in this prompt), t-shirt size each candidate. WRITE exactly this file, ` +
      `relative to your current working directory:\n` +
      `  - planning/estimates.json\n` +
      `A JSON array (or object) of per-candidate {feature_id/name, size (one of XS/S/M/L/XL), ` +
      `rationale}. Size every candidate the proposals name.` +
      NO_SHELL + REPORT_BLOCK,
  },
  "ux-designer": {
    name: "ux-designer (design system)",
    dir: "ux-designer-chain",
    outputFile: `design/design-guide.json`,
    prompt:
      `You are the UX Designer. From the provided inputs (the HIL design brief + the product ` +
      `overview, in this prompt , do NOT search the filesystem), translate the brief into the ` +
      `project's machine-checkable design system. WRITE exactly this file, relative to your ` +
      `current working directory:\n` +
      `  - design/design-guide.json\n` +
      `Realize EVERY element the brief names: all token scales (typography, colors, spacing, ` +
      `radius, shadows, breakpoints) at every level the brief enumerates, and a "components" block ` +
      `with an entry for EACH reusable UI component the brief describes (navbar, page, card, ` +
      `button, form input, table, status badge, empty state, and any others named), each with its ` +
      `class + notes. Conform to design-guide.schema.json. Cover the brief exhaustively , a missing ` +
      `token level, asset, or component is a defect.` +
      NO_SHELL + REPORT_BLOCK,
  },
};

/** Options for one chain run: the kit root + an optional per-manifest agent override (the sweep's
 *  lever-injection seam). */
export interface RunRoleChainOptions {
  /** The kit root the manifests/intake resolve against (default process.cwd()). */
  kitDir?: string;
  /** Build the StepAgent for a manifest imperatively (override the manifest's declared agent).
   *  Return undefined for a manifest to fall through to the catalogue (the seed steps). The sweep
   *  returns a lever-patched ClaudeStepAgent for the live-role manifest here. */
  agentFor?(manifest: StepManifest): StepAgent | undefined;
}

/** What a role chain run returns: the turns PLUS the preserved produced-artifact tree (every
 *  file the run wrote, {relpath -> contents}), so the caller keeps the actual outputs, not just
 *  telemetry. */
export interface RoleChainRun {
  turns: ManifestTurn[];
  producedArtifacts: Record<string, string>;
}

/**
 * Run ONE role chain end to end (seed replay -> live role) and return every turn + the preserved
 * produced-artifact tree. Shared by the live tests (no agentFor = default levers from the manifest)
 * and the sweep (agentFor patches the live role's levers per candidate). The last turn is the live
 * role's; its .telemetry carries the measured usage; producedArtifacts holds the actual files it
 * wrote (captured before teardown). Assertions live in the caller.
 */
export async function runRoleChainLive(chain: RoleChain, opts: RunRoleChainOptions = {}): Promise<RoleChainRun> {
  const kit = opts.kitDir ?? process.cwd();
  const { turns, producedArtifacts } = await runIntegrationChain({
    manifestDir: join(kit, MANIFESTS_REL, chain.dir),
    intakeDir: join(kit, INTAKE_REL),
    feature: FEATURE,
    start: PO_SEED,
    // A design role writes its output at the WORKSPACE ROOT (features/... or planning/...), NOT
    // under .sftdd/. The default snapshot is .sftdd-only, so without this the produced artifact is
    // never captured in producedArtifacts , which means the QUALITY GATE (which keys on
    // producedArtifacts[chain.outputFile]) SILENTLY SKIPS and the artifact is not preserved (the
    // exact scoreless-sweep defect #556 exists to prevent). Snapshot the design output roots so the
    // produced file lands under its workspace-relative path (== chain.outputFile).
    extraSnapshotRoots: [...SNAPSHOT_ROOTS],
    // The live-role manifest declares agent.kind "claude" (unchanged even when the sweep
    // overrides the built agent via agentFor); the seed declares "replay". Prompt only the live role.
    instructionsFor: (m: StepManifest) =>
      m.agent?.kind === "claude"
        ? { prompt: chain.prompt, guidelines: [`Write ONLY ${chain.outputFile}; end with the agent-report block; run no command.`] }
        : { prompt: `Replay-seed for ${chain.name}.`, guidelines: [] },
    ...(opts.agentFor ? { agentFor: opts.agentFor } : {}),
  });
  return { turns, producedArtifacts };
}
