#!/usr/bin/env node

// bin/consort/telemetry.cli.ts
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";

// consort/telemetry/allowlist.ts
var TELEMETRY_SCHEMA = "consort/v1";
var RESOURCE_ATTR_KEYS = [
  "schema",
  "install_id",
  "consort_version",
  "node_version",
  "os",
  "arch",
  "shell",
  "ci",
  "tty",
  "level"
];
var RUN_SPAN_FIELDS_L1 = [
  "trace_id",
  "span_id",
  "name",
  "start_ts",
  "end_ts",
  "duration_ms",
  "command",
  "outcome",
  "exit_code",
  "gates_total"
];
var RUN_SPAN_FIELDS_L2 = [
  // Repair & loop dynamics (counts).
  "red_green_cycles",
  "refactor_iterations",
  "revise_rounds",
  "selfheal_attempts",
  "hil_escalations",
  // Project shape (counts, not content), each suffixed `_count` so it reads as a
  // count and never collides with a `.consort` layout path segment. The gate COUNT
  // is already carried by the L1 `gates_total`, so it is not duplicated here.
  "feature_count",
  "story_count",
  "ac_count",
  "test_count",
  // Config/levers: whether the UX-adherence track is engaged (boolean).
  "ui_track"
];
var RUN_SPAN_FIELDS = [...RUN_SPAN_FIELDS_L1, ...RUN_SPAN_FIELDS_L2];
var GATE_SPAN_FIELDS_L1 = [
  "trace_id",
  "parent_span_id",
  "span_id",
  "name",
  "gate",
  "ordinal",
  "start_ts",
  "end_ts",
  "duration_ms",
  "outcome"
];
var GATE_SPAN_FIELDS_L2 = ["fail_class"];
var GATE_SPAN_FIELDS = [...GATE_SPAN_FIELDS_L1, ...GATE_SPAN_FIELDS_L2];
var ROLE_VALUES = [
  "spec-author",
  "architect-reviewer",
  "dba",
  "ux-designer",
  "test-strategist",
  "navigator",
  "driver",
  "product-owner"
];
var GATE_KINDS = [
  "invoke-role",
  "project-architect-notes",
  "surface-gate",
  "approve-gate",
  "design-complete",
  "approve-plan-gate",
  "planning-complete",
  "dispatch",
  "cut-experiment",
  "deploy-verify-heal",
  "await-acceptance",
  "accept",
  "complete",
  "feature-complete",
  "deploy",
  "approve-deploy-gate",
  "deploy-complete",
  "prepare-pr",
  "wait-ci",
  "approve-promote-gate",
  "merge",
  "raise-to-hil",
  "revise-route",
  "done"
];
var RESOURCE_KEY_SET = new Set(RESOURCE_ATTR_KEYS);
var GATE_KIND_SET = new Set(GATE_KINDS);
var ROLE_VALUE_SET = new Set(ROLE_VALUES);

// consort/telemetry/consent.ts
var inCi = (env) => {
  const v = (env.CI ?? "").trim();
  if (v === "") return false;
  return !/^(0|false)$/i.test(v);
};
var killed = (env) => (env.CONSORT_TELEMETRY ?? "").trim() === "0";
function shouldEmitTelemetry(inp) {
  if (killed(inp.env)) return false;
  if (inCi(inp.env)) return false;
  if (!inp.telemetryEnabled) return false;
  return true;
}

// consort/telemetry/spans.ts
import { randomBytes } from "crypto";

// consort/telemetry/emitter.ts
var DEFAULT_ENDPOINT = "https://consort-telemetry-ingest-v2.azurewebsites.net";
function endpointMode(env) {
  const endpoint = env.CONSORT_TELEMETRY_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
  const raw = (env.CONSORT_TELEMETRY_SIGNOFF ?? "").trim();
  const signedOff = raw === "" ? true : /^(1|true)$/i.test(raw);
  return { endpoint, signedOff, willPost: !!endpoint && signedOff };
}

