// LIVE, LEAN per-role design + plan-lane chains (gated behind RUN_LIVE_STEP=1):
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/design-roles-live.test.ts
//
// One lean 2-turn chain per design/plan role: a REPLAY seed lays the role's RECORDED input
// artifacts into a throwaway `.sftdd` workspace, then the REAL agent (claude) authors that
// role's artifact from those inputs and emits an agent-report the orchestrator formats into a
// conformant agent-log. Each artifact is gated to its canonical schema (acConformant /
// architectureConformant / dbDesignConformant / testListConformant) or nonEmptyFile for the
// prose/plan artifacts. USES THE CURRENT DEFAULT LEVERS (model from the manifest; no overrides).
//
// LEAN , NO cloud project. Every live role is tool-scoped out of Bash (never runs ./scripts/lk)
// and reports via the agent-report channel, so nothing a scaffolded Databricks/GitHub/Lakebase
// project would provide is needed , the whole chain runs in a temp dir. The seed + live steps
// are the DATA in the chain manifests (tests/integration/manifests/<role>-chain/); the hermetic
// wiring guard is design-role-chains.test.ts (runs under `npm test`).

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { runIntegrationChain } from "../../consort/orchestrator/scenarios/integration-chain.js";
import type { StepManifest } from "../../consort/orchestrator/manifest/step-manifest.js";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive.js";

const KIT = process.cwd();
const MANIFESTS = join(KIT, "tests/integration/manifests");
const INTAKE = join(KIT, "tests/integration/intake");
const FEATURE = "F1-stock-visibility";
const STORY = "S1-file-stock";

const PO_SEED: WorkflowAction = { kind: "invoke-role", role: "product-owner", mode: "author-requests" };

const REPORT_BLOCK =
  "As the LAST thing in your reply, emit a fenced report block:\n" +
  "```agent-report\n" +
  `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
  "```\n";
const NO_SHELL = ` Then STOP , do NOT run any shell command, do NOT run npx or ./scripts/lk, do NOT self-verify (the orchestrator validates your work). `;

/** One live chain: its manifest dir, the live role's id, its seed id, the expected output file
 *  (workspace-relative, the manifest output filename), and the per-live-turn prompt. */
interface LiveChain {
  name: string;
  dir: string;
  seedId: string;
  liveId: string;
  outputFile: string;
  prompt: string;
}

const CHAINS: LiveChain[] = [
  {
    name: "spec-author per-story ACs",
    dir: "spec-author-story-chain",
    seedId: "sa-story-seed",
    liveId: "sa-story-live",
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
  {
    name: "architect-reviewer per-story",
    dir: "architect-reviewer-chain",
    seedId: "arch-seed",
    liveId: "arch-live",
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
  {
    name: "dba per-story schema",
    dir: "dba-chain",
    seedId: "dba-seed",
    liveId: "dba-live",
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
  {
    name: "test-strategist per-story",
    dir: "test-strategist-chain",
    seedId: "ts-seed",
    liveId: "ts-live",
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
  {
    name: "spec-author propose (sprint plan lane)",
    dir: "spec-author-propose-chain",
    seedId: "propose-seed",
    liveId: "propose-live",
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
  {
    name: "architect-estimator (estimate)",
    dir: "architect-estimator-chain",
    seedId: "estimator-seed",
    liveId: "estimator-live",
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
];

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE (lean): per-role seed -> live agent design chains (default levers)", () => {
  for (const chain of CHAINS) {
    it(
      `${chain.name}: replay-seeds inputs, then the REAL agent authors a conformant artifact`,
      async () => {
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
        expect(turns.map((t) => t.manifestId)).toEqual([chain.seedId, chain.liveId]);
        for (const t of turns) {
          expect(t.result.violations, `${t.manifestId}: ${t.result.violations.join("; ")}`).toEqual([]);
        }

        // The live role produced its (schema-gated) artifact at the declared path, and the chain
        // terminated cleanly (design-complete has no matching manifest in the chain).
        const liveTurn = turns[turns.length - 1];
        expect(liveTurn.manifestId).toBe(chain.liveId);
        expect(
          liveTurn.result.producedPaths.some((p) => p.endsWith(chain.outputFile)),
          `${chain.name} produced: ${liveTurn.result.producedPaths.join(", ")}`,
        ).toBe(true);
        expect(liveTurn.result.bounded.action).toEqual({ kind: "design-complete" });
      },
      900_000,
    );
  }
});
