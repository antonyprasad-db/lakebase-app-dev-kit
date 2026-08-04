// Shared support for the per-role LIVE design + plan-lane chains. Each per-role test file
// (architect-reviewer-live.test.ts, spec-author-story-live.test.ts, dba-live.test.ts, ...) is a
// thin wrapper that names its role and calls runRoleChain(ROLE_CHAINS[<name>]) so the file stays
// a few lines. This is the ISOLATION substrate the whole manifest/chain refactor exists for:
// exercise ONE role's turn on its own (recorded inputs replayed in, the real agent authoring its
// artifact), with no full-project scaffold, so each role can be instrumented + lever-swept
// independently. NOT a .test.ts itself (no vitest include match), so importing it adds no suite.
//
// LEAN , NO cloud project. Every live role is tool-scoped out of Bash (never runs ./scripts/lk)
// and reports via the agent-report channel; the chain runs in a throwaway `.sftdd` temp dir. The
// seed + live steps are the DATA in tests/integration/manifests/<role>-chain/; the hermetic
// wiring guard is ../hermetic/design-role-chains.test.ts.

import { expect } from "vitest";
import { join } from "node:path";
import { runIntegrationChain } from "../../../consort/orchestrator/scenarios/integration-chain.js";
import type { StepManifest } from "../../../consort/orchestrator/manifest/step-manifest.js";
import type { WorkflowAction } from "../../../scripts/sftdd/orchestrator-drive.js";

export const KIT = process.cwd();
export const MANIFESTS = join(KIT, "tests/integration/manifests");
export const INTAKE = join(KIT, "tests/integration/intake");
export const FEATURE = "F1-stock-visibility";
export const STORY = "S1-file-stock";

/** The chain always starts from the PO seed action (the replay seed manifest matches it). */
export const PO_SEED: WorkflowAction = { kind: "invoke-role", role: "product-owner", mode: "author-requests" };

const REPORT_BLOCK =
  "As the LAST thing in your reply, emit a fenced report block:\n" +
  "```agent-report\n" +
  `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
  "```\n";
const NO_SHELL =
  ` Then STOP , do NOT run any shell command, do NOT run npx or ./scripts/lk, do NOT self-verify (the orchestrator validates your work). `;

/** One live chain's definition: its manifest dir (which carries the seed + live-role manifests,
 *  with uniform ids `<dir>-seed` / `<dir>-live`), the file the live role must produce
 *  (workspace-relative = the manifest output filename), and the live-turn prompt. */
export interface RoleChain {
  /** Human name for the test title. */
  name: string;
  /** The chain dir under tests/integration/manifests/; its manifest ids are <dir>-seed/-live. */
  dir: string;
  /** The artifact the live role writes (workspace-relative), asserted in producedPaths. */
  outputFile: string;
  /** The live-turn prompt handed to the real agent. */
  prompt: string;
}

/** The per-role chain catalogue, keyed by a short handle the per-role test file names. Each
 *  matches a manifest dir 1:1; the ids are derived (<dir>-seed / <dir>-live). */
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
    prompt:
      `You are the Test Strategist. From the provided inputs (the story AC + architecture.json + ` +
      `db-design.json, in this prompt), produce the feature master test list. WRITE exactly this ` +
      `file, relative to your current working directory:\n` +
      `  - features/${FEATURE}/test-list.json\n` +
      `Order the story's tests; map each test's ac_id to the provided AC's exact id. Cover EVERY ` +
      `architecture.json persistence_invariant with a real-branch fitness test that sets ` +
      `"invariant_id". Every DB-writing test must own its state (a per-run-unique key). Conform to ` +
      `test-list.schema.json.` +
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
};

/**
 * Run ONE role's isolated seed -> live chain end to end and assert it produced a conformant
 * artifact + terminated cleanly. Shared by every per-role live test file. The seed replays the
 * role's recorded inputs; only the role's own turn is a live claude spawn. The manifest ids are
 * derived from the dir (<dir>-seed / <dir>-live), matching the uniform convention.
 */
export async function runRoleChain(chain: RoleChain): Promise<void> {
  const seedId = `${chain.dir}-seed`;
  const liveId = `${chain.dir}-live`;

  const { turns } = await runIntegrationChain({
    manifestDir: join(MANIFESTS, chain.dir),
    intakeDir: INTAKE,
    feature: FEATURE,
    start: PO_SEED,
    instructionsFor: (m: StepManifest) =>
      m.agent?.kind === "claude"
        ? { prompt: chain.prompt, guidelines: [`Write ONLY ${chain.outputFile}; end with the agent-report block; run no command.`] }
        : { prompt: `Replay-seed for ${chain.name}.`, guidelines: [] },
  });

  // Both turns ran in order (seed replay, then the live role), each clean.
  expect(turns.map((t) => t.manifestId)).toEqual([seedId, liveId]);
  for (const t of turns) {
    expect(t.result.violations, `${t.manifestId}: ${t.result.violations.join("; ")}`).toEqual([]);
  }

  // The live role produced its (schema-gated) artifact at the declared path, and the chain
  // terminated cleanly (design-complete has no matching manifest in the chain).
  const liveTurn = turns[turns.length - 1];
  expect(liveTurn.manifestId).toBe(liveId);
  expect(
    liveTurn.result.producedPaths.some((p) => p.endsWith(chain.outputFile)),
    `${chain.name} produced: ${liveTurn.result.producedPaths.join(", ")}`,
  ).toBe(true);
  expect(liveTurn.result.bounded.action).toEqual({ kind: "design-complete" });
}
