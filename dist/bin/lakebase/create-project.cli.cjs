#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// consort/lakebase/create-project.ts
var import_lakebase = require("@databricks-solutions/lakebase-scm-utils/lakebase");

// consort/setup/project-consort-setup.ts
var fs4 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);
var import_node_url2 = require("url");

// consort/config/consort-paths.ts
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];

// consort/config/consort-config-file.ts
var import_fs = require("fs");
var import_path2 = require("path");

// consort/config/agent-models.ts
var import_path = require("path");
var RECOMMENDED_MODELS = {
  "spec-author": "opus",
  "architect-reviewer": "opus",
  dba: "opus",
  "test-strategist": "sonnet",
  "ux-designer": "sonnet",
  navigator: "sonnet",
  driver: "sonnet",
  "product-owner": "opus"
};
var ALL_AGENT_ROLES = Object.keys(RECOMMENDED_MODELS);
var AGENT_CONFIG_REL = (0, import_path.join)(".lakebase", "agent-config.json");

// consort/config/optimized-defaults.json
var optimized_defaults_default = {
  _comment: "Auto-applied optimization winners, deep-merged onto defaultSftddConfig()'s base. Written by optimize-apply (data, never a TS rewrite) so an unattended champion walk can bake each winner into the kit default; inlined into dist at build time. roles.<role>.{model,effort} may be a scalar or a per-turn/step map keyed by TurnKey (breakdown/acs/architect/dba/test-list/ux for design; red/green/review/refactor/assess/repair for build). Edit via the apply path, not by hand.",
  roles: {
    "spec-author": {
      model: {
        breakdown: "haiku"
      },
      effort: {
        breakdown: "low"
      }
    },
    "ux-designer": {
      model: "opus",
      effort: "low"
    }
  }
};

// consort/config/consort-config-file.ts
var CONSORT_CONFIG_REL = (0, import_path2.join)(".lakebase", "consort-config.json");
var LEGACY_CONFIG_RELS = [
  (0, import_path2.join)(".lakebase", "sftdd-config.json"),
  (0, import_path2.join)(".lakebase", "tdd-config.json")
];
var LEGACY_TDD_CONFIG_REL = LEGACY_CONFIG_RELS[0];
function defaultConsortConfig() {
  const roles = {};
  for (const role of ALL_AGENT_ROLES) {
    roles[role] = role === "navigator" ? { model: RECOMMENDED_MODELS[role], effort: { review: "low" } } : role === "driver" ? (
      // Model tiering: RED (test authoring) + GREEN (implementation) keep the
      // recommended model; only the mechanical REFACTOR turn drops to a fast
      // model. GREEN was on haiku, but the recorded worst GREEN turn thrashed
      // 93 tool round-trips (haiku's trial-and-error), so wall-clock, not token
      // cost, dominated. Sonnet finishes GREEN in far fewer round-trips, faster
      // even at a higher per-token price. Overridable per project by editing
      // consort-config.json (a project can flatten to a scalar `model`).
      { model: { red: RECOMMENDED_MODELS[role], green: RECOMMENDED_MODELS[role], refactor: "haiku" } }
    ) : (
      // Every other role's base is just its recommended model. Optimization
      // winners (e.g. spec-author breakdown -> haiku+low) are NOT hardcoded here;
      // they live in optimized-defaults.json and are deep-merged below, so the
      // champion walk's auto-apply is the single writer of applied winners.
      { model: RECOMMENDED_MODELS[role] }
    );
  }
  const base = {
    version: 1,
    roles,
    build: { loopGranularity: "story", batchCap: 3, sessionScope: "story" },
    plan: { sizing: true },
    project: { uiTrack: false, gates: "interactive", deployTarget: "local", clientFramework: "none" }
  };
  return mergeOptimizedDefaults(base, optimized_defaults_default);
}
function mergeOptimizedDefaults(base, overlay) {
  if (overlay === null || typeof overlay !== "object" || Array.isArray(overlay)) {
    return overlay === void 0 ? base : overlay;
  }
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (k === "_comment") continue;
    const b = out[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v) ? mergeOptimizedDefaults(b, v) : v;
  }
  return out;
}
function writeConsortConfig(projectDir, config, opts) {
  const f = (0, import_path2.join)(projectDir, CONSORT_CONFIG_REL);
  if ((0, import_fs.existsSync)(f) && !opts?.force) return false;
  (0, import_fs.mkdirSync)((0, import_path2.dirname)(f), { recursive: true });
  (0, import_fs.writeFileSync)(f, JSON.stringify(config, null, 2) + "\n");
  return true;
}

// consort/lakebase/adopt-consort.ts
var fs2 = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var import_node_url = require("url");

