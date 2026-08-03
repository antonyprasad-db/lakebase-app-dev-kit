// LIVE validation of the FIRST concrete StepContract end to end (gated behind
// RUN_LIVE_STEP=1; not part of the normal suite).
//
//   RUN_LIVE_STEP=1 npx vitest run tests/live/spec-author-step-live.test.ts
//
// It exercises the whole contained design exactly as the orchestrator will drive it:
//   1. INPUTS: the orchestrator reads the 3 PO artifacts and PROVIDES their CONTENTS to
//      the step (the step never resolves .sftdd itself).
//   2. WORKSPACE: the orchestrator PROVISIONS a workspace. Two facts a live run surfaced:
//        (a) the spec-author agent def bakes a `.sftdd/features/<F>/` (cwd-relative) output
//            path, so the workspace must be .sftdd-shaped and the orchestrator DECLARES the
//            step's output path there (outputPaths);
//        (b) the agent runs its self-check + logs via the shared `./scripts/lk` kit scripts,
//            so the orchestrator must PROVIDE them , here by copying scripts/lk in + pointing
//            LAKEBASE_KIT_DIR at the kit (the dev override the shim honors). The prompt then
//            instructs the agent to use them. This is "provide the checker to the agent".
//   3. AGENT: a ClaudeStepAgent built from the levers (role/model/effort/session[+scope/
//      fallback/budget]) , everything to start + manage the agent. Injected into the step.
//   4. RUN + VALIDATE: the step runs the agent contained to the workspace; the orchestrator
//      then runs the output's OWN in-code conformance checker on the produced feature-spec.
//
// Local design turn only , no Lakebase, no GitHub.

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SpecAuthorBreakdownStep } from "../../scripts/sftdd/spec-author-breakdown-step.js";
import { ClaudeStepAgent, type AgentLevers } from "../../scripts/sftdd/claude-step-agent.js";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive.js";

const KIT = process.cwd();
const CORPUS = join(KIT, "examples/sftdd-scenarios/stockflow/recorded-artifacts");
const FEATURE = "F1-stock-visibility";
// The agent's baked, cwd-relative output layout , the orchestrator knows + declares it.
const SPEC_REL = `.sftdd/features/${FEATURE}/feature-spec.json`;
const LOG_REL = ".sftdd/agent-log.jsonl";

const BREAKDOWN: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };

