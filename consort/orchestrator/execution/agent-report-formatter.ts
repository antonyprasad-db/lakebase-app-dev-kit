// agent-report-formatter: the record/log-phase seam that lets a sandboxed spawned agent
// satisfy the agent-log requirement without executing a subprocess.
//
// The split that makes this work under a subprocess-blocking spawn sandbox:
//   - AUTHORSHIP (the agent's): the agent writes .agent-report.json into its workspace , a
//     plain file write it CAN do , saying what it did + any warn/error it surfaced. It needs
//     NO schema knowledge; it just supplies { level?, event?, message } (or an array).
//   - CONFORMANCE (the orchestrator's): this formatter, run in the record/log phase on the
//     orchestrator side of the containment boundary (unsandboxed), reads that report, stamps
//     the timestamp + role, and appends CONFORMANT agent-log.jsonl entries , validating each
//     against agent-log-event.schema.json. Conformance is guaranteed BY CONSTRUCTION.
//
// Authorship is still real: an ABSENT or empty-message report FAILS (the agent surfaced
// nothing), so the "did the agent log what it did" signal is preserved, not rubber-stamped.

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { getValidator, formatSchemaErrors } from "../../../scripts/sftdd/schema-loader.js";

/** One raw entry the agent authors (no timestamp/role , the orchestrator stamps those). */
export interface AgentReportEntry {
  /** debug|info|warn|error. Default "info". */
  level?: string;
  /** Closed-vocabulary event name (agent-log-event.schema.json). Default "artifact.written". */
  event?: string;
  /** Required , the human-readable line the agent authored. Empty => a real failure. */
  message: string;
  /** Optional structured payload (feature_id, phase, ...). */
  metadata?: Record<string, unknown>;
}

export interface FormatAgentReportArgs {
  /** The workspace the agent wrote .agent-report.json into (also where agent-log.jsonl lands). */
  workspaceDir: string;
  /** The role the orchestrator stamps on every formatted entry (the agent never sets it). */
  role: string;
  /** The report filename within the workspace. Default ".agent-report.json". */
  reportFile?: string;
  /** The log filename within the workspace. Default "agent-log.jsonl". */
  logFile?: string;
}

export interface FormatAgentReportResult {
  ok: boolean;
  /** How many conformant entries were appended. */
  entries: number;
  /** Set when !ok , the reason (absent report / empty message / schema reject). */
  error?: string;
}

/**
 * Read the agent-authored report, format each raw entry into a conformant agent-log.jsonl
 * line (stamped timestamp + role), validate against the schema, and APPEND. Fail loud (write
 * nothing) when the report is absent, empty, or any entry is nonconformant , so a genuine
 * "the agent surfaced nothing" stays a failure the output validator will catch.
 */
export function formatAgentReport(args: FormatAgentReportArgs): FormatAgentReportResult {
  const reportPath = join(args.workspaceDir, args.reportFile ?? ".agent-report.json");
  const logPath = join(args.workspaceDir, args.logFile ?? "agent-log.jsonl");

  if (!existsSync(reportPath)) {
    return { ok: false, entries: 0, error: `agent report absent at ${reportPath} , the agent surfaced nothing about what it did.` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (e) {
    return { ok: false, entries: 0, error: `agent report is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  const rawEntries: unknown[] = Array.isArray(raw) ? raw : [raw];
  if (rawEntries.length === 0) {
    return { ok: false, entries: 0, error: "agent report is empty (no entries)." };
  }

  const validate = getValidator("agent-log-event.schema.json");
  const formatted: string[] = [];
  const now = new Date().toISOString();
  for (const [i, entry] of rawEntries.entries()) {
    const e = (entry ?? {}) as AgentReportEntry;
    if (typeof e.message !== "string" || e.message.trim().length === 0) {
      return { ok: false, entries: 0, error: `agent report entry ${i + 1} has an empty/missing message , the agent must author what it did.` };
    }
    // Orchestrator stamps timestamp + role; the agent's content fills the rest, with sane
    // defaults so the agent only has to supply a message in the common case.
    const obj: Record<string, unknown> = {
      timestamp: now,
      level: e.level ?? "info",
      role: args.role,
      event: e.event ?? "artifact.written",
      message: e.message,
      ...(e.metadata ? { metadata: e.metadata } : {}),
    };
    if (!validate(obj)) {
      return { ok: false, entries: 0, error: `agent report entry ${i + 1} is nonconformant: ${formatSchemaErrors(validate).join("; ")}` };
    }
    formatted.push(JSON.stringify(obj));
  }

  // Append (never clobber a prior log , e.g. an orchestrator phase.start line).
  const payload = formatted.join("\n") + "\n";
  if (existsSync(logPath)) appendFileSync(logPath, payload);
  else writeFileSync(logPath, payload);

  return { ok: true, entries: formatted.length };
}
