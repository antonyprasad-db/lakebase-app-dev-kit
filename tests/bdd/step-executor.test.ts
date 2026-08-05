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
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "fs";
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

/** A step whose contract declares preconditions, for the PREPARE-PRECONDITIONS phase. */
function preconditionStep(pre: import("../../consort/orchestrator/contract/step-contract").StepPrecondition[]) {
  return {
    inputs: () => [],
    preconditions: () => pre,
    outputs: () => [],
    route: () => ({ outcome: "produced" as const, proposedNext: { kind: "design-complete" } as WorkflowAction }),
    async run() {
      return { produced: true, producedPaths: [] };
    },
  };
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

describe("phase 2.5 PREPARE-PRECONDITIONS: declared preconditions are prepared + appended before dispatch", () => {
  function ctxFor(): StepCtx {
    const validateBoundDeps: ValidateBoundDeps = {
      allowed: () => ({ kind: "design-complete" }) as WorkflowAction,
      reviseBudgetAvailable: () => true,
      recordRetry: () => ({ sanctioned: true }),
    };
    return {
      action: BREAKDOWN,
      cfg: { projectDir: root, sftddDir: join(root, ".sftdd"), featureId: "F1-x" } as StepCtx["cfg"],
      state: { phase: "feature" } as unknown as DriveState,
      validateBoundDeps,
    };
  }

  it("runs BETWEEN provision-workspace and dispatch-agent, and appends each prepared block to the prompt", async () => {
    const order: string[] = [];
    let dispatched = "";
    const step = {
      ...preconditionStep([{ id: "context-pack", kind: "context-pack", description: "the pack" }]),
      async run(provided: import("../../consort/orchestrator/steps/step-run-types").ProvidedStepRun) {
        order.push("dispatch-agent");
        dispatched = provided.instructions.prompt;
        return { produced: true, producedPaths: [] };
      },
    };
    const deps: StepExecutorDeps = {
      resolveInputs: () => { order.push("resolve-inputs"); return {}; },
      provisionWorkspace: () => { order.push("provision-workspace"); return { workspaceDir: root }; },
      instructionsFor: () => ({ prompt: "REVIEW story S1." }),
      prepare: (kind) => { order.push(`prepare:${kind}`); return " LAYOUT (place/judge code) :: service=app/services."; },
    };
    await execute(step, ctxFor(), deps);
    expect(order).toEqual(["resolve-inputs", "provision-workspace", "prepare:context-pack", "dispatch-agent"]);
    // The prepared block is appended to the instruction prompt the agent receives.
    expect(dispatched).toBe("REVIEW story S1. LAYOUT (place/judge code) :: service=app/services.");
  });

  it("WARNS (never fails) when a declared preparer yields empty , the 'always something' anomaly", async () => {
    const warnings: string[] = [];
    const step = preconditionStep([{ id: "context-pack", kind: "context-pack", description: "the pack" }]);
    const deps: StepExecutorDeps = {
      resolveInputs: () => ({}),
      provisionWorkspace: () => ({ workspaceDir: root }),
      instructionsFor: () => ({ prompt: "GREEN story S1." }),
      prepare: () => "", // preparer degraded to empty (e.g. conventions.json absent)
      onWarn: (w) => warnings.push(w),
    };
    const result = await execute(step, ctxFor(), deps);
    // The turn still runs (empty is a degrade, never a hard fail) but the anomaly is surfaced.
    expect(result.violations).toEqual([]);
    expect(warnings.some((w) => /context-pack/.test(w) && /empty/i.test(w))).toBe(true);
  });

  it("a step with NO declared preconditions never calls prepare + never warns (affirmative nothing)", async () => {
    let prepareCalls = 0;
    const warnings: string[] = [];
    const step = preconditionStep([]);
    const deps: StepExecutorDeps = {
      resolveInputs: () => ({}),
      provisionWorkspace: () => ({ workspaceDir: root }),
      instructionsFor: () => ({ prompt: "plain" }),
      prepare: () => { prepareCalls++; return "x"; },
      onWarn: (w) => warnings.push(w),
    };
    await execute(step, ctxFor(), deps);
    expect(prepareCalls).toBe(0);
    expect(warnings).toEqual([]);
  });

  it("is byte-identical when the executor has NO prepare dep (default track): preconditions ignored", async () => {
    // A declared precondition with no prepare dep wired is a no-op (the default executor
    // path, used by tests + the current manifest runner, stays unchanged).
    let dispatched = "";
    const step = {
      ...preconditionStep([{ id: "context-pack", kind: "context-pack", description: "x" }]),
      async run(provided: import("../../consort/orchestrator/steps/step-run-types").ProvidedStepRun) {
        dispatched = provided.instructions.prompt;
        return { produced: true, producedPaths: [] };
      },
    };
    const deps: StepExecutorDeps = {
      resolveInputs: () => ({}),
      provisionWorkspace: () => ({ workspaceDir: root }),
      instructionsFor: () => ({ prompt: "unchanged" }),
    };
    await execute(step, ctxFor(), deps);
    expect(dispatched).toBe("unchanged");
  });
});

describe("two-channel outputs: product resolves under workspaceDir, meta under metaDir", () => {
  const okValidate = () => ({ ok: true as const, violations: [] as string[] });
  const action: WorkflowAction = { kind: "invoke-role", role: "driver", story: "S1-x" } as WorkflowAction;

  function ctxFor(): StepCtx {
    return {
      action,
      cfg: { projectDir: root, sftddDir: join(root, ".sftdd"), featureId: "F1-x" } as StepCtx["cfg"],
      state: { phase: "feature" } as unknown as DriveState,
      validateBoundDeps: {
        allowed: () => ({ kind: "state-derived" }) as unknown as WorkflowAction,
        reviseBudgetAvailable: () => true,
        recordRetry: () => ({ sanctioned: true }),
      },
    };
  }

  /** A step declaring one product output + one meta output; run() writes each into the root
   *  the provided run resolves for its channel (product->workspaceDir, meta->metaDir??workspaceDir). */
  function channelStep() {
    const outputs = [
      { id: "code", description: "product artifact", filename: "code.txt", channel: "product" as const, validate: okValidate },
      { id: "marker", description: "meta artifact", filename: "marker.json", channel: "meta" as const, validate: okValidate },
    ];
    return {
      inputs: () => [],
      preconditions: () => [],
      outputs: () => outputs,
      route: () => ({ outcome: "produced" as const, proposedNext: { kind: "state-derived" } as unknown as WorkflowAction }),
      async run(provided: import("../../consort/orchestrator/steps/step-run-types").ProvidedStepRun) {
        const productRoot = provided.workspaceDir;
        const metaRoot = provided.metaDir ?? provided.workspaceDir;
        writeFileSync(join(productRoot, "code.txt"), "print('hi')\n");
        writeFileSync(join(metaRoot, "marker.json"), JSON.stringify({ superseded: [] }) + "\n");
        return { produced: true, producedPaths: [join(productRoot, "code.txt"), join(metaRoot, "marker.json")] };
      },
    };
  }

  it("validates a meta output under the provisioned metaDir (not the product workspace)", async () => {
    const metaDir = mkdtempSync(join(tmpdir(), "step-exec-meta-"));
    try {
      const deps: StepExecutorDeps = {
        resolveInputs: () => ({}),
        provisionWorkspace: () => ({ workspaceDir: root, metaDir }),
        instructionsFor: () => ({ prompt: "build S1" }),
      };
      const result = await execute(channelStep(), ctxFor(), deps);
      // Clean produce: the meta output was found + validated under metaDir, the product under workspaceDir.
      expect(result.violations).toEqual([]);
      // The product landed in the workspace, the marker in the contained meta zone , NOT the workspace.
      expect(existsSync(join(root, "code.txt"))).toBe(true);
      expect(existsSync(join(metaDir, "marker.json"))).toBe(true);
      expect(existsSync(join(root, "marker.json"))).toBe(false);
    } finally {
      rmSync(metaDir, { recursive: true, force: true });
    }
  });

  it("back-compat: with NO metaDir provisioned, a meta output falls back to workspaceDir", async () => {
    const deps: StepExecutorDeps = {
      resolveInputs: () => ({}),
      provisionWorkspace: () => ({ workspaceDir: root }), // no metaDir
      instructionsFor: () => ({ prompt: "build S1" }),
    };
    const result = await execute(channelStep(), ctxFor(), deps);
    // Both outputs resolved under the workspace (meta fell back), so the clean produce holds ,
    // byte-identical to the pre-channel behavior.
    expect(result.violations).toEqual([]);
    expect(existsSync(join(root, "code.txt"))).toBe(true);
    expect(existsSync(join(root, "marker.json"))).toBe(true);
  });

  it("flags a MISSING meta output at its metaDir location (channel is enforced, not cosmetic)", async () => {
    const metaDir = mkdtempSync(join(tmpdir(), "step-exec-meta-"));
    try {
      // A step that writes ONLY the product output, never the meta marker.
      const step = {
        ...channelStep(),
        async run(provided: import("../../consort/orchestrator/steps/step-run-types").ProvidedStepRun) {
          writeFileSync(join(provided.workspaceDir, "code.txt"), "print('hi')\n");
          return { produced: true, producedPaths: [join(provided.workspaceDir, "code.txt")] };
        },
      };
      const deps: StepExecutorDeps = {
        resolveInputs: () => ({}),
        provisionWorkspace: () => ({ workspaceDir: root, metaDir }),
        instructionsFor: () => ({ prompt: "build S1" }),
      };
      const result = await execute(step, ctxFor(), deps);
      // The meta output was declared but never appeared under metaDir => a named violation.
      expect(result.violations.join(" ")).toMatch(/marker/i);
    } finally {
      rmSync(metaDir, { recursive: true, force: true });
    }
  });
});
