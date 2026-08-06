// makeStepReplayAgent: the SEEDLESS, action-driven corpus replay agent (Stage D of unifying
// dispatch). Given a scenario corpus's `turns/NNNN-<label>/` timeline (each turn a turn.json with
// {action, ...} + a files/ delta), it resolves the recorded turn matching the invocation's action
// and materializes that turn's files/ into the workspace, appending the recorded authoring log line.
// This is what lets a shipped `claude` manifest replay a whole corpus by swapping only the kind.
//
// Proves: a design turn materializes its .consort files (remapping the recorded .sftdd root);
// a build turn materializes its product-channel code; a RECURRING action resolves to the next
// recorded occurrence in corpus order (the cursor); a corpus MISS is a hard throw.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeStepReplayAgent, resetStepReplayCursor } from "../../consort/orchestrator/agents/mock-replay-agent";
import type { WorkflowAction } from "../../consort/orchestrator/workflow/workflow-vocabulary";
import type { AgentInvocation } from "../../consort/orchestrator/agents/agent-types";

let corpus: string;
let ws: string;

/** Write one recorded turn dir: turns/<label>/turn.json + files/<rel> tree. */
function recordTurn(label: string, action: WorkflowAction, files: Record<string, string>): void {
  const dir = join(corpus, "turns", label);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "turn.json"), JSON.stringify({ action, produced: Object.keys(files) }));
  for (const [rel, contents] of Object.entries(files)) {
    const p = join(dir, "files", rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, contents);
  }
}

function invoke(action: WorkflowAction): AgentInvocation {
  return { action, workspaceDir: ws, inputs: {}, instructions: { prompt: "p" } };
}

beforeEach(() => {
  corpus = mkdtempSync(join(tmpdir(), "step-replay-corpus-"));
  ws = mkdtempSync(join(tmpdir(), "step-replay-ws-"));
});
afterEach(() => {
  resetStepReplayCursor(corpus);
  rmSync(corpus, { recursive: true, force: true });
  rmSync(ws, { recursive: true, force: true });
});

describe("makeStepReplayAgent: materializes the recorded turn matching the action", () => {
  it("a design turn materializes its files/, remapping the recorded .sftdd root to .consort", async () => {
    const action: WorkflowAction = { kind: "invoke-role", role: "spec-author", story: "S1-file-stock" };
    recordTurn("0006-spec-author", action, {
      ".sftdd/features/F1/stories/S1-file-stock/acs/AC1.json": '{"id":"AC1"}',
    });
    const agent = makeStepReplayAgent({ corpusRoot: corpus });
    await agent.invoke(invoke(action));
    // Recorded under .sftdd/ but materialized under the LIVE artifact root .consort/.
    expect(existsSync(join(ws, ".consort/features/F1/stories/S1-file-stock/acs/AC1.json"))).toBe(true);
    expect(readFileSync(join(ws, ".consort/features/F1/stories/S1-file-stock/acs/AC1.json"), "utf8")).toBe('{"id":"AC1"}');
    // and it logged an authoring event stamped with the action's role (so log validators pass).
    const log = readFileSync(join(ws, "agent-log.jsonl"), "utf8");
    expect(log).toMatch(/"role":"spec-author"/);
  });

  it("a build turn materializes its product-channel files at the project root (no artifact-root prefix)", async () => {
    const action: WorkflowAction = { kind: "invoke-role", role: "driver", story: "S1-file-stock" };
    recordTurn("0016-driver", action, {
      "app/main.py": "print('hi')\n",
      ".sftdd/cycles/F1/S1-file-stock/AC1/green-failure.json": "{}",
    });
    const agent = makeStepReplayAgent({ corpusRoot: corpus });
    await agent.invoke(invoke(action));
    expect(readFileSync(join(ws, "app/main.py"), "utf8")).toBe("print('hi')\n"); // product channel, root-relative
    expect(existsSync(join(ws, ".consort/cycles/F1/S1-file-stock/AC1/green-failure.json"))).toBe(true); // meta remapped
  });

  it("a RECURRING action resolves to the NEXT recorded occurrence in corpus order (the cursor)", async () => {
    const action: WorkflowAction = { kind: "invoke-role", role: "spec-author", story: "S3-sku-detail-view" };
    recordTurn("0037-spec-author", action, { ".sftdd/marker.txt": "first" });
    recordTurn("0042-spec-author", action, { ".sftdd/marker.txt": "second" });
    const agent = makeStepReplayAgent({ corpusRoot: corpus });
    await agent.invoke(invoke(action));
    expect(readFileSync(join(ws, ".consort/marker.txt"), "utf8")).toBe("first");
    await agent.invoke(invoke(action));
    expect(readFileSync(join(ws, ".consort/marker.txt"), "utf8")).toBe("second"); // advanced to occurrence #2
  });

  it("a corpus MISS is a HARD throw (a replay must never fabricate a turn)", async () => {
    recordTurn("0006-spec-author", { kind: "invoke-role", role: "spec-author", story: "S1" }, { ".sftdd/x": "y" });
    const agent = makeStepReplayAgent({ corpusRoot: corpus });
    await expect(
      agent.invoke(invoke({ kind: "invoke-role", role: "dba", story: "S1" })),
    ).rejects.toThrow(/no recorded turn|cannot fabricate/i);
  });

  it("throws loud when the corpus has no turns/ timeline at all", async () => {
    rmSync(join(corpus, "turns"), { recursive: true, force: true });
    const agent = makeStepReplayAgent({ corpusRoot: corpus });
    await expect(agent.invoke(invoke({ kind: "invoke-role", role: "spec-author", story: "S1" }))).rejects.toThrow(/no turns\/ timeline/i);
  });
});