// consort/lakebase/update-agents.ts
var fs3 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);

// consort/setup/project-consort-setup.ts
var __dirname = path3.dirname((0, import_node_url2.fileURLToPath)(importMetaUrl));
function kitPackageName() {
  const candidates = [
    path3.resolve(__dirname, "../../package.json"),
    path3.resolve(__dirname, "../../../package.json")
  ];
  for (const c of candidates) {
    try {
      const name = JSON.parse(fs4.readFileSync(c, "utf8")).name;
      if (typeof name === "string" && name) return name;
    } catch {
    }
  }
  throw new Error(`could not resolve the kit package name; looked in: ${candidates.join(", ")}`);
}
function layDownTddScaffold(targetDir) {
  const kitPkgFile = path3.join(targetDir, ".lakebase", "kit-package");
  if (!fs4.existsSync(kitPkgFile)) {
    fs4.mkdirSync(path3.dirname(kitPkgFile), { recursive: true });
    fs4.writeFileSync(kitPkgFile, `${kitPackageName()}
`);
  }
  layDownKitClaudeAssets(targetDir);
  const candidates = [
    path3.resolve(__dirname, `../../templates/sftdd-bootstrap/${ARTIFACT_ROOT}`),
    path3.resolve(__dirname, `../../../templates/sftdd-bootstrap/${ARTIFACT_ROOT}`)
  ];
  const source = candidates.find((c) => fs4.existsSync(c));
  if (!source) {
    throw new Error(`sftdd-bootstrap template not found; looked in: ${candidates.join(", ")}`);
  }
  const dest = path3.join(targetDir, ARTIFACT_ROOT);
  if (fs4.existsSync(dest)) {
    return;
  }
  fs4.cpSync(source, dest, { recursive: true });
}
function resolveKitRoot() {
  const candidates = [
    path3.resolve(__dirname, "../.."),
    path3.resolve(__dirname, "../../..")
  ];
  for (const c of candidates) {
    if (fs4.existsSync(path3.join(c, "package.json")) && fs4.existsSync(path3.join(c, "skills", "consort", "agents"))) {
      return c;
    }
  }
  throw new Error(
    `could not resolve the kit root (package.json + skills/consort/agents); looked in: ${candidates.join(", ")}`
  );
}
function kitVersion(root) {
  try {
    return JSON.parse(fs4.readFileSync(path3.join(root, "package.json"), "utf8")).version ?? "";
  } catch {
    return "";
  }
}
function copyMissingMd(src, dest) {
  if (!fs4.existsSync(src)) return;
  fs4.mkdirSync(dest, { recursive: true });
  for (const entry of fs4.readdirSync(src)) {
    if (!entry.endsWith(".md")) continue;
    const d = path3.join(dest, entry);
    if (fs4.existsSync(d)) continue;
    fs4.copyFileSync(path3.join(src, entry), d);
  }
}
function layDownKitClaudeAssets(targetDir) {
  const root = resolveKitRoot();
  const claudeDir = path3.join(targetDir, ".claude");
  copyMissingMd(
    path3.join(root, "skills", "consort", "agents"),
    path3.join(claudeDir, "agents")
  );
  const skillsSrc = path3.join(root, "skills");
  if (fs4.existsSync(skillsSrc)) {
    for (const skill of fs4.readdirSync(skillsSrc).sort()) {
      if (!fs4.existsSync(path3.join(skillsSrc, skill, "SKILL.md"))) continue;
      const dest = path3.join(claudeDir, "skills", skill);
      if (fs4.existsSync(dest)) continue;
      fs4.mkdirSync(path3.dirname(dest), { recursive: true });
      fs4.cpSync(path3.join(skillsSrc, skill), dest, { recursive: true });
    }
  }
  const cmdSrc = path3.join(root, "templates", "project", "common", ".claude", "commands");
  if (fs4.existsSync(cmdSrc)) {
    const version = kitVersion(root);
    const cmdDest = path3.join(claudeDir, "commands");
    fs4.mkdirSync(cmdDest, { recursive: true });
    for (const entry of fs4.readdirSync(cmdSrc)) {
      if (!entry.endsWith(".md")) continue;
      const dest = path3.join(cmdDest, entry);
      if (fs4.existsSync(dest)) continue;
      const body = fs4.readFileSync(path3.join(cmdSrc, entry), "utf8").replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
      fs4.writeFileSync(dest, body);
    }
  }
}
var AGENT_SYNC_MARKER = path3.join(".claude", "agents", ".kit-version");
function seedConsortConfig(projectDir, opts) {
  const consortConfig = defaultConsortConfig();
  for (const [role, model] of Object.entries(opts.agentModels ?? {})) {
    if (model && consortConfig.roles?.[role]) {
      consortConfig.roles[role].model = model;
    }
  }
  if (consortConfig.project) {
    consortConfig.project.uiTrack = opts.uiTrack ?? false;
    consortConfig.project.clientFramework = opts.clientFramework;
  }
  writeConsortConfig(projectDir, consortConfig);
}
var kitConsortHooks = {
  layDownScaffold: layDownTddScaffold,
  seedConfig: seedConsortConfig
};

