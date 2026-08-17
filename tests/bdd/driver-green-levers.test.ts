// driver-green-levers: proves the run-17-derived driver/green optimization levers are real, controllable,
// and flow through a dispatched turn. See consort/optimize/DRIVER-GREEN-LEVERS.md.
//
// Coverage:
//  1. driverGreenCandidates()          , the candidate set is well-formed (ids/levers).
//  2. buildContextPack ctx sections    , C1 (db-state) + C2 (failing-test) appear ONLY when enabled,
//                                          via BOTH the opt and the per-workspace marker; readers injected.
//  3. applyDriverLevers                , writes .claude/settings.json (deny E2 + guard hook E1) + the
//                                          ctx-levers marker, and returns the ctxPack env.
//  4. the single-test-guard hook       , executed as a real python3 subprocess: no-arg full suite -> DENY,
//                                          targeted `pytest <path>` / `run-tests.sh <path>` -> ALLOW.
//  5. LIVE dispatch (mock step executor), the real Step + driver-green manifest + a mock StepAgent: the
//                                          agent receives a prompt carrying the enabled ctx sections, and
//                                          the enforcement files are in the workspace it runs in.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { driverGreenCandidates } from "../../tests/optimization/role-levers";
import { applyDriverLevers, ctxPackEnv, SINGLE_TEST_GUARD_HOOK, assignWorktreePort, deployPortForIndex, BASE_DEPLOY_PORT } from "../../tests/optimization/driver-green-enforcement";
import { load } from "js-yaml";
import { buildContextPack } from "../../consort/orchestrator/build/build-context";
import { execute } from "../../consort/orchestrator/turns/step-executor";
import type { StepExecutorDeps, StepCtx } from "../../consort/orchestrator/turns/step-executor";
import { Step } from "../../consort/orchestrator/steps/step";
import { manifestForAction } from "../../consort/orchestrator/steps/manifest";
import type { StepAgent, AgentInvocation } from "../../consort/orchestrator/agents/agent-types";
import type { WorkflowAction, DriveState } from "../../consort/orchestrator/drive/orchestrator-drive";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dg-levers-"));
});
afterEach(() => {
  // best-effort cleanup
  try {
    require("fs").rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("driverGreenCandidates: the candidate set is well-formed", () => {
  it("baseline first, unique fs-safe ids, and each candidate carries exactly its lever", () => {
    const cs = driverGreenCandidates();
    expect(cs[0].id).toBe("baseline");
    expect(cs[0].levers).toEqual({});
    const ids = cs.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // unique
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/); // filesystem-safe

    const by = Object.fromEntries(cs.map((c) => [c.id, c.levers]));
    expect(by["single-test-guard"]).toEqual({ guardSuite: true });
    expect(by["deny-scan"].denyBash).toContain("Bash(ls:*)");
    expect(by["ctx-db"].ctxPack).toEqual(["db-state"]);
    expect(by["ctx-test"].ctxPack).toEqual(["failing-test"]);
    expect(by["enforce-all"]).toMatchObject({ guardSuite: true, ctxPack: ["db-state", "failing-test"] });
    expect(by["enforce-all"].denyBash?.length).toBeGreaterThan(0);
  });
});

describe("buildContextPack: ctx-db (C1) + ctx-test (C2) sections are OPT- and MARKER-gated", () => {
  const F = "F6-x";
  const S = "S2-drop-combined-code";
  const dbReader = () => ({ current: "20260811000000 (head)", heads: "20260811000002 (head)" });
  const testReader = () => "def test_column_dropped():\n    assert 'inventory_code' not in cols\n";

  function consortDir(): string {
    const d = join(root, ".consort");
    mkdirSync(d, { recursive: true });
    return d;
  }

  it("omits both sections by default (no opt, no marker, no env)", () => {
    const pack = buildContextPack(consortDir(), F, S, "", { dbStateReader: dbReader, failingTestReader: testReader });
    expect(pack).not.toMatch(/DB STATE/);
    expect(pack).not.toMatch(/FAILING TEST/);
  });

  it("includes ONLY the section enabled by opt (with injected readers)", () => {
    const cd = consortDir();
    const dbOnly = buildContextPack(cd, F, S, "", { dbState: true, dbStateReader: dbReader, failingTestReader: testReader });
    expect(dbOnly).toMatch(/DB STATE .*current=20260811000000/);
    expect(dbOnly).not.toMatch(/FAILING TEST/);

    const testOnly = buildContextPack(cd, F, S, "", { failingTest: true, dbStateReader: dbReader, failingTestReader: testReader });
    expect(testOnly).toMatch(/FAILING TEST/);
    expect(testOnly).toMatch(/inventory_code/);
    expect(testOnly).not.toMatch(/DB STATE/);
  });

  it("is driven by the per-workspace ctx-levers marker (the concurrency-safe sweep toggle)", () => {
    const cd = consortDir();
    writeFileSync(join(cd, "ctx-levers.json"), JSON.stringify({ dbState: true, failingTest: true }));
    const pack = buildContextPack(cd, F, S, "", { dbStateReader: dbReader, failingTestReader: testReader });
    expect(pack).toMatch(/DB STATE/);
    expect(pack).toMatch(/FAILING TEST/);
  });
});

describe("applyDriverLevers: writes the enforcement + context artifacts into the workspace", () => {
  it("deny-scan writes permissions.deny globs into .claude/settings.json", () => {
    const applied = applyDriverLevers(root, { denyBash: ["Bash(ls:*)", "Bash(find:*)"] });
    const s = JSON.parse(readFileSync(applied.settingsPath!, "utf8"));
    expect(s.permissions.deny).toEqual(expect.arrayContaining(["Bash(ls:*)", "Bash(find:*)"]));
  });

  it("single-test-guard writes the hook script + registers a PreToolUse Bash matcher", () => {
    const applied = applyDriverLevers(root, { guardSuite: true });
    expect(existsSync(applied.hookPath!)).toBe(true);
    const s = JSON.parse(readFileSync(applied.settingsPath!, "utf8"));
    const pre = s.hooks.PreToolUse;
    expect(pre.some((m: { matcher?: string; hooks: { command: string }[] }) => m.matcher === "Bash" && m.hooks.some((h) => h.command === applied.hookPath))).toBe(true);
  });

  it("ctxPack writes the marker (given a consortDir) AND returns the env patch", () => {
    const cd = join(root, ".consort");
    const applied = applyDriverLevers(root, { ctxPack: ["db-state", "failing-test"] }, cd);
    expect(applied.env).toEqual({ LAKEBASE_CONSORT_CTX_DBSTATE: "1", LAKEBASE_CONSORT_CTX_FAILINGTEST: "1" });
    expect(JSON.parse(readFileSync(applied.markerPath!, "utf8"))).toEqual({ dbState: true, failingTest: true });
  });

  it("ctxPackEnv is a pure enumeration", () => {
    expect(ctxPackEnv(["db-state"])).toEqual({ LAKEBASE_CONSORT_CTX_DBSTATE: "1" });
    expect(ctxPackEnv(undefined)).toEqual({});
  });
});

describe("per-candidate deploy port (concurrency safety): distinct ports + a consistent worktree rewrite", () => {
  const TARGETS =
    ["targets:", "  local:", "    type: local", "    run: make run", "    base_url: http://localhost:8000",
     "    health_path: /", "    verify: ./scripts/run-tests.sh",
     "  prod:", "    type: databricks-app", "    workspace_profile: x", ""].join("\n");

  it("deployPortForIndex assigns a distinct, deterministic port per candidate index", () => {
    expect(deployPortForIndex(0)).toBe(BASE_DEPLOY_PORT);
    const ports = [0, 1, 2, 3, 4, 5, 6].map(deployPortForIndex);
    expect(new Set(ports).size).toBe(ports.length); // all distinct , no two candidates share a port
    expect(deployPortForIndex(3)).toBe(BASE_DEPLOY_PORT + 3);
  });

  it("assignWorktreePort rewrites base_url AND the uvicorn run to the SAME port (they must agree)", () => {
    writeFileSync(join(root, "deploy-targets.yaml"), TARGETS);
    const url = assignWorktreePort(root, 8103);
    expect(url).toBe("http://localhost:8103");
    const doc = load(readFileSync(join(root, "deploy-targets.yaml"), "utf8")) as { targets: Record<string, { base_url?: string; run?: string; type?: string }> };
    expect(doc.targets.local.base_url).toBe("http://localhost:8103");
    expect(doc.targets.local.run).toMatch(/uvicorn app\.main:app .*--port 8103/);
    expect(doc.targets.local.run).toMatch(/uv run --env-file \.env/); // preserved the scaffold prefix
    // The prod target is untouched (only `local` is re-ported).
    expect(doc.targets.prod.type).toBe("databricks-app");
    expect(doc.targets.prod.base_url).toBeUndefined();
  });

  it("two candidates rewrite to DIFFERENT ports (the collision the fix removes)", () => {
    const a = join(root, "a");
    const b = join(root, "b");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    writeFileSync(join(a, "deploy-targets.yaml"), TARGETS);
    writeFileSync(join(b, "deploy-targets.yaml"), TARGETS);
    const urlA = assignWorktreePort(a, deployPortForIndex(0));
    const urlB = assignWorktreePort(b, deployPortForIndex(1));
    expect(urlA).not.toBe(urlB);
  });
});

describe("single-test-guard hook (E1): executed as a real subprocess, denies the full suite / allows targeted", () => {
  let hookPath: string;
  beforeEach(() => {
    hookPath = join(root, "guard.py");
    writeFileSync(hookPath, SINGLE_TEST_GUARD_HOOK);
  });
  // Run the hook with a Bash tool call on stdin; returns {denied, reason}.
  function runGuard(command: string): { denied: boolean; out: string } {
    const stdin = JSON.stringify({ tool_name: "Bash", tool_input: { command } });
    const out = execFileSync("python3", [hookPath], { input: stdin }).toString();
    return { denied: /"permissionDecision"\s*:\s*"deny"/.test(out), out };
  }

  it("DENIES a no-arg full-suite invocation", () => {
    expect(runGuard("./scripts/run-tests.sh").denied).toBe(true);
    expect(runGuard("make test").denied).toBe(true);
    expect(runGuard("npm test").denied).toBe(true);
    expect(runGuard("npm --prefix client run test").denied).toBe(true);
  });

  it("ALLOWS a targeted single test (the driver's legitimate inner loop)", () => {
    expect(runGuard("./scripts/run-tests.sh tests/step_defs/test_S2.py").denied).toBe(false);
    expect(runGuard("uv run --env-file .env pytest tests/step_defs/test_S2.py::scenario").denied).toBe(false);
    expect(runGuard("make migrate").denied).toBe(false); // migrations are not the suite
  });

  it("does not block an unparseable command (never fail-closed on our own parse error)", () => {
    const out = execFileSync("python3", [hookPath], { input: "not json" }).toString();
    expect(/"deny"/.test(out)).toBe(false);
  });
});

describe("LIVE dispatch (mock step executor): levers reach the driver turn", () => {
  it("the agent receives a prompt with the ctx sections, and runs in a workspace carrying the enforcement files", async () => {
    const consortDir = join(root, ".consort");
    mkdirSync(consortDir, { recursive: true });
    const featureId = "F6-x";
    const story = "S2-drop-combined-code";

    // Apply the enforce-all levers: writes .claude/settings.json (deny + guard hook) + the ctx marker.
    const applied = applyDriverLevers(
      root,
      { guardSuite: true, denyBash: ["Bash(ls:*)"], ctxPack: ["db-state", "failing-test"] },
      consortDir,
    );
    // Enforcement artifacts are present in the workspace the agent will run in.
    expect(existsSync(applied.hookPath!)).toBe(true);
    expect(JSON.parse(readFileSync(applied.settingsPath!, "utf8")).permissions.deny).toContain("Bash(ls:*)");

    // The prompt the orchestrator sources for the driver turn , the context pack, with the marker
    // (written by applyDriverLevers) turning the ctx sections on, readers injected for hermeticity.
    const prompt = buildContextPack(consortDir, featureId, story, "", {
      dbStateReader: () => ({ current: "20260811000000", heads: "20260811000002" }),
      failingTestReader: () => "def test_column_dropped():\n    assert True\n",
    });
    expect(prompt).toMatch(/DB STATE/);
    expect(prompt).toMatch(/FAILING TEST/);

    // A mock StepAgent (the SAME seam ClaudeStepAgent implements): capture what the turn receives,
    // and materialize the driver-green outputs (app/ source + agent-log) so the step validates.
    let seen: AgentInvocation | undefined;
    const agent: StepAgent = {
      async invoke(inv) {
        seen = inv;
        mkdirSync(join(inv.workspaceDir, "app"), { recursive: true });
        writeFileSync(join(inv.workspaceDir, "app", "main.py"), "def x():\n    return 1\n");
        writeFileSync(
          join(inv.workspaceDir, "agent-log.jsonl"),
          JSON.stringify({ timestamp: "2026-08-17T00:00:00Z", level: "info", role: "driver", event: "artifact.written", message: "wrote app" }) + "\n",
        );
      },
    };

    const action: WorkflowAction = { kind: "invoke-role", role: "driver", story } as WorkflowAction;
    const manifest = manifestForAction(action);
    expect(manifest).toBeTruthy();
    const step = new Step(manifest!, agent);

    const ctx: StepCtx = {
      action,
      cfg: { projectDir: root, consortDir, featureId } as StepCtx["cfg"],
      state: { phase: "feature" } as unknown as DriveState,
      validateBoundDeps: {
        allowed: () => ({ kind: "state-derived" }) as unknown as WorkflowAction,
        reviseBudgetAvailable: () => true,
        recordRetry: () => ({ sanctioned: true }),
      },
    };
    const deps: StepExecutorDeps = {
      resolveInputs: () => ({ "test-list": JSON.stringify({ tests: [] }) }),
      provisionWorkspace: () => ({ workspaceDir: root }),
      instructionsFor: () => ({ prompt }),
    };

    const result = await execute(step, ctx, deps);

    // The turn dispatched with the levered prompt, and produced without violations.
    expect(seen).toBeTruthy();
    expect(seen!.instructions.prompt).toBe(prompt);
    expect(seen!.instructions.prompt).toMatch(/DB STATE/);
    expect(seen!.instructions.prompt).toMatch(/FAILING TEST/);
    expect(seen!.workspaceDir).toBe(root);
    expect(existsSync(join(seen!.workspaceDir, ".claude", "settings.json"))).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
