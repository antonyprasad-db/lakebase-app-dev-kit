// LIVE integration chain (gated behind RUN_LIVE_STEP=1):
//
//   RUN_LIVE_STEP=1 npx vitest run tests/integration/ux-designer-chain-live.test.ts
//
// The 3-step chain, driven by folder-discovery over tests/integration/manifests/ux-designer-chain/:
//   1. mock PO (replay)      , seeds product-overview.md + nfrs.md + design-brief.md.
//   2. mock spec-author      , delivers feature-spec.json to the orchestrator (deterministic).
//   3. LIVE ux-designer (claude) , takes the PO design-brief + the spec-author's feature-spec
//      and authors a schema-conformant design-guide.json.
//
// ONLY step 3 is a live agent; steps 1-2 are deterministic mock/replay. LEAN , the whole chain
// runs in a throwaway `.sftdd` workspace via the folder-discovery runner. NO cloud project (the
// live ux-designer is tool-scoped out of Bash and reports via the agent-report channel, so
// nothing a scaffolded Databricks/GitHub/Lakebase project would provide is needed).

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { runIntegrationChain } from "../../consort/orchestrator/scenarios/integration-chain.js";
import type { StepManifest } from "../../consort/orchestrator/manifest/step-manifest.js";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive.js";

const KIT = process.cwd();
const CHAIN_DIR = join(KIT, "tests/integration/manifests/ux-designer-chain");
const INTAKE = join(KIT, "tests/integration/intake");
const FEATURE = "F1-stock-visibility";
const GUIDE_REL = ".sftdd/design/design-guide.json";
const LOG_REL = ".sftdd/agent-log.jsonl";

const PO_SEED: WorkflowAction = { kind: "invoke-role", role: "product-owner", mode: "author-requests" };

function instructionsFor(manifest: StepManifest): { prompt: string; guidelines: string[] } {
  if (manifest.role !== "ux-designer") return { prompt: `Run ${manifest.role} step ${manifest.id}.`, guidelines: [] };
  return {
    prompt:
      `You are the UX Designer. From the provided inputs (in this prompt , the PO's design-brief ` +
      `and the feature-spec; do NOT search the filesystem or read other projects), author the ` +
      `machine-checkable design tokens. WRITE exactly this file, relative to your current ` +
      `working directory:\n` +
      `  - ${GUIDE_REL}\n` +
      `It MUST be a JSON object with AT LEAST these keys (extra keys are rejected at the top ` +
      `level, so use ONLY these): \n` +
      `  "typography": { "font_family": "<string>", "scale": { "<name>": "<size>", ... } },\n` +
      `  "colors": { "brand": { "<name>": "<hex>", ... }, "semantic": {...}, "surface": {...} },\n` +
      `  "spacing": { "<name>": "<value>", ... },\n` +
      `  "components": { "<name>": { "class": "<css-class>", "notes": "<...>" }, ... }\n` +
      `Derive the tokens from the design-brief (honor its palette, type, spacing). Then STOP , ` +
      `do NOT run any shell command, do NOT run npx or ./scripts/lk, do NOT self-verify. As the ` +
      `LAST thing in your reply, emit a fenced report block:\n` +
      "```agent-report\n" +
      `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
      "```\n",
    guidelines: [
      "design-guide.json REQUIRES typography (font_family + scale), colors (brand), spacing.",
      "The top-level object rejects unknown keys , use only typography/colors/spacing/radius/shadows/breakpoints/components.",
      "End your reply with the ```agent-report block; do NOT run any command or self-verify.",
    ],
  };
}

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE (lean): mock PO -> mock spec-author -> live ux-designer chain", () => {
  it("folder-discovers the chain manifests and drives PO -> spec-author -> live ux-designer to a conformant design-guide", async () => {
    const { turns } = await runIntegrationChain({
      manifestDir: CHAIN_DIR,
      intakeDir: INTAKE,
      feature: FEATURE,
      start: PO_SEED,
      // The live ux-designer writes to the baked cwd-relative design path; declare it so
      // validate-outputs looks there, and the agent-log to the shared location.
      outputPathsByRole: { "ux-designer": { "design-guide": GUIDE_REL, "agent-log": LOG_REL } },
      instructionsFor,
    });

    // All three turns ran, in order, each clean.
    expect(turns.map((t) => t.manifestId)).toEqual(["uxchain-po-seed", "uxchain-spec-author", "uxchain-ux-designer"]);
    for (const t of turns) {
      expect(t.result.violations, `${t.manifestId}: ${t.result.violations.join("; ")}`).toEqual([]);
    }

    // The mock spec-author delivered a feature-spec; the LIVE ux-designer produced a
    // schema-conformant design-guide.json (validated by designGuideConformant, no violations).
    const uxTurn = turns[turns.length - 1];
    expect(uxTurn.manifestId).toBe("uxchain-ux-designer");
    expect(
      uxTurn.result.producedPaths.some((p) => p.endsWith(GUIDE_REL)),
      `ux-designer produced: ${uxTurn.result.producedPaths.join(", ")}`,
    ).toBe(true);
    // Chain terminated cleanly (design-complete has no matching manifest).
    expect(uxTurn.result.bounded.action).toEqual({ kind: "design-complete" });
  }, 900_000);
});