// consort/lakebase/create-project.ts
function createProject(input, progress) {
  return (0, import_lakebase.createProject)(
    { ...input, sftddHooks: input.sftddHooks ?? kitConsortHooks },
    progress
  );
}

// consort/lakebase/create-doctor-gate.ts
var import_lakebase2 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var CREATE_GATE_BLOCKING_CHECKS = /* @__PURE__ */ new Set([
  "databricks-cli",
  "databricks-auth",
  "workspace-identity",
  "lakebase-enabled",
  "node",
  "npm",
  "python",
  "gh"
]);
function blockingChecksForLanguage(language) {
  const set = new Set(CREATE_GATE_BLOCKING_CHECKS);
  if (language === "java" || language === "kotlin") set.add("jdk");
  return set;
}
async function runCreateDoctorGate(args) {
  const doctor = args.doctor ?? ((a) => (0, import_lakebase2.runHealthDoctor)(a));
  const report = await doctor({
    projectDir: args.parentDir,
    host: args.databricksHost,
    profile: args.profile
  });
  const blocking = blockingChecksForLanguage(args.language);
  const blockers = report.checks.filter(
    (c) => c.status === "fail" && blocking.has(c.name)
  );
  return { ok: blockers.length === 0, report, blockers };
}
function formatGateBlockers(blockers) {
  const lines = [
    "Environment preflight failed. Fix these before creating a project:",
    ""
  ];
  for (const b of blockers) {
    lines.push(`  \u2717 ${b.name}: ${b.message}`);
    if (b.hint) lines.push(`      \u2192 ${b.hint}`);
  }
  lines.push("");
  lines.push("Re-run `lakebase-doctor` to recheck, or pass --skip-doctor to bypass (not recommended).");
  return lines.join("\n");
}

