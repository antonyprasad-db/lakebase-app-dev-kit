#!/usr/bin/env node

// node_modules/tsup/assets/esm_shims.js
import path from "path";
import { fileURLToPath } from "url";
var getFilename = () => fileURLToPath(import.meta.url);
var getDirname = () => path.dirname(getFilename());
var __dirname = /* @__PURE__ */ getDirname();

// bin/consort/spike.cli.ts
import * as path4 from "path";

// consort/config/consort-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
function resolveConsortDir(projectDir = process.cwd()) {
  const next = join(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = join(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}

// bin/consort/spike.cli.ts
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { readEnvVar } from "@databricks-solutions/lakebase-scm-utils/lakebase";

// consort/experiment/spike.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readdirSync as readdirSync2, readFileSync as readFileSync2, rmSync, statSync as statSync2, writeFileSync as writeFileSync2 } from "fs";
import { join as join2 } from "path";
import { createPairedBranch, deletePairedBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
function branchIdOf(info) {
  const leaf = info.name.split("/").pop();
  if (!leaf) throw new Error(`could not derive branch_id from ${info.name}`);
  return leaf;
}
function spikeNotes(spikeSlug, forFeature) {
  const frontmatter = forFeature ? `---
for_feature: ${forFeature}
---
` : "";
  const intro = forFeature ? `Throwaway spike for ${forFeature}.` : `Throwaway spike.`;
  return `${frontmatter}# ${spikeSlug}

${intro} Code is **not** promoted as-is. Capture the learning here before deleting the branch.
`;
}
async function cutSpike(args) {
  const { consortDir, projectDir, spikeSlug, branch, parentBranch, ttl, notes, ...lookup } = args;
  const paired = await createPairedBranch({
    instance: lookup.instance,
    branch,
    parentBranch,
    cwd: projectDir,
    createGitBranch: true,
    syncEnv: true,
    ...ttl ? { ttl } : { noExpiry: true }
  });
  const branchId = branchIdOf(paired.branch);
  const dir = join2(consortDir, "spikes", spikeSlug);
  mkdirSync2(dir, { recursive: true });
  writeFileSync2(join2(dir, "branch.txt"), branchId);
  writeFileSync2(
    join2(dir, "notes.md"),
    notes ?? `# ${spikeSlug}

Throwaway spike. Code is **not** promoted as-is. Capture learning before deleting the branch.
`
  );
  return {
    spike_slug: spikeSlug,
    branch_id: branchId,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    dir
  };
}
function listSpikes(consortDir) {
  const root = join2(consortDir, "spikes");
  if (!existsSync2(root)) return [];
  const out = [];
  for (const slug of readdirSync2(root)) {
    const dir = join2(root, slug);
    if (!statSync2(dir).isDirectory()) continue;
    const branchFile = join2(dir, "branch.txt");
    if (!existsSync2(branchFile)) continue;
    out.push({
      spike_slug: slug,
      branch_id: readFileSync2(branchFile, "utf8").trim(),
      created_at: statSync2(branchFile).birthtime.toISOString(),
      dir
    });
  }
  return out;
}
async function deleteSpike(args) {
  const { consortDir, projectDir, spikeSlug, deleteBranchToo = true, purgeNotes = false, ...lookup } = args;
  const dir = join2(consortDir, "spikes", spikeSlug);
  if (!existsSync2(dir)) throw new Error(`spike ${spikeSlug} not found at ${dir}`);
  if (deleteBranchToo) {
    const branchId = readFileSync2(join2(dir, "branch.txt"), "utf8").trim();
    await deletePairedBranch({ instance: lookup.instance, branch: branchId, cwd: projectDir });
  }
  if (purgeNotes) rmSync(dir, { recursive: true, force: true });
}

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
var TURN_SPAN_FIELDS = [
  "trace_id",
  "parent_span_id",
  "span_id",
  "name",
  "role",
  "model",
  "effort",
  "duration_ms",
  "retry_count",
  "token_bucket"
];
var OS_VALUES = ["darwin", "linux", "win32", "other"];
var ARCH_VALUES = ["arm64", "x64", "other"];
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
var RUN_SPAN_NAME = "consort.run";
var GATE_SPAN_NAME = "consort.gate";
var TURN_SPAN_NAME = "consort.turn";
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
var isKnownGateKind = (k) => GATE_KIND_SET.has(k);
var ROLE_VALUE_SET = new Set(ROLE_VALUES);
var isKnownRole = (r) => ROLE_VALUE_SET.has(r);
function pickAllowed(obj, allowed) {
  const set = new Set(allowed);
  const src = obj;
  const out = {};
  for (const k of Object.keys(src)) {
    if (set.has(k)) out[k] = src[k];
  }
  return out;
}

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

// consort/telemetry/emitter.ts
import { spawn } from "child_process";
import { writeFileSync as writeFileSync3 } from "fs";
import { tmpdir } from "os";
import { join as join4 } from "path";
import { randomUUID } from "crypto";

// consort/telemetry/spans.ts
import { randomBytes } from "crypto";
var newTraceId = () => randomBytes(16).toString("hex");
var newSpanId = () => randomBytes(8).toString("hex");
var sanitizeRunSpan = (s) => pickAllowed(s, RUN_SPAN_FIELDS);
var sanitizeGateSpan = (s) => pickAllowed(s, GATE_SPAN_FIELDS);
var sanitizeTurnSpan = (s) => pickAllowed(s, TURN_SPAN_FIELDS);
var isRunSpan = (s) => s.name === RUN_SPAN_NAME;
var isTurnSpan = (s) => s.name === TURN_SPAN_NAME;
var sanitizeSpan = (s) => isRunSpan(s) ? sanitizeRunSpan(s) : isTurnSpan(s) ? sanitizeTurnSpan(s) : sanitizeGateSpan(s);

// consort/config/kit-bin.ts
import { spawnSync } from "child_process";
import * as fs2 from "fs";
import * as path2 from "path";
var kitRootCache;
function resolveKitRoot() {
  if (kitRootCache !== void 0) return kitRootCache;
  const env = process.env.LAKEBASE_KIT_DIR?.trim();
  kitRootCache = env && fs2.existsSync(path2.join(env, "package.json")) ? env : path2.resolve(__dirname, "..", "..", "..");
  return kitRootCache;
}
var SUBSTRATE_PKG = "@databricks-solutions/lakebase-scm-utils";
var kitBinMap = null;
var substrateRoot;
var substrateBinMap = null;
function resolveSubstrateRoot() {
  if (substrateRoot !== void 0) return substrateRoot;
  let dir = resolveKitRoot();
  for (; ; ) {
    const cand = path2.join(dir, "node_modules", SUBSTRATE_PKG);
    if (fs2.existsSync(path2.join(cand, "package.json"))) {
      substrateRoot = cand;
      return cand;
    }
    const parent = path2.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  substrateRoot = null;
  return null;
}
function resolveKitBinJs(bin) {
  if (kitBinMap === null) {
    try {
      const pkg = JSON.parse(fs2.readFileSync(path2.join(resolveKitRoot(), "package.json"), "utf8"));
      kitBinMap = pkg.bin ?? {};
    } catch {
      kitBinMap = {};
    }
  }
  const rel = kitBinMap[bin];
  if (rel) return path2.join(resolveKitRoot(), rel);
  const subRoot = resolveSubstrateRoot();
  if (subRoot) {
    if (substrateBinMap === null) {
      try {
        const pkg = JSON.parse(fs2.readFileSync(path2.join(subRoot, "package.json"), "utf8"));
        substrateBinMap = pkg.bin ?? {};
      } catch {
        substrateBinMap = {};
      }
    }
    const subRel = substrateBinMap[bin];
    if (subRel) return path2.join(subRoot, subRel);
  }
  return null;
}
function kitVersion() {
  try {
    const pkg = JSON.parse(fs2.readFileSync(path2.join(resolveKitRoot(), "package.json"), "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

// consort/telemetry/emitter.ts
var DEFAULT_QUEUE_CAP = 200;
var DEFAULT_TIMEOUT_MS = 500;
var noopSink = { deliver() {
} };
function httpSink(opts) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    deliver(payload) {
      try {
        const body = payload.spans.map((s) => JSON.stringify(wireLine(s, payload))).join("\n") + "\n";
        const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeoutMs) : void 0;
        const headers = { "content-type": "application/x-ndjson" };
        if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
        return Promise.resolve(
          doFetch(`${opts.endpoint.replace(/\/$/, "")}/v1/traces`, {
            method: "POST",
            headers,
            body,
            ...signal ? { signal } : {}
          })
        ).then(
          () => {
          },
          (err) => opts.onError?.(err)
        );
      } catch (err) {
        opts.onError?.(err);
      }
    }
  };
}
function wireLine(span, payload) {
  const clean = sanitizeSpan(span);
  return isRunSpan(span) ? { schema: payload.schema, ...clean, resource: payload.resource } : { schema: payload.schema, ...clean };
}
var DEFAULT_ENDPOINT = "https://consort-telemetry-ingest-v2.azurewebsites.net";
function endpointMode(env) {
  const endpoint = env.CONSORT_TELEMETRY_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
  const raw = (env.CONSORT_TELEMETRY_SIGNOFF ?? "").trim();
  const signedOff = raw === "" ? true : /^(1|true)$/i.test(raw);
  return { endpoint, signedOff, willPost: !!endpoint && signedOff };
}
function detachedHttpSink(opts) {
  const spawnImpl = opts.spawnFn ?? spawn;
  const dir = opts.tmpDir ?? tmpdir();
  const url = `${opts.endpoint.replace(/\/$/, "")}/v1/traces`;
  return {
    deliver(payload) {
      try {
        const body = payload.spans.map((s) => JSON.stringify(wireLine(s, payload))).join("\n") + "\n";
        const file = join4(dir, `consort-telemetry-${randomUUID()}.ndjson`);
        writeFileSync3(file, body);
        const child = spawnImpl(process.execPath, [opts.senderJs, file, url, opts.token ?? ""], {
          detached: true,
          stdio: "ignore"
        });
        child.unref();
      } catch {
      }
    }
  };
}
function resolveSink(env) {
  const mode = endpointMode(env);
  if (!mode.willPost) return noopSink;
  const token = env.CONSORT_TELEMETRY_TOKEN?.trim() || void 0;
  try {
    const senderJs = resolveKitBinJs("consort-telemetry-send");
    if (senderJs) return detachedHttpSink({ endpoint: mode.endpoint, token, senderJs });
  } catch {
  }
  return httpSink({ endpoint: mode.endpoint, token });
}
var TelemetryEmitter = class {
  queue = [];
  sink;
  resource;
  cap;
  /** Promises for deliveries kicked off by flush(), so flushAndWait() can bound-await
   *  them at shutdown (the fix for the drive-exit race that dropped every POST). */
  inflight = [];
  constructor(opts) {
    this.sink = opts.sink;
    this.resource = opts.resource;
    this.cap = opts.queueCap ?? DEFAULT_QUEUE_CAP;
  }
  /** Number of spans currently queued (diagnostic; tests assert the cap). */
  get queued() {
    return this.queue.length;
  }
  /** Append a span, dropping the OLDEST if the queue is at cap. Sanitizes first,
   *  so a non-allowlisted field never reaches the queue. Never throws. */
  enqueue(span) {
    try {
      const clean = sanitizeSpan(span);
      if (this.queue.length >= this.cap) this.queue.shift();
      this.queue.push(clean);
    } catch {
    }
  }
  /** Drain the queue into one payload and deliver it fire-and-forget. Swallows
   *  all errors. A no-op / empty queue returns immediately. */
  flush() {
    if (this.queue.length === 0) return;
    const spans = this.queue.splice(0);
    try {
      const p = this.sink.deliver({ schema: this.resource.schema, resource: this.resource, spans });
      if (p && typeof p.then === "function") {
        this.inflight.push(p.then(() => {
        }, () => {
        }));
      }
    } catch {
    }
  }
  /** Drain the queue AND bound-await the in-flight deliveries, up to `timeoutMs`.
   *  Call this ONCE at process shutdown (after finish()) so the final POST is not
   *  abandoned when the CLI calls process.exit() , the drive-exit race that silently
   *  dropped every run's telemetry. Never throws, never waits longer than the bound;
   *  a slow/cold endpoint is capped, not blocking. A no-op sink resolves at once. */
  async flushAndWait(timeoutMs) {
    try {
      this.flush();
      if (this.inflight.length === 0) return;
      const pending = Promise.allSettled(this.inflight.splice(0));
      let timer;
      const capped = new Promise((resolve2) => {
        timer = setTimeout(resolve2, Math.max(0, timeoutMs));
      });
      await Promise.race([pending.then(() => void 0), capped]);
      if (timer) clearTimeout(timer);
    } catch {
    }
  }
};

// consort/telemetry/home-config.ts
import * as fs3 from "fs";
import * as os from "os";
import * as path3 from "path";
import { randomUUID as randomUUID2 } from "crypto";
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
  const base = xdg && xdg.length > 0 ? xdg : path3.join(deps.homedir ?? os.homedir(), ".config");
  return path3.join(base, "consort");
}
function telemetryConfigFile(deps = {}) {
  return path3.join(telemetryConfigDir(deps), "telemetry.json");
}
function readStoredConfig(deps = {}) {
  let raw;
  try {
    raw = fs3.readFileSync(telemetryConfigFile(deps), "utf8");
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
    fs3.mkdirSync(dir, { recursive: true });
    fs3.writeFileSync(telemetryConfigFile(deps), JSON.stringify(cfg, null, 2) + "\n", "utf8");
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
    return writeStoredConfig({ install_id: randomUUID2(), telemetry_enabled: DEFAULT_TELEMETRY_ENABLED }, deps).cfg.install_id;
  } catch (err) {
    telemetryDebug("ensureInstallId failed (using an ephemeral id for this run)", err);
    return randomUUID2();
  }
}
function isTelemetryEnabled(deps = {}) {
  return (readStoredConfig(deps) ?? { telemetry_enabled: DEFAULT_TELEMETRY_ENABLED }).telemetry_enabled;
}
function isFirstRun(deps = {}) {
  return readStoredConfig(deps) === null;
}
function updateStoredConfig(patch, deps = {}) {
  const existing = readStoredConfig(deps);
  const base = existing ?? {
    install_id: randomUUID2(),
    telemetry_enabled: DEFAULT_TELEMETRY_ENABLED,
    telemetry_level: DEFAULT_TELEMETRY_LEVEL
  };
  return writeStoredConfig({ ...base, ...patch }, deps).cfg;
}
function resolveTelemetryLevel(deps = {}) {
  const env = deps.env ?? process.env;
  const raw = (env.CONSORT_TELEMETRY_LEVEL ?? "").trim();
  if (raw === "2") return 2;
  if (raw === "1") return 1;
  return readStoredConfig(deps)?.telemetry_level === 2 ? 2 : DEFAULT_TELEMETRY_LEVEL;
}
function isL2NoticeSeen(deps = {}) {
  return readStoredConfig(deps)?.l2_opt_in_notified === true;
}
function markL2NoticeSeen(deps = {}) {
  updateStoredConfig({ l2_opt_in_notified: true }, deps);
}

// consort/telemetry/resource.ts
function normalizeOs(platform) {
  return OS_VALUES.includes(platform) ? platform : "other";
}
function normalizeArch(arch) {
  return ARCH_VALUES.includes(arch) ? arch : "other";
}
function normalizeShell(env) {
  const shellPath = (env.SHELL ?? "").trim();
  const base = shellPath.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (base === "zsh" || base === "bash" || base === "fish") return base;
  if (base === "pwsh" || base === "powershell") return "powershell";
  if (env.PSModulePath && !env.SHELL) return "powershell";
  return "unknown";
}
function ciBool(env) {
  const v = (env.CI ?? "").trim();
  return v !== "" && !/^(0|false)$/i.test(v);
}
function buildResourceAttrs(deps = {}) {
  const env = deps.env ?? process.env;
  return {
    schema: TELEMETRY_SCHEMA,
    install_id: ensureInstallId(deps),
    consort_version: deps.version ?? kitVersion(),
    node_version: process.versions.node,
    os: normalizeOs(deps.platform ?? process.platform),
    arch: normalizeArch(deps.arch ?? process.arch),
    shell: normalizeShell(env),
    ci: ciBool(env),
    tty: deps.isTTY ?? !!process.stdout.isTTY,
    level: deps.level ?? resolveTelemetryLevel(deps)
  };
}

// consort/telemetry/with-telemetry.ts
var FIRST_RUN_NOTICE = "[consort] Anonymous* usage telemetry is on (*pseudonymous: a random per-install id, no PII).\n          Each run of Consort reports to the maintainers' endpoint; only allowlisted,\n          non-sensitive fields are sent (no paths, code, error text, or names).\n          Help the maintainers more , opt in to Level 2: `consort-telemetry enable --level 2`\n          adds per-role timings + coarse failure classes (still no code/paths/names), so they\n          can find and fix what makes runs slow or fail. It's off by default; this is the ask.\n          Turn telemetry off any time: `consort-telemetry disable` (or CONSORT_TELEMETRY=0).\n          Details: TELEMETRY.md.\n";
var L2_OPT_IN_NOTICE = "[consort] Level-2 usage telemetry is ON (you opted in).\n          On top of Level 1, it reports per-role turn timings and coarse\n          repair/loop counts , still only allowlisted enums, counts, and\n          durations (no prompts, code, paths, error text, or names).\n          Back to Level 1 any time: `consort-telemetry enable --level 1`.\n          Details: TELEMETRY.md.\n";
var NOOP_RUN = {
  enabled: false,
  traceId: void 0,
  wrap: (inner) => inner,
  finish: () => {
  }
};
function gateOutcome(action, threw) {
  if (action.kind === "raise-to-hil") return "abort";
  return threw ? "fail" : "pass";
}
function beginTelemetryRun(deps) {
  try {
    return beginTelemetryRunUnsafe(deps);
  } catch (err) {
    telemetryDebug("beginTelemetryRun failed; telemetry disabled for this run", err);
    return NOOP_RUN;
  }
}
function beginTelemetryRunUnsafe(deps) {
  const env = deps.env ?? process.env;
  const isTTY = deps.isTTY ?? !!process.stdout.isTTY;
  const enabledFlag = deps.telemetryEnabled ?? isTelemetryEnabled(deps);
  if (!shouldEmitTelemetry({ telemetryEnabled: enabledFlag, env })) return NOOP_RUN;
  const now = deps.now ?? Date.now;
  const level = deps.level ?? resolveTelemetryLevel(deps);
  const l2 = level === 2;
  if (deps.onNotice && isFirstRun(deps)) deps.onNotice(FIRST_RUN_NOTICE);
  if (deps.onNotice && l2 && !isL2NoticeSeen(deps)) {
    deps.onNotice(L2_OPT_IN_NOTICE);
    markL2NoticeSeen(deps);
  }
  const resource = buildResourceAttrs({ ...deps, isTTY, level });
  const sink = deps.sink ?? resolveSink(env);
  const emitter = new TelemetryEmitter({ sink, resource });
  const traceId = newTraceId();
  const rootSpanId = newSpanId();
  const rootStart = now();
  let gates = 0;
  let finished = false;
  const l2Counts = {
    red_green_cycles: 0,
    refactor_iterations: 0,
    revise_rounds: 0,
    selfheal_attempts: 0,
    hil_escalations: 0
  };
  let lastState;
  const tallyL2 = (action) => {
    switch (action.kind) {
      case "raise-to-hil":
        l2Counts.hil_escalations += 1;
        break;
      case "revise-route":
        l2Counts.revise_rounds += 1;
        break;
      case "invoke-role": {
        const bm = "buildMode" in action ? action.buildMode : void 0;
        if (bm && bm.startsWith("refactor")) l2Counts.refactor_iterations += 1;
        else if (bm && (bm.startsWith("assess") || bm === "repair")) l2Counts.selfheal_attempts += 1;
        else if (action.role === "driver" && bm === void 0) l2Counts.red_green_cycles += 1;
        break;
      }
      case "deploy-verify-heal":
        if (action.mode.startsWith("refactor")) l2Counts.refactor_iterations += 1;
        else l2Counts.selfheal_attempts += 1;
        break;
    }
  };
  const recordChild = (action, ordinal, start, threw) => {
    if (action.kind === "done") return;
    if (!isKnownGateKind(action.kind)) return;
    const end = now();
    const span = {
      trace_id: traceId,
      parent_span_id: rootSpanId,
      span_id: newSpanId(),
      name: GATE_SPAN_NAME,
      gate: action.kind,
      ordinal,
      start_ts: start,
      end_ts: end,
      duration_ms: end - start,
      outcome: gateOutcome(action, threw)
    };
    emitter.enqueue(span);
    gates += 1;
    if (l2) {
      tallyL2(action);
      if (action.kind === "invoke-role" && isKnownRole(action.role)) {
        const turn = {
          trace_id: traceId,
          parent_span_id: rootSpanId,
          span_id: newSpanId(),
          name: TURN_SPAN_NAME,
          role: action.role,
          duration_ms: end - start
        };
        emitter.enqueue(turn);
      }
    }
  };
  const wrap = (inner) => {
    let pendingOrdinal = 0;
    return {
      // Tap the readState seam to capture the last state the driver observed, so
      // finish() can record coarse L2 project shape without its own async read.
      readState: async () => {
        const s = await inner.readState();
        lastState = s;
        return s;
      },
      onAction: (action, i) => {
        pendingOrdinal = i;
        inner.onAction?.(action, i);
      },
      // Forward every optional seam UNCHANGED (mirrors the recording decorators),
      // so telemetry composition never disables routing / correspondence / etc.
      onRoutingDecision: inner.onRoutingDecision ? (a, s, i, src) => inner.onRoutingDecision(a, s, i, src) : void 0,
      onCorrespondence: inner.onCorrespondence ? (a, s, i) => inner.onCorrespondence(a, s, i) : void 0,
      onHandback: inner.onHandback ? (h, d) => inner.onHandback(h, d) : void 0,
      assertRouteSatisfiable: inner.assertRouteSatisfiable ? (a, s) => inner.assertRouteSatisfiable(a, s) : void 0,
      // Executor-dispatched agent turns run THROUGH performViaExecutor (the driver
      // does NOT then call perform), so a child span is timed here , but ONLY when
      // the inner returns a DEFINED bounded route, i.e. the action was actually
      // handled by the executor. When it returns `undefined` the action was NOT
      // executor-dispatched: the driver falls through to `perform`, whose wrapper
      // records the span, so recording here too would DOUBLE-COUNT every non-
      // executor action (the common case: gates, cut-experiment, deploy, merge, ...).
      // On a throw we still record (fail), since no fall-through perform will run.
      performViaExecutor: inner.performViaExecutor ? async (action, state, routerDeps) => {
        const start = now();
        try {
          const r = await inner.performViaExecutor(action, state, routerDeps);
          if (r !== void 0) recordChild(action, pendingOrdinal, start, false);
          return r;
        } catch (err) {
          recordChild(action, pendingOrdinal, start, true);
          throw err;
        }
      } : void 0,
      async perform(action) {
        const start = now();
        try {
          await inner.perform(action);
          recordChild(action, pendingOrdinal, start, false);
        } catch (err) {
          recordChild(action, pendingOrdinal, start, true);
          throw err;
        }
      }
    };
  };
  const finish = (info) => {
    if (finished) return;
    finished = true;
    const end = now();
    const root = {
      trace_id: traceId,
      span_id: rootSpanId,
      name: RUN_SPAN_NAME,
      start_ts: rootStart,
      end_ts: end,
      duration_ms: end - rootStart,
      command: deps.command,
      outcome: info.outcome,
      exit_code: info.exit_code,
      gates_total: gates
    };
    if (l2) {
      root.red_green_cycles = l2Counts.red_green_cycles;
      root.refactor_iterations = l2Counts.refactor_iterations;
      root.revise_rounds = l2Counts.revise_rounds;
      root.selfheal_attempts = l2Counts.selfheal_attempts;
      root.hil_escalations = l2Counts.hil_escalations;
      if (lastState) {
        if (typeof lastState.uiTrack === "boolean") root.ui_track = lastState.uiTrack;
        if (Array.isArray(lastState.storyOrder)) root.story_count = lastState.storyOrder.length;
      }
    }
    emitter.enqueue(root);
    emitter.flush();
  };
  if (deps.registerExitFlush !== false) {
    process.once("beforeExit", () => {
      if (!finished) emitter.flush();
    });
  }
  return { enabled: true, traceId, wrap, finish };
}

// bin/consort/spike.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--slug":
        out.slug = argv[++i];
        break;
      case "--for":
        out.forFeature = argv[++i];
        break;
      case "--parent":
        out.parent = argv[++i];
        break;
      case "--ttl":
        out.ttl = argv[++i];
        break;
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--host":
        out.host = argv[++i];
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--tdd-dir":
        out.consortDir = argv[++i];
        break;
      case "--keep-branch":
        out.keepBranch = true;
        break;
      case "--purge-notes":
        out.purgeNotes = true;
        break;
      case "--json":
        out.json = true;
        break;
    }
  }
  return out;
}
var HELP = `consort-spike (throwaway spike branches)

Usage:
  consort-spike cut --slug <s> [--instance <i>] [--for <feature>] [--parent <b>] [--ttl <t>] [--project-dir <d>] [--json]
  consort-spike list [--project-dir <d>] [--json]
  consort-spike delete --slug <s> [--instance <i>] [--keep-branch] [--purge-notes] [--project-dir <d>]

A spike is throwaway exploration outside the TDD loop. --for <feature> tags the
notes so the learning carries forward into that feature's design-spec gate.

--instance / --host default from the project .env (LAKEBASE_PROJECT_ID / DATABRICKS_HOST),
so from inside a scaffolded project you can omit them. On delete, the notes are KEPT by
default (the learning survives the branch teardown); pass --purge-notes to also remove the
spike's .consort/spikes/<slug>/ dir for a full cleanup.
`;
function tddDirFor(args) {
  return args.consortDir ?? resolveConsortDir(args.projectDir ?? ".");
}
async function runSpikeCli(argv) {
  const sub = argv[0];
  if (!sub || sub === "-h" || sub === "--help") {
    process.stdout.write(HELP);
    return sub ? 0 : 2;
  }
  const args = parseArgs(argv.slice(1));
  const consortDir = tddDirFor(args);
  const envPath = path4.join(args.projectDir ?? process.cwd(), ".env");
  if (!args.instance) args.instance = readEnvVar(envPath, "LAKEBASE_PROJECT_ID");
  if (!args.host) args.host = readEnvVar(envPath, "DATABRICKS_HOST");
  const telemetry = sub === "cut" || sub === "delete" ? beginTelemetryRun({ command: "spike", onNotice: (m) => process.stderr.write(m) }) : void 0;
  const finishTel = (rc) => {
    try {
      telemetry?.finish({ outcome: rc === 0 ? "completed" : "error", exit_code: rc });
    } catch {
    }
    return rc;
  };
  try {
    if (sub === "cut") {
      if (!args.slug || !args.instance) {
        process.stderr.write("Error: cut requires --slug and --instance.\n");
        return finishTel(2);
      }
      const rec = await cutSpike({
        consortDir,
        projectDir: args.projectDir ?? process.cwd(),
        spikeSlug: args.slug,
        branch: `spike/${args.slug}`,
        parentBranch: args.parent,
        ttl: args.ttl,
        notes: spikeNotes(args.slug, args.forFeature),
        instance: args.instance,
        host: args.host
      });
      process.stdout.write(
        args.json ? `${JSON.stringify(rec)}
` : `consort-spike: cut ${rec.spike_slug} (branch ${rec.branch_id})${args.forFeature ? ` for ${args.forFeature}` : ""}
`
      );
      return finishTel(0);
    }
    if (sub === "list") {
      const spikes = listSpikes(consortDir);
      process.stdout.write(
        args.json ? `${JSON.stringify(spikes)}
` : spikes.length ? spikes.map((s) => `${s.spike_slug}	${s.branch_id}`).join("\n") + "\n" : "(no spikes)\n"
      );
      return finishTel(0);
    }
    if (sub === "delete") {
      if (!args.slug || !args.keepBranch && !args.instance) {
        process.stderr.write("Error: delete requires --slug (and --instance unless --keep-branch).\n");
        return finishTel(2);
      }
      await deleteSpike({
        consortDir,
        projectDir: args.projectDir ?? process.cwd(),
        spikeSlug: args.slug,
        deleteBranchToo: !args.keepBranch,
        purgeNotes: args.purgeNotes,
        instance: args.instance ?? "",
        host: args.host
      });
      const tail = [args.keepBranch ? "branch kept" : null, args.purgeNotes ? "notes purged" : "notes kept"].filter(Boolean).join(", ");
      process.stdout.write(`consort-spike: deleted ${args.slug} (${tail})
`);
      return finishTel(0);
    }
    process.stderr.write(`Error: unknown subcommand "${sub}".

${HELP}`);
    return finishTel(2);
  } catch (e) {
    process.stderr.write(`consort-spike: ${e instanceof Error ? e.message : String(e)}
`);
    return finishTel(7);
  }
}
if (isCliEntry(import.meta.url)) {
  runSpikeCli(process.argv.slice(2)).then((code) => process.exit(code));
}
export {
  runSpikeCli
};
//# sourceMappingURL=spike.cli.js.map