// SpecAuthorBreakdownStep: the FIRST concrete StepContract. It takes the 3 PO artifacts
// (product-overview.md, nfrs.md, feature-request.md) as its INPUT contract and produces
// feature-spec.json (+ story stubs) as its OUTPUT. Inside the step is an AGENT invoked
// with a passed-through instruction bundle (prompt + guidelines) that the ORCHESTRATOR
// supplies , from an interactive process or the filesystem; the step does not source it,
// it receives it. The agent is INJECTED so the step is unit-tested with no cloud/model:
// the mock agent writes the fixture feature-spec.json (simulating the real turn) and the
// step's output validation (formatRoleResponse) then passes/fails on what's on disk.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  SpecAuthorBreakdownStep,
  type StepAgent,
  type AgentInvocation,
} from "../../scripts/sftdd/spec-author-breakdown-step";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive";

const FEATURE = "F1-stock-visibility";
let tdd: string;

function seedPoArtifacts(): void {
  writeFileSync(join(tdd, "product-overview.md"), "# Overview\nA stock app.\n");
  writeFileSync(join(tdd, "nfrs.md"), "# NFRs\n## Required\n- R1: durability\n");
  mkdirSync(join(tdd, "features", FEATURE), { recursive: true });
  writeFileSync(join(tdd, "features", FEATURE, "feature-request.md"), "# Request\nRecord + view stock.\n");
}

/** The action the orchestrator pins for this step. */
const BREAKDOWN: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };

/** A mock agent: records the instruction bundle it was handed, and writes the fixture
 *  breakdown output (what the real claude turn would produce) so output validation runs
 *  against real on-disk artifacts. `writes: false` simulates an agent that returned
 *  without producing (so the output gate must FAIL). */
function mockAgent(opts: { writes: boolean }): { agent: StepAgent; seen: AgentInvocation[] } {
  const seen: AgentInvocation[] = [];
  const agent: StepAgent = {
    async invoke(invocation) {
      seen.push(invocation);
      if (opts.writes) {
        const fdir = join(tdd, "features", FEATURE);
        writeFileSync(
          join(fdir, "feature-spec.json"),
          JSON.stringify({ id: FEATURE, name: "Stock", status: "draft", tdd_mode: "N>=2", stories: ["S1-record-stock"] }, null, 2) + "\n",
        );
        mkdirSync(join(fdir, "stories", "S1-record-stock"), { recursive: true });
        writeFileSync(join(fdir, "stories", "S1-record-stock", "story.json"), JSON.stringify({ id: "S1-record-stock" }) + "\n");
        writeFileSync(join(fdir, "stories", "S1-record-stock", "story.md"), "# S1\n");
      }
    },
  };
  return { agent, seen };
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "spec-author-step-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("SpecAuthorBreakdownStep: input contract (the 3 PO artifacts)", () => {
  it("declares its inputs = product-overview.md, nfrs.md, feature-request.md", () => {
    const step = new SpecAuthorBreakdownStep(mockAgent({ writes: true }).agent, { sftddDir: tdd, featureId: FEATURE });
    const inputs = step.inputs(BREAKDOWN);
    expect(inputs.requires).toEqual([
      join(tdd, "product-overview.md"),
      join(tdd, "nfrs.md"),
      join(tdd, "features", FEATURE, "feature-request.md"),
    ]);
  });

  it("declares its output = feature-spec.json", () => {
    const step = new SpecAuthorBreakdownStep(mockAgent({ writes: true }).agent, { sftddDir: tdd, featureId: FEATURE });
    expect(step.outputs(BREAKDOWN)?.label).toBe("feature-spec.json");
    expect(step.outputs(BREAKDOWN)?.produces).toEqual([join(tdd, "features", FEATURE, "feature-spec.json")]);
  });
});

describe("SpecAuthorBreakdownStep: run() from inputs to output", () => {
  it("FAILS at the input stage naming a missing PO artifact (no agent invoked)", async () => {
    // Only two of the three PO artifacts present.
    writeFileSync(join(tdd, "product-overview.md"), "x\n");
    mkdirSync(join(tdd, "features", FEATURE), { recursive: true });
    writeFileSync(join(tdd, "features", FEATURE, "feature-request.md"), "x\n");
    const { agent, seen } = mockAgent({ writes: true });
    const step = new SpecAuthorBreakdownStep(agent, { sftddDir: tdd, featureId: FEATURE });
    const r = await step.run({ action: BREAKDOWN, instructions: { prompt: "p" } });
    expect(r.ok).toBe(false);
    expect(r.stage).toBe("input");
    expect(r.missing).toBe(join(tdd, "nfrs.md"));
    expect(seen).toHaveLength(0); // fail loud BEFORE invoking the agent
  });

  it("invokes the injected agent with the ORCHESTRATOR-PASSED instruction bundle, then passes output validation", async () => {
    seedPoArtifacts();
    const { agent, seen } = mockAgent({ writes: true });
    const step = new SpecAuthorBreakdownStep(agent, { sftddDir: tdd, featureId: FEATURE });
    const instructions = { prompt: "Break F1 into stories", guidelines: ["independence test", "feature-spec.json is required"] };
    const r = await step.run({ action: BREAKDOWN, instructions });

    // The step passed the bundle THROUGH to the agent (it did not source it itself).
    expect(seen).toHaveLength(1);
    expect(seen[0].instructions).toEqual(instructions);
    expect(seen[0].action).toEqual(BREAKDOWN);
    // Output produced + validated.
    expect(existsSync(join(tdd, "features", FEATURE, "feature-spec.json"))).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.output?.label).toBe("feature-spec.json");
  });

  it("FAILS at the output stage when the agent returns without producing a conformant feature-spec.json", async () => {
    seedPoArtifacts();
    const { agent } = mockAgent({ writes: false }); // agent runs but writes nothing
    const step = new SpecAuthorBreakdownStep(agent, { sftddDir: tdd, featureId: FEATURE });
    const r = await step.run({ action: BREAKDOWN, instructions: { prompt: "p" } });
    expect(r.ok).toBe(false);
    expect(r.stage).toBe("output");
    expect(r.reason).toMatch(/feature-spec\.json|breakdown/i);
  });
});

describe("SpecAuthorBreakdownStep: route() emits its proposal on completion", () => {
  it("proposes produced with the next step after a conformant breakdown", async () => {
    seedPoArtifacts();
    const { agent } = mockAgent({ writes: true });
    const step = new SpecAuthorBreakdownStep(agent, { sftddDir: tdd, featureId: FEATURE });
    await step.run({ action: BREAKDOWN, instructions: { prompt: "p" } });
    // Minimal state stub; the step proposes "produced" (orchestrator validates against
    // the pure transition + bounds , that is validateAndBound's job, tested separately).
    const proposal = step.route(BREAKDOWN, { state: { phase: "feature" } as never, feature: FEATURE });
    expect(proposal.outcome).toBe("produced");
  });
});