// bin/lakebase/create-project.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--json-input":
        out.jsonInput = argv[++i];
        break;
      case "--project-name":
        out.projectName = argv[++i];
        break;
      case "--parent-dir":
        out.parentDir = argv[++i];
        break;
      case "--databricks-host":
        out.databricksHost = argv[++i];
        break;
      case "--github-owner":
        out.githubOwner = argv[++i];
        break;
      case "--no-github":
        out.createGithubRepo = false;
        break;
      case "--public":
        out.privateRepo = false;
        break;
      case "--language":
        out.language = argv[++i];
        break;
      case "--runner":
        out.runnerType = argv[++i];
        break;
      case "--tiers": {
        const v = Number.parseInt(argv[++i], 10);
        if (v !== 1 && v !== 2 && v !== 3) {
          process.stderr.write(
            `--tiers: expected 1, 2, or 3. Got: ${argv[i]}
  1 = prod only (features fork from prod)
  2 = prod + staging (features fork from staging)
  3 = prod + staging + dev (features fork from dev)
  Features are short-lived branches, NOT counted as tiers.
`
          );
          out.help = true;
        } else {
          out.tiers = v;
        }
        break;
      }
      case "--enable-e2e":
        out.enableE2e = true;
        break;
      case "--no-e2e":
        out.enableE2e = false;
        break;
      case "--enable-infra":
        out.enableInfra = true;
        break;
      case "--no-infra":
        out.enableInfra = false;
        break;
      case "--ui-track":
        out.uiTrack = true;
        break;
      case "--no-ui-track":
        out.uiTrack = false;
        break;
      case "--client":
        out.clientFramework = argv[++i];
        break;
      case "--skip-commands":
        out.skipCommands = true;
        break;
      case "--skip-doctor":
        out.skipDoctor = true;
        break;
      case "--agent-model": {
        const pair = argv[++i] ?? "";
        const eq = pair.indexOf("=");
        const role = eq >= 0 ? pair.slice(0, eq) : "";
        const model = eq >= 0 ? pair.slice(eq + 1) : "";
        if (!ALL_AGENT_ROLES.includes(role) || !model) {
          process.stderr.write(
            `--agent-model: expected <role>=<model> with a known role. Got: ${JSON.stringify(pair)}
  roles: ${ALL_AGENT_ROLES.join(", ")}
`
          );
          out.help = true;
        } else {
          (out.agentModels ??= {})[role] = model;
        }
        break;
      }
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        break;
    }
  }
  return out;
}
var HELP = `lakebase-create-project \u2013 bootstrap a fresh Lakebase-paired project

Usage:
  lakebase-create-project --project-name <name> --parent-dir <dir> --databricks-host <url> [--github-owner <owner>] [flags...]
  lakebase-create-project --json-input '{"projectName": "...", ...}'

Flags:
  --project-name      Project name (Lakebase id + local dir name)            [required]
  --parent-dir        Parent directory for the new project                   [required]
  --databricks-host   Databricks workspace URL                               [required]
  --github-owner      GitHub user/org for the repo                           [required unless --no-github]
  --no-github         Skip GitHub repo creation (local-only)
  --public            Make the GitHub repo public (default: private)
  --language          java | kotlin | python | nodejs    (default: java)
  --runner            self-hosted | github-hosted        (default: self-hosted)
  --tiers             1, 2, or 3. Tier count (features are NOT tiers).
                        1 = prod only           (features fork from prod)
                        2 = prod + staging      (features fork from staging)
                        3 = prod + staging + dev (features fork from dev)
                      When omitted, defaults to 1 (prod only, no extra tiers
                      cut). Architectural choice; surface this in your wizard
                      rather than picking silently.
  --enable-e2e        Force-enable Playwright E2E wire-up
  --no-e2e            Force-disable Playwright E2E wire-up
                      (default: on for --language nodejs, off otherwise)
  --enable-infra      Force-enable [Infra]-tag runner wire-up
  --no-infra          Force-disable [Infra]-tag runner wire-up
                      (default: on for --language nodejs, off otherwise)
  --ui-track          Mark the project as having a UI. The single source for the
  --no-ui-track       UX track: persists project.uiTrack (the drive reads it to
                      run the UX Designer + design-guide/IA + adherence gate) and,
                      when on, always wires the e2e harness. Default: off.
  --client            react | none. Frontend to scaffold under client/.
                      "react" lays down the first-class React + TS + Vite SPA
                      (Vitest + Testing Library + Playwright). Default: react
                      for a --ui-track project, none otherwise.
  --skip-commands     Skip scaffolding .claude/commands/{design,build}.md
                      (default: commands are written)
  --skip-doctor       Skip the environment preflight (lakebase-doctor) that
                      otherwise gates creation. Not recommended: a missing
                      prerequisite or a workspace without Lakebase then fails
                      partway through provisioning instead of up front.
  --agent-model       <role>=<model>, repeatable. Override a TDD role agent's
                      recommended model for this project (asked at setup; the
                      HIL's call). Roles: spec-author, architect-reviewer, dba,
                      test-strategist, ux-designer, navigator, driver,
                      product-owner. (release-engineer is deterministic, not a
                      tunable agent.) Omitted roles use their recommended model.
                      Persisted to .lakebase/agent-config.json.
  --json-input        Pass all args as a single JSON object (BDD harness)

Output: JSON on stdout (CreateProjectResult). Progress to stderr.
`;
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  let input;
  if (args.jsonInput) {
    try {
      input = JSON.parse(args.jsonInput);
    } catch (err) {
      process.stderr.write(`Failed to parse --json-input: ${err instanceof Error ? err.message : String(err)}
`);
      return 2;
    }
  } else {
    if (!args.projectName || !args.parentDir || !args.databricksHost) {
      process.stderr.write("Error: --project-name, --parent-dir, --databricks-host are required.\n\n" + HELP);
      return 2;
    }
    input = {
      projectName: args.projectName,
      parentDir: args.parentDir,
      databricksHost: args.databricksHost,
      githubOwner: args.githubOwner,
      createGithubRepo: args.createGithubRepo,
      privateRepo: args.privateRepo,
      language: args.language,
      runnerType: args.runnerType,
      tiers: args.tiers,
      enableE2e: args.enableE2e,
      enableInfra: args.enableInfra,
      uiTrack: args.uiTrack,
      clientFramework: args.clientFramework,
      skipCommands: args.skipCommands,
      agentModels: args.agentModels
    };
  }
  if (!args.skipDoctor) {
    process.stderr.write("[doctor] verifying environment before provisioning...\n");
    const gate = await runCreateDoctorGate({
      parentDir: input.parentDir,
      databricksHost: input.databricksHost,
      language: input.language
    });
    if (!gate.ok) {
      process.stderr.write("\n" + formatGateBlockers(gate.blockers) + "\n");
      return 2;
    }
    process.stderr.write("[doctor] environment ok\n");
  }
  const result = await createProject(input, (step, detail) => {
    process.stderr.write(`[${step}]${detail ? ` ${detail}` : ""}
`);
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return 0;
}
main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
);
//# sourceMappingURL=create-project.cli.cjs.map