describe.skipIf(!process.env.RUN_LIVE_STEP)("LIVE: SpecAuthorBreakdownStep produces a conformant feature-spec.json", () => {
  it("3 PO inputs + provided checker + a lever-built ClaudeStepAgent -> feature-spec.json that passes its in-code checker", async () => {
    // ── Orchestrator: provision an .sftdd-shaped workspace WITH the kit scripts provided ─
    const workspaceDir = mkdtempSync(join(tmpdir(), "live-step-ws-"));
    mkdirSync(join(workspaceDir, ".sftdd", "features", FEATURE), { recursive: true });
    // Provide the agent def so `--agent spec-author` resolves.
    mkdirSync(join(workspaceDir, ".claude", "agents"), { recursive: true });
    cpSync(join(KIT, "skills/consort/agents/spec-author.md"), join(workspaceDir, ".claude", "agents", "spec-author.md"));
    // PROVIDE the shared checker/log scripts to the agent: copy scripts/lk in + pin the kit
    // via the dev override the shim honors (LAKEBASE_KIT_DIR), so `./scripts/lk
    // lakebase-sftdd-response-formatter` + `lakebase-sftdd-log` resolve inside the workspace.
    mkdirSync(join(workspaceDir, "scripts"), { recursive: true });
    const standingProj = join(process.env.HOME ?? "", "code/tdd-workflow-smoke", (process.env.LIVE_STEP_PROJECT ?? ""));
    const lkSrc = existsSync(join(standingProj, "scripts/lk")) ? join(standingProj, "scripts/lk") : join(KIT, "examples/sftdd-scenarios/lk");
    if (existsSync(lkSrc)) {
      cpSync(lkSrc, join(workspaceDir, "scripts", "lk"));
      chmodSync(join(workspaceDir, "scripts", "lk"), 0o755);
    }
    process.env.LAKEBASE_KIT_DIR = KIT; // dev override: lk resolves kit bins from this checkout

    // ── Orchestrator: READ the 3 PO inputs and hand their CONTENTS to the step ───────
    const inputs: Record<string, string> = {
      "product-overview": existsSync(join(CORPUS, "product-overview.md"))
        ? readFileSync(join(CORPUS, "product-overview.md"), "utf8")
        : "# StockFlow\nAn inventory app: operators record stock by SKU + location and view current levels.\n",
      nfrs: existsSync(join(CORPUS, "nfrs.md"))
        ? readFileSync(join(CORPUS, "nfrs.md"), "utf8")
        : "# NFRs\n## Required\n- R1: existing stock rows survive every additive migration (durability).\n",
      "feature-request": readFileSync(join(CORPUS, "features", FEATURE, "feature-request.md"), "utf8"),
    };

    // ── The AGENT built from the LEVERS ──────────────────────────────────────────────
    const levers: AgentLevers = { role: "spec-author", model: "sonnet", effort: "low", session: "fresh" };
    const agent = new ClaudeStepAgent(levers);

    // ── The STEP: dumb + contained. Orchestrator DECLARES the output paths. ──────────
    const step = new SpecAuthorBreakdownStep(agent);
    const instructions = {
      // Orchestrator-sourced prompt, passed through. Names the agent's real deliverable
      // path + REQUIRES the shared self-check + log scripts the orchestrator provided.
      prompt:
        `Break feature ${FEATURE} down into its stories from the provided inputs. WRITE ` +
        `${SPEC_REL} (id, name, status "draft", tdd_mode, NON-EMPTY stories[]) + a stub dir per ` +
        `story under .sftdd/features/${FEATURE}/stories/<S>/ (story.md + story.json). Then run your ` +
        `self-check: ./scripts/lk lakebase-sftdd-response-formatter --role spec-author --feature ` +
        `${FEATURE} --tdd-dir .sftdd , and FIX anything it flags before returning. Then log what you ` +
        `did: ./scripts/lk lakebase-sftdd-log --role spec-author --level info --event artifact.written ` +
        `--message "<what you wrote>" --tdd-dir .sftdd (use --level warn to surface any ambiguity). ` +
        `Read ONLY the provided inputs.`,
      guidelines: [
        "feature-spec.json is REQUIRED and must have a non-empty stories[].",
        "On every story after the first, story.json must include an independence determination.",
        "The self-check must pass before you return; log at least one spec-author event.",
      ],
    };

    // RUN , contained. The orchestrator declares WHERE the outputs land.
    const result = await step.run({
      action: BREAKDOWN,
      workspaceDir,
      inputs,
      instructions,
      outputPaths: { "feature-spec": SPEC_REL, "agent-log": LOG_REL },
    });

    expect(result.produced, `step did not produce feature-spec.json; result: ${JSON.stringify(result)}`).toBe(true);
    const specPath = join(workspaceDir, SPEC_REL);
    expect(result.producedPaths).toContain(specPath);

    // ── ORCHESTRATOR VALIDATES via the output's OWN in-code checker ──────────────────
    const featureSpecOutput = step.outputs(BREAKDOWN).find((o) => o.id === "feature-spec")!;
    const check = featureSpecOutput.check(specPath);
    expect(check.ok, `feature-spec.json failed its in-code checker: ${check.violations.join("; ")}`).toBe(true);

    const spec = JSON.parse(readFileSync(specPath, "utf8")) as { stories?: string[] };
    expect(Array.isArray(spec.stories) && spec.stories.length >= 1).toBe(true);

    const proposal = step.route(BREAKDOWN, { state: { phase: "feature" } as never, feature: FEATURE });
    expect(proposal.outcome).toBe("produced");
  }, 300_000);
});
