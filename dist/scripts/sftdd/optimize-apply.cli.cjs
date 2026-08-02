#!/usr/bin/env node
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/sftdd/optimize-apply.cli.ts
var optimize_apply_cli_exports = {};
__export(optimize_apply_cli_exports, {
  parseApplyArgs: () => parseApplyArgs,
  readRecordedCandidate: () => readRecordedCandidate,
  roleFromHandoffId: () => roleFromHandoffId
});
module.exports = __toCommonJS(optimize_apply_cli_exports);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// scripts/sftdd/optimize-apply.cli.ts
var import_node_fs2 = require("fs");
var import_node_path2 = require("path");
var import_util = require("@databricks-solutions/lakebase-scm-utils/util");

// scripts/sftdd/optimize-apply.ts
var import_node_fs = require("fs");
var import_node_path = require("path");
function buildApplyPlan(role, candidate) {
  const plan = { role, agentMdEdits: [], sourceEdits: [], notes: [] };
  const content = candidate.content;
  if (content) {
    if (content.agentOverlay) {
      plan.agentMdEdits.push({ role, kind: "replace-file", value: content.agentOverlay.markdown });
    } else {
      if (content.taskSuffix && content.taskSuffix.trim()) {
        plan.agentMdEdits.push({ role, kind: "append-directive", value: content.taskSuffix.trim() });
      }
      if (content.allowedTools && content.allowedTools.length) {
        plan.agentMdEdits.push({ role, kind: "frontmatter-tools", value: content.allowedTools.join(", ") });
      }
    }
    if (content.contextPackSuffix && content.contextPackSuffix.trim()) {
      plan.notes.push(
        `contextPackSuffix won but is dynamic injected context, not a fixed directive; review whether to distill it into ${role}.md's standing guidance: "${content.contextPackSuffix.trim()}"`
      );
    }
    if (content.disallowedTools && content.disallowedTools.length) {
      plan.notes.push(
        `disallowedTools won ([${content.disallowedTools.join(", ")}]); the kit expresses tool scope as an ALLOW list in ${role}.md frontmatter, so translate this to the complementary allow-list before applying.`
      );
    }
  }
  const roles = candidate.configOverrides.roles ?? {};
  for (const [r, settings] of Object.entries(roles)) {
    if (!settings) continue;
    const model = settings.model;
    if (typeof model === "string") {
      plan.sourceEdits.push(modelDefaultEdit(r, void 0, model));
    } else if (model && typeof model === "object") {
      for (const [turn, m] of Object.entries(model)) plan.sourceEdits.push(modelDefaultEdit(r, turn, String(m)));
    }
    const effort = settings.effort;
    if (typeof effort === "string") {
      plan.sourceEdits.push(effortDefaultEdit(r, void 0, effort));
    } else if (effort && typeof effort === "object") {
      for (const [turn, e] of Object.entries(effort)) plan.sourceEdits.push(effortDefaultEdit(r, turn, String(e)));
    }
  }
  const build = candidate.configOverrides.build ?? {};
  if (build.sessionScope) plan.sourceEdits.push(buildDefaultEdit("sessionScope", build.sessionScope));
  if (build.loopGranularity) plan.sourceEdits.push(buildDefaultEdit("loopGranularity", build.loopGranularity));
  if (typeof build.batchCap === "number") plan.sourceEdits.push(buildDefaultEdit("batchCap", String(build.batchCap)));
  for (const [k, v] of Object.entries(candidate.env ?? {})) {
    plan.notes.push(`env lever ${k}=${v} won; persist it as the default in the code path that reads ${k} (or the config default it backs).`);
  }
  return plan;
}
function modelDefaultEdit(role, turn, model) {
  const where = turn ? `roles.${role}.model.${turn}` : `roles.${role}.model`;
  return {
    file: "scripts/sftdd/sftdd-config.ts",
    rationale: `defaultSftddConfig: set ${where} -> "${model}" (and mirror the role's frontmatter model: in skills/consort/agents/${role}.md + RECOMMENDED_MODELS in agent-models.ts if the BASE model changed).`,
    regressionTest: `assert resolveSftddSettings().modelFor("${role}"${turn ? `, "${turn}"` : ""}) === "${model}" with no project override.`
  };
}
function effortDefaultEdit(role, turn, effort) {
  const where = turn ? `roles.${role}.effort.${turn}` : `roles.${role}.effort`;
  return {
    file: "scripts/sftdd/sftdd-config.ts",
    rationale: `defaultSftddConfig / defaultEffort: set ${where} -> "${effort}".`,
    regressionTest: `assert resolveSftddSettings().effortFor("${role}"${turn ? `, "${turn}"` : ""}) === "${effort}" with no project override.`
  };
}
function buildDefaultEdit(key, value) {
  return {
    file: "scripts/sftdd/sftdd-config.ts",
    rationale: `defaultSftddConfig: set build.${key} -> ${JSON.stringify(value)}.`,
    regressionTest: `assert resolveSftddSettings().build.${key} === ${JSON.stringify(value)} with no project override.`
  };
}
function splitFrontmatter(md) {
  const m = md.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  return m ? { fm: m[1], body: m[2] } : { fm: "", body: md };
}
function applyAgentMdLevers(kitDir, plan) {
  const changed = /* @__PURE__ */ new Set();
  for (const edit of plan.agentMdEdits) {
    const rel = (0, import_node_path.join)("skills", "consort", "agents", `${edit.role}.md`);
    const path = (0, import_node_path.join)(kitDir, rel);
    if (edit.kind === "replace-file") {
      (0, import_node_fs.writeFileSync)(path, edit.value);
      changed.add(`${edit.role}.md`);
      continue;
    }
    if (!(0, import_node_fs.existsSync)(path)) throw new Error(`optimize-apply: cannot edit missing role definition ${rel}`);
    const md = (0, import_node_fs.readFileSync)(path, "utf8");
    if (edit.kind === "append-directive") {
      const next = md.endsWith("\n") ? `${md}
${edit.value}
` : `${md}

${edit.value}
`;
      (0, import_node_fs.writeFileSync)(path, next);
      changed.add(`${edit.role}.md`);
    } else if (edit.kind === "frontmatter-tools") {
      const { fm, body } = splitFrontmatter(md);
      if (!fm) throw new Error(`optimize-apply: ${rel} has no frontmatter to set tools: on`);
      const nextFm = /(^|\n)tools:.*(\n)/.test(fm) ? fm.replace(/(^|\n)tools:.*(\n)/, `$1tools: ${edit.value}$2`) : fm.replace(/\n---\n$/, `
tools: ${edit.value}
---
`);
      (0, import_node_fs.writeFileSync)(path, nextFm + body);
      changed.add(`${edit.role}.md`);
    }
  }
  return [...changed];
}
function formatApplyPlan(plan) {
  const lines = [`# Apply plan for role: ${plan.role}`, ""];
  if (plan.agentMdEdits.length) {
    lines.push("## Direct agent-.md edits (applied on approval)");
    for (const e of plan.agentMdEdits) {
      lines.push(`- ${e.kind}: ${e.kind === "replace-file" ? "(full role definition)" : e.value}`);
    }
    lines.push("");
  }
  if (plan.sourceEdits.length) {
    lines.push("## REVIEW , typed-source edits (I make these as normal reviewed edits, not auto-regex)");
    for (const s of plan.sourceEdits) {
      lines.push(`- ${s.file}: ${s.rationale}`);
      lines.push(`    regression test: ${s.regressionTest}`);
    }
    lines.push("");
  }
  if (plan.notes.length) {
    lines.push("## Notes");
    for (const n of plan.notes) lines.push(`- ${n}`);
    lines.push("");
  }
  if (!plan.agentMdEdits.length && !plan.sourceEdits.length && !plan.notes.length) {
    lines.push("(baseline won , nothing to persist)");
  }
  return lines.join("\n") + "\n";
}

