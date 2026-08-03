// agent-report-formatter: the record/log-phase seam that lets a SANDBOXED spawned agent
// satisfy the agent-log requirement without executing a subprocess. The agent AUTHORS raw
// content (.agent-report.json: what it did + any warn/error it surfaced) , a plain file write
// it CAN do , and the ORCHESTRATOR formats that into conformant agent-log.jsonl entries
// (stamping timestamp + role, validating each vs agent-log-event.schema.json). Conformance is
// guaranteed BY CONSTRUCTION: the agent never touches the schema; the provided formatter owns
// it. Authorship stays the agent's (empty/absent report => a real, surfaced problem).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { formatAgentReport } from "../../consort/orchestrator/execution/agent-report-formatter";
import { getValidator } from "../../scripts/sftdd/schema-loader";

let ws: string;
beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "agent-report-"));
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

const validate = getValidator("agent-log-event.schema.json");

describe("formatAgentReport: agent-authored report -> conformant agent-log.jsonl", () => {
  it("formats a single-entry report into a conformant log line stamped with role + timestamp", () => {
    writeFileSync(join(ws, ".agent-report.json"), JSON.stringify({ level: "info", event: "artifact.written", message: "wrote feature-spec.json + 2 stories" }));
    const r = formatAgentReport({ workspaceDir: ws, role: "spec-author" });
    expect(r.ok).toBe(true);
    expect(r.entries).toBe(1);
    const lines = readFileSync(join(ws, "agent-log.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const obj = JSON.parse(lines[0]);
    expect(validate(obj)).toBe(true);           // conformant by construction
    expect(obj.role).toBe("spec-author");         // orchestrator stamped the role
    expect(typeof obj.timestamp).toBe("string");  // orchestrator stamped the timestamp
    expect(obj.message).toBe("wrote feature-spec.json + 2 stories"); // agent authored it
  });

  it("formats a MULTI-entry report (agent surfaced a warn alongside the write)", () => {
    writeFileSync(
      join(ws, ".agent-report.json"),
      JSON.stringify([
        { level: "info", event: "artifact.written", message: "wrote feature-spec.json" },
        { level: "warn", event: "open.question", message: "pagination strategy unresolved" },
      ]),
    );
    const r = formatAgentReport({ workspaceDir: ws, role: "spec-author" });
    expect(r.entries).toBe(2);
    const lines = readFileSync(join(ws, "agent-log.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(validate(JSON.parse(l))).toBe(true);
    // the warn the agent surfaced survived into the conformant log.
    expect(lines.some((l) => JSON.parse(l).level === "warn")).toBe(true);
  });

  it("defaults level=info + event=artifact.written when the agent omits them (message required)", () => {
    writeFileSync(join(ws, ".agent-report.json"), JSON.stringify({ message: "did the thing" }));
    const r = formatAgentReport({ workspaceDir: ws, role: "spec-author" });
    expect(r.ok).toBe(true);
    const obj = JSON.parse(readFileSync(join(ws, "agent-log.jsonl"), "utf8").trim());
    expect(obj.level).toBe("info");
    expect(obj.event).toBe("artifact.written");
  });

  it("FAILS (does not write a log) when the report is ABSENT , the agent surfaced nothing", () => {
    const r = formatAgentReport({ workspaceDir: ws, role: "spec-author" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/report|absent|nothing/i);
    expect(existsSync(join(ws, "agent-log.jsonl"))).toBe(false);
  });

  it("FAILS when a report entry has an empty message (no real authorship)", () => {
    writeFileSync(join(ws, ".agent-report.json"), JSON.stringify({ level: "info", event: "artifact.written", message: "" }));
    const r = formatAgentReport({ workspaceDir: ws, role: "spec-author" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/message/i);
  });

  it("FAILS when a report entry uses an off-vocabulary event (schema-rejected)", () => {
    writeFileSync(join(ws, ".agent-report.json"), JSON.stringify({ level: "info", event: "made-it-up", message: "x" }));
    const r = formatAgentReport({ workspaceDir: ws, role: "spec-author" });
    expect(r.ok).toBe(false);
  });

  it("appends to an existing agent-log.jsonl rather than clobbering it", () => {
    writeFileSync(join(ws, "agent-log.jsonl"), JSON.stringify({ timestamp: "2026-01-01T00:00:00Z", level: "info", role: "orchestrator", event: "phase.start", message: "prior" }) + "\n");
    writeFileSync(join(ws, ".agent-report.json"), JSON.stringify({ level: "info", event: "artifact.written", message: "new one" }));
    formatAgentReport({ workspaceDir: ws, role: "spec-author" });
    const lines = readFileSync(join(ws, "agent-log.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).message).toBe("prior");
    expect(JSON.parse(lines[1]).message).toBe("new one");
  });
});