// consort/config/kit-bin.ts
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// consort/telemetry/home-config.ts
import * as fs2 from "fs";
import * as os from "os";
import * as path2 from "path";
import { randomUUID } from "crypto";
var DEFAULT_TELEMETRY_ENABLED = true;
var DEFAULT_TELEMETRY_LEVEL = 1;
var UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var isUuidV4 = (s) => typeof s === "string" && UUID_V4.test(s);
function telemetryDebug(msg, err) {
  if (!process.env.CONSORT_TELEMETRY_DEBUG) return;
  const detail = err instanceof Error ? err.message : err !== void 0 ? String(err) : "";
  process.stderr.write(`[consort-telemetry] ${msg}${detail ? `: ${detail}` : ""}
`);
}
function telemetryConfigDir(deps = {}) {
  const env = deps.env ?? process.env;
  const xdg = env.XDG_CONFIG_HOME?.trim();
  const base = xdg && xdg.length > 0 ? xdg : path2.join(deps.homedir ?? os.homedir(), ".config");
  return path2.join(base, "consort");
}
function telemetryConfigFile(deps = {}) {
  return path2.join(telemetryConfigDir(deps), "telemetry.json");
}
function readStoredConfig(deps = {}) {
  let raw;
  try {
    raw = fs2.readFileSync(telemetryConfigFile(deps), "utf8");
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (!isUuidV4(data.install_id)) return null;
    const telemetry_enabled = typeof data.telemetry_enabled === "boolean" ? data.telemetry_enabled : DEFAULT_TELEMETRY_ENABLED;
    const telemetry_level = data.telemetry_level === 2 ? 2 : DEFAULT_TELEMETRY_LEVEL;
    const l2_opt_in_notified = data.l2_opt_in_notified === true;
    const acknowledged = data.acknowledged === true;
    return { install_id: data.install_id, telemetry_enabled, telemetry_level, l2_opt_in_notified, acknowledged };
  } catch {
    return null;
  }
}
function writeStoredConfig(cfg, deps = {}) {
  try {
    const dir = telemetryConfigDir(deps);
    fs2.mkdirSync(dir, { recursive: true });
    fs2.writeFileSync(telemetryConfigFile(deps), JSON.stringify(cfg, null, 2) + "\n", "utf8");
    return { cfg, persisted: true };
  } catch (err) {
    telemetryDebug("could not persist telemetry config (degrading to an ephemeral id for this run)", err);
    return { cfg, persisted: false };
  }
}
function ensureInstallId(deps = {}) {
  try {
    const existing = readStoredConfig(deps);
    if (existing) return existing.install_id;
    return writeStoredConfig({ install_id: randomUUID(), telemetry_enabled: DEFAULT_TELEMETRY_ENABLED }, deps).cfg.install_id;
  } catch (err) {
    telemetryDebug("ensureInstallId failed (using an ephemeral id for this run)", err);
    return randomUUID();
  }
}
function isTelemetryEnabled(deps = {}) {
  return (readStoredConfig(deps) ?? { telemetry_enabled: DEFAULT_TELEMETRY_ENABLED }).telemetry_enabled;
}
function updateStoredConfig(patch, deps = {}) {
  const existing = readStoredConfig(deps);
  const base = existing ?? {
    install_id: randomUUID(),
    telemetry_enabled: DEFAULT_TELEMETRY_ENABLED,
    telemetry_level: DEFAULT_TELEMETRY_LEVEL
  };
  return writeStoredConfig({ ...base, ...patch }, deps).cfg;
}
function setTelemetryEnabled(enabled, deps = {}) {
  return updateStoredConfig({ telemetry_enabled: enabled }, deps);
}
function setTelemetryLevel(level, deps = {}) {
  return updateStoredConfig({ telemetry_level: level }, deps);
}
function isTelemetryAcknowledged(deps = {}) {
  return readStoredConfig(deps)?.acknowledged === true;
}
function markTelemetryAcknowledged(deps = {}) {
  return updateStoredConfig({ acknowledged: true }, deps);
}
function resolveTelemetryLevel(deps = {}) {
  const env = deps.env ?? process.env;
  const raw = (env.CONSORT_TELEMETRY_LEVEL ?? "").trim();
  if (raw === "2") return 2;
  if (raw === "1") return 1;
  return readStoredConfig(deps)?.telemetry_level === 2 ? 2 : DEFAULT_TELEMETRY_LEVEL;
}

// consort/telemetry/resource.ts
function ciBool(env) {
  const v = (env.CI ?? "").trim();
  return v !== "" && !/^(0|false)$/i.test(v);
}

