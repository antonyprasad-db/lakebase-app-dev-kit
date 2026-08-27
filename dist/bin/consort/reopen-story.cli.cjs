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

// consort/config/consort-paths.ts
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
function resolveConsortDir(projectDir = process.cwd()) {
  const next = (0, import_node_path.join)(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = (0, import_node_path.join)(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var featuresDir = (tdd) => (0, import_node_path.join)(tdd, "features");
var featureDir = (tdd, featureId) => (0, import_node_path.join)(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var storiesDir = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => (0, import_node_path.join)(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "story.json");
var acsDir = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "acs");
var storyTestListJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "test-list-per-story.json");
var storyPlanJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "plan.json");
var reflectVerdictJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "reflect-verdict.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}

// consort/gates/reopen-story.ts
var fs2 = __toESM(require("fs"), 1);
var import_node_path2 = require("path");
function reopenStoryForRedesign(consortDir, feature, story, opts = {}) {
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const storyRoot = storyResolved(consortDir, feature, story);
  const stamp = now().toISOString().replace(/[:.]/g, "-");
  const backupDir = (0, import_node_path2.join)(consortDir, `.backup-${(0, import_node_path2.basename)(storyRoot)}-redesign-${stamp}`);
  const cleared = [];
  const rel = (p) => p.slice(storyRoot.length).replace(/^[/\\]/, "") || (0, import_node_path2.basename)(p);
  const backup = (p) => {
    const dest = (0, import_node_path2.join)(backupDir, rel(p));
    fs2.mkdirSync((0, import_node_path2.dirname)(dest), { recursive: true });
    fs2.cpSync(p, dest, { recursive: true });
  };
  for (const p of [
    acsDir(consortDir, feature, story),
    storyTestListJson(consortDir, feature, story),
    reflectVerdictJson(consortDir, feature, story),
    storyPlanJson(consortDir, feature, story)
  ]) {
    if (!fs2.existsSync(p)) continue;
    backup(p);
    fs2.rmSync(p, { recursive: true, force: true });
    cleared.push(rel(p));
  }
  const sj = storyJson(consortDir, feature, story);
  if (fs2.existsSync(sj)) {
    try {
      const obj = JSON.parse(fs2.readFileSync(sj, "utf8"));
      if (Array.isArray(obj.acs) && obj.acs.length > 0) {
        backup(sj);
        fs2.writeFileSync(sj, JSON.stringify({ ...obj, acs: [] }, null, 2) + "\n");
        cleared.push(rel(sj) + " (acs[] emptied)");
      }
    } catch {
    }
  }
  return { backupDir, cleared };
}

// bin/consort/reopen-story.cli.ts
var import_util = require("@databricks-solutions/lakebase-scm-utils/util");
function parseArgs(argv) {
  const out = { reason: "reopened for redesign", projectDir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--story":
        out.story = argv[++i];
        break;
      case "--reason":
        out.reason = argv[++i];
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--tdd-dir":
      case "--consort-dir":
        out.consortDir = argv[++i];
        break;
      case "-h":
      case "--help":
        process.stdout.write(
          `consort-reopen-story , clear a story's design artifacts (backed up) so the drive re-authors it.

  consort-reopen-story --feature <F> --story <S> [--reason "<why>"]

Clears acs/, test-list-per-story.json, reflect-verdict.json, plan.json and empties story.json acs[]
so hasAcs=false and the Spec Author is re-dispatched. Backs everything up first. Does NOT touch the
gate or the experiment branch , it prints the full recovery sequence for those.
`
        );
        process.exit(0);
    }
  }
  return out;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.feature || !args.story) {
    process.stderr.write("consort-reopen-story: --feature and --story are required.\n");
    return 2;
  }
  const consortDir = args.consortDir ?? resolveConsortDir(args.projectDir);
  const res = reopenStoryForRedesign(consortDir, args.feature, args.story);
  if (!res.cleared.length) {
    process.stdout.write(`consort-reopen-story: ${args.story} had no design artifacts to clear (already needs design).
`);
    return 0;
  }
  process.stdout.write(`consort-reopen-story: reopened ${args.feature}/${args.story} for redesign.
`);
  process.stdout.write(`  cleared (backed up to ${res.backupDir}):
`);
  for (const c of res.cleared) process.stdout.write(`    - ${c}
`);
  process.stderr.write(
    "\nComplete the reopen (each is a separate, existing primitive , this only cleared the design artifacts):\n  1. Withdraw the spec gate if it was approved (drops the story from the build queue).\n  2. Discard the story's experiment branch if one exists , do NOT leave it orphaned.\n  3. Re-run the drive: hasAcs is now false, so it re-dispatches the Spec Author -> Architect -> DBA ->\n     Test Strategist -> reflect -> the spec gate (a genuine re-author, not a re-approval).\n"
  );
  return 0;
}
if ((0, import_util.isCliEntry)(importMetaUrl)) {
  main().then((code) => process.exit(code)).catch((e) => {
    process.stderr.write(`consort-reopen-story: ${e instanceof Error ? e.message : String(e)}
`);
    process.exit(1);
  });
}
//# sourceMappingURL=reopen-story.cli.cjs.map