// scripts/sftdd/optimize-apply.cli.ts
function parseApplyArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case "--project-dir":
        out.projectDir = next();
        break;
      case "--handoff":
        out.handoff = next();
        break;
      case "--candidate":
        out.candidate = next();
        break;
      case "--kit-dir":
        out.kitDir = next();
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
    }
  }
  return out;
}
function readRecordedCandidate(experimentsDir, handoff, candidateId) {
  const candDir = (0, import_node_path2.join)(experimentsDir, handoff, candidateId);
  if (!(0, import_node_fs2.existsSync)(candDir)) throw new Error(`optimize-apply: no recorded candidate at ${candDir} (run the sweep first)`);
  const trials = (0, import_node_fs2.readdirSync)(candDir).filter((d) => d.startsWith("trial-")).sort();
  if (trials.length === 0) throw new Error(`optimize-apply: no trials recorded under ${candDir}`);
  const file = (0, import_node_path2.join)(candDir, trials[0], "candidate.json");
  if (!(0, import_node_fs2.existsSync)(file)) throw new Error(`optimize-apply: missing ${file}`);
  return JSON.parse((0, import_node_fs2.readFileSync)(file, "utf8"));
}
function roleFromHandoffId(handoffId) {
  const KNOWN = ["spec-author", "architect-reviewer", "test-strategist", "ux-designer", "product-owner", "navigator", "driver", "dba"];
  for (const r of KNOWN) {
    if (handoffId === r || handoffId.endsWith(`-${r}`) || handoffId.includes(`-${r}-`)) return r;
  }
  const parts = handoffId.split("-");
  return parts[parts.length - 1];
}
function defaultKitDir() {
  return (0, import_node_path2.resolve)(new URL("../..", importMetaUrl).pathname);
}
async function main() {
  const args = parseApplyArgs(process.argv.slice(2));
  if (!args.projectDir || !args.handoff || !args.candidate) {
    process.stderr.write("usage: lakebase-sftdd-optimize-apply --project-dir <dir> --handoff <id> --candidate <id> [--kit-dir <dir>] [--dry-run]\n");
    return 2;
  }
  const projectDir = (0, import_node_path2.resolve)(args.projectDir);
  const kitDir = args.kitDir ? (0, import_node_path2.resolve)(args.kitDir) : defaultKitDir();
  const experimentsDir = (0, import_node_path2.join)(projectDir, "experiments");
  const role = roleFromHandoffId(args.handoff);
  const candidate = readRecordedCandidate(experimentsDir, args.handoff, args.candidate);
  const plan = buildApplyPlan(role, candidate);
  process.stdout.write(formatApplyPlan(plan));
  if (args.dryRun) {
    process.stderr.write("[optimize-apply] --dry-run: no files written.\n");
    return 0;
  }
  const changed = applyAgentMdLevers(kitDir, plan);
  if (changed.length) {
    process.stderr.write(`[optimize-apply] applied agent-.md levers to: ${changed.join(", ")} (in ${kitDir}). Review + commit locally.
`);
  } else {
    process.stderr.write("[optimize-apply] no direct agent-.md levers to apply.\n");
  }
  if (plan.sourceEdits.length) {
    process.stderr.write(
      `[optimize-apply] ${plan.sourceEdits.length} typed-source default(s) to change (model/effort/scope/loop) , these are printed above for a REVIEWED edit, not auto-written. Make them + their regression test, then commit.
`
    );
  }
  return 0;
}
if ((0, import_util.isCliEntry)(importMetaUrl)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
      process.exit(1);
    }
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  parseApplyArgs,
  readRecordedCandidate,
  roleFromHandoffId
});
//# sourceMappingURL=optimize-apply.cli.cjs.map