// bin/consort/telemetry.cli.ts
var HELP = `consort-telemetry , inspect + toggle Consort usage telemetry

Usage:
  consort-telemetry status [--json]     Show consent state, level, install id, endpoint
  consort-telemetry enable [--level N]  Persist telemetry_enabled = true (N = 1 or 2)
  consort-telemetry disable             Persist telemetry_enabled = false
  consort-telemetry ack [--json]        Record that you've been briefed + keep the
                                        current settings (stops the /consort:start
                                        briefing without changing consent)

Telemetry is PSEUDONYMOUS (a random per-install UUID, no PII) and OPT-OUT: by
default a normal interactive run reports to the Consort maintainers' endpoint ,
only allowlisted enums / counts / durations (no paths, code, or names). Opt out
any time with 'disable', CONSORT_TELEMETRY=0, or running non-interactively / in
CI; un-arm the endpoint entirely with CONSORT_TELEMETRY_SIGNOFF=0.

Level 2 is a SEPARATE, EXPLICIT opt-in (off by default) that captures more , per-
role turn timings + coarse repair/loop counts (still allowlisted, no free text).
Turn it on with 'enable --level 2' (or CONSORT_TELEMETRY_LEVEL=2); go back with
'enable --level 1'. See TELEMETRY.md.
`;
function parseLevelFlag(argv) {
  const eq = argv.find((a) => a.startsWith("--level="));
  let raw = eq ? eq.slice("--level=".length) : void 0;
  if (raw === void 0) {
    const i = argv.indexOf("--level");
    if (i >= 0) raw = argv[i + 1];
  }
  if (raw === "2") return 2;
  if (raw === "1") return 1;
  return void 0;
}
function buildStatus(deps) {
  const env = deps.env ?? process.env;
  const isTTY = deps.isTTY ?? !!process.stdout.isTTY;
  const telemetry_enabled = isTelemetryEnabled(deps);
  const install_id = ensureInstallId(deps);
  const mode = endpointMode(env);
  return {
    telemetry_enabled,
    install_id,
    will_emit_now: shouldEmitTelemetry({ telemetryEnabled: telemetry_enabled, env }),
    is_tty: isTTY,
    in_ci: ciBool(env),
    killed: (env.CONSORT_TELEMETRY ?? "").trim() === "0",
    endpoint_armed: mode.willPost,
    config_file: telemetryConfigFile(deps),
    schema: TELEMETRY_SCHEMA,
    level: resolveTelemetryLevel(deps),
    acknowledged: isTelemetryAcknowledged(deps)
  };
}
function renderStatus(s) {
  return `consort telemetry (schema ${s.schema}, level ${s.level})
  enabled (persisted): ${s.telemetry_enabled}
  will emit now:       ${s.will_emit_now}
    tty:               ${s.is_tty}
    in CI:             ${s.in_ci}
    CONSORT_TELEMETRY=0: ${s.killed}
  endpoint armed:      ${s.endpoint_armed} (opt-out, armed by default; CONSORT_TELEMETRY_SIGNOFF=0 to un-arm)
  install id:          ${s.install_id}
  acknowledged:        ${s.acknowledged} (false => /consort:start briefs the L1 opt-out + L2 opt-in)
  config file:         ${s.config_file}
`;
}
function runTelemetryCli(argv, deps = {}) {
  const out = deps.out ?? ((s) => process.stdout.write(s));
  const err = deps.err ?? ((s) => process.stderr.write(s));
  const cmd = argv[0];
  const json = argv.includes("--json");
  switch (cmd) {
    case "status": {
      const status = buildStatus(deps);
      out(json ? JSON.stringify(status, null, 2) + "\n" : renderStatus(status));
      return 0;
    }
    case "enable": {
      setTelemetryEnabled(true, deps);
      const requested = parseLevelFlag(argv);
      if (requested !== void 0) setTelemetryLevel(requested, deps);
      markTelemetryAcknowledged(deps);
      const level = resolveTelemetryLevel(deps);
      out(
        json ? JSON.stringify({ telemetry_enabled: true, level, acknowledged: true }, null, 2) + "\n" : `telemetry enabled (level ${level})
`
      );
      return 0;
    }
    case "disable": {
      const cfg = setTelemetryEnabled(false, deps);
      markTelemetryAcknowledged(deps);
      out(
        json ? JSON.stringify({ telemetry_enabled: cfg.telemetry_enabled, acknowledged: true }, null, 2) + "\n" : "telemetry disabled\n"
      );
      return 0;
    }
    case "ack": {
      markTelemetryAcknowledged(deps);
      const level = resolveTelemetryLevel(deps);
      const enabled = isTelemetryEnabled(deps);
      out(
        json ? JSON.stringify({ acknowledged: true, telemetry_enabled: enabled, level }, null, 2) + "\n" : `telemetry acknowledged (enabled ${enabled}, level ${level}) , kept as-is
`
      );
      return 0;
    }
    case "--help":
    case "-h":
    case void 0:
      out(HELP);
      return 0;
    default:
      err(`consort-telemetry: unknown command "${cmd}"

${HELP}`);
      return 2;
  }
}
if (isCliEntry(import.meta.url)) {
  process.exit(runTelemetryCli(process.argv.slice(2)));
}
export {
  runTelemetryCli
};
//# sourceMappingURL=telemetry.cli.js.map