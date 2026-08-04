// StepExecutor: the ONE standard step-execution process (Template Method). It runs a FIXED,
// no-exception 7-phase sequence for EVERY step:
//   1 resolve-inputs (fail loud, before any spawn)  2 provision-workspace
//   3 dispatch-agent (wait + monitor)  4 capture-outputs  5 validate-outputs (in-code
//   checkers)  6 record/log  7 route (validateAndBound)
// The phase ORDER + the fail-loud input gate + containment + validateAndBound authority are
// the orchestrator-owned invariant; the StepContract/manifest/registry fill the hooks. This
// slice drives it hermetically with a MOCK agent (via ManifestStep) + mock deps: assert the
// order, the fail-loud missing input (no spawn), a checker reject -> violations, and
// route -> BoundedRoute. The monitor is unit-tested separately (turn-monitor.test.ts).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execute } from "../../consort/orchestrator/execution/step-executor";
import type { StepExecutorDeps, StepCtx } from "../../consort/orchestrator/execution/step-executor";
import { ManifestStep } from "../../consort/orchestrator/steps/manifest-step";
import { manifestForAction } from "../../consort/orchestrator/manifest/step-manifest";
import type { StepAgent, AgentInvocation } from "../../consort/orchestrator/agents/agent-types";
import type { WorkflowAction, DriveState } from "../../scripts/sftdd/orchestrator-drive";
import type { ValidateBoundDeps } from "../../consort/orchestrator/contract/step-contract";

let root: string;
const BREAKDOWN: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };

const GOOD_SPEC = JSON.stringify({ id: "F1-x", name: "Feature X", status: "draft", tdd_mode: "N=1", stories: ["S1-a"] }) + "\n";
const GOOD_LOG = JSON.stringify({
  timestamp: "2026-08-03T12:00:00Z", level: "info", role: "spec-author",
  event: "artifact.written", message: "wrote feature-spec.json",
}) + "\n";

/** Records the phase-visible calls in order so the test can assert the Template Method. */
function harness(opts: { writeSpec?: boolean; writeLog?: boolean; badSpec?: boolean } = {}) {
  const order: string[] = [];
  const seen: AgentInvocation[] = [];

  const agent: StepAgent = {
    async invoke(invocation) {
      order.push("dispatch-agent");
      seen.push(invocation);
      if (opts.writeSpec !== false) {
        writeFileSync(join(invocation.workspaceDir, "feature-spec.json"), opts.badSpec
          ? JSON.stringify({ id: "F1-x", name: "Feature X", status: "draft", tdd_mode: "N=1", stories: [] })
          : GOOD_SPEC);
      }
      if (opts.writeLog !== false) {
        writeFileSync(join(invocation.workspaceDir, "agent-log.jsonl"), GOOD_LOG);
      }
    },
  };

  const step = new ManifestStep(manifestForAction(BREAKDOWN)!, agent);

  const validateBoundDeps: ValidateBoundDeps = {
    allowed: () => ({ kind: "design-complete" }) as WorkflowAction,
    reviseBudgetAvailable: () => true,
    recordRetry: () => ({ sanctioned: true }),
  };

  const ctx: StepCtx = {
    action: BREAKDOWN,
    cfg: { projectDir: root, sftddDir: join(root, ".sftdd"), featureId: "F1-x" } as StepCtx["cfg"],
    state: { phase: "feature" } as unknown as DriveState,
    validateBoundDeps,
  };

  const deps: StepExecutorDeps = {
    resolveInputs: vi.fn(() => {
      order.push("resolve-inputs");
      return {
        "product-overview": "# Overview\n",
        nfrs: "# NFRs\n",
        "feature-request": "# Request\n",
      };
    }),
    provisionWorkspace: vi.fn((_action) => {
      order.push("provision-workspace");
      return { workspaceDir: root, outputPaths: {} };
    }),
    instructionsFor: () => ({ prompt: "Break F1 into stories" }),
    onRecord: vi.fn(() => {
      order.push("record/log");
    }),
  };

  return { step, ctx, deps, order, seen };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "step-exec-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("StepExecutor: the fixed 7-phase Template Method", () => {
  it("runs the phases in the fixed order and returns a BoundedRoute on a clean produce", async () => {
    const { step, ctx, deps, order, seen } = harness();
    const result = await execute(step, ctx, deps);

    // Phase order is the invariant.
    expect(order).toEqual([
      "resolve-inputs",
      "provision-workspace",
      "dispatch-agent",
      "record/log",
    ]);
    // Contained dispatch: the agent got exactly the resolved inputs + workspace.
    expect(seen).toHaveLength(1);
    expect(seen[0].workspaceDir).toBe(root);
    expect(seen[0].inputs["product-overview"]).toBe("# Overview\n");

    // capture + validate passed => no violations, produced paths recorded, route bounded.
    expect(result.violations).toEqual([]);
    expect(result.producedPaths).toEqual([join(root, "feature-spec.json"), join(root, "agent-log.jsonl")]);
    expect(result.bounded.action).toEqual({ kind: "design-complete" });
  });

  it("FAILS LOUD in phase 1 when an input is missing , NO agent spawn, NO workspace provisioned", async () => {
    const { step, ctx, deps, order, seen } = harness();
    (deps.resolveInputs as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push("resolve-inputs");
      return { missing: "feature-request" };
    });

    await expect(execute(step, ctx, deps)).rejects.toThrow(/feature-request|missing input/i);
    // The gate is BEFORE provision + dispatch.
    expect(order).toEqual(["resolve-inputs"]);
    expect(seen).toHaveLength(0);
    expect(deps.provisionWorkspace).not.toHaveBeenCalled();
  });

  it("phase 5 (validate-outputs) HARD-REJECTS a nonconformant output with named violations, no agent follow-up", async () => {
    const { step, ctx, deps } = harness({ badSpec: true });
    const result = await execute(step, ctx, deps);
    expect(result.violations.join(" ")).toMatch(/stories/i);
    // A rejected output routes blocked (retry) , not a clean produce.
    expect(result.bounded.action).toEqual(BREAKDOWN); // blocked => re-issue the same step
    expect(result.bounded.sanctionedRetry).toBe(true);
  });

  it("phase 4/5: a missing produced artifact is a produce failure that routes blocked", async () => {
    const { step, ctx, deps } = harness({ writeSpec: false });
    const result = await execute(step, ctx, deps);
    expect(result.violations.join(" ")).toMatch(/feature-spec|not produced|missing/i);
    expect(result.bounded.action).toEqual(BREAKDOWN);
  });